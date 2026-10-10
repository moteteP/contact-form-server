'use strict';

const { randomUUID } = require('node:crypto');
const express = require('express');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');

const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f]/;
const MESSAGE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const validEmail = value => typeof value === 'string' && value.length <= 254 && EMAIL.test(value);

function settings(env) {
  const config = {
    apiKey: String(env.RESEND_API_KEY || '').trim(),
    from: String(env.CONTACT_FROM || '').trim(),
    to: String(env.CONTACT_TO || '').trim(),
    confirmation: env.SEND_CONFIRMATION === 'true',
    origins: String(env.ALLOWED_ORIGINS || 'https://port.alvarezsm.com').split(',').map(value => value.trim()).filter(Boolean)
  };
  const hourly = Number(env.MAX_MESSAGES_PER_HOUR || 25);
  config.hourly = Number.isInteger(hourly) && hourly >= 1 && hourly <= 1000 ? hourly : 25;
  config.configured = /^re_[A-Za-z0-9_-]+$/.test(config.apiKey) && validEmail(config.from) && validEmail(config.to);
  return config;
}

function parseInput(body) {
  if (!body || Array.isArray(body) || !['name', 'email', 'message'].every(key => typeof body[key] === 'string')) return null;
  if (body.honeypot !== undefined && (typeof body.honeypot !== 'string' || body.honeypot.trim())) return null;
  const name = body.name.trim();
  const email = body.email.trim();
  const message = body.message.trim().replace(/\r\n?/g, '\n');
  if (name.length < 2 || name.length > 120 || SINGLE_LINE_CONTROL.test(name) || !validEmail(email) || message.length < 10 || message.length > 5000 || MESSAGE_CONTROL.test(message)) return null;
  if (body.submission_id !== undefined && (typeof body.submission_id !== 'string' || !UUID.test(body.submission_id))) return null;
  if (body.language !== undefined && !['en', 'es', 'fr'].includes(body.language)) return null;
  if (body.submitted_at !== undefined) {
    if (typeof body.submitted_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.submitted_at)) return null;
    const date = new Date(body.submitted_at);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== body.submitted_at) return null;
  }
  return { name, email, message, language: body.language || 'en', id: body.submission_id || randomUUID(), submittedAt: body.submitted_at || null };
}

const { makeEmails } = require('./email-templates');

class DeliveryError extends Error {
  constructor(code, status = 0) { super(code); this.code = code; this.status = status; }
}

function createMailSender(apiKey, fetchImpl = globalThis.fetch, timeoutMs = 15000) {
  return async function sendEmail(payload, idempotencyKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new DeliveryError('PROVIDER_REJECTED', response.status);
      let result;
      try { result = await response.json(); } catch (_) { throw new DeliveryError('DELIVERY_UNCONFIRMED'); }
      if (!result || typeof result.id !== 'string' || !result.id) throw new DeliveryError('DELIVERY_UNCONFIRMED');
      return result.id;
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
      // Do not log raw provider errors, credentials or message contents.
      throw new DeliveryError(controller.signal.aborted ? 'PROVIDER_TIMEOUT' : 'DELIVERY_UNCONFIRMED');
    } finally { clearTimeout(timeout); }
  };
}

function createApp(options = {}) {
  const env = options.env || process.env;
  const config = settings(env);
  const send = options.sendEmail || createMailSender(config.apiKey);
  const logger = options.logger || console;
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY === '1' || env.RENDER === 'true' ? 1 : false);
  app.use((_request, response, next) => {
    response.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.origins.includes(origin)) return callback(null, true);
      const error = new Error('ORIGIN_DENIED'); error.status = 403; callback(error);
    },
    methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Accept'], maxAge: 600
  }));
  // Liveness/configuration only: this route does not send email or verify DNS/API credentials.
  app.get('/health', (_request, response) => response.json({ ok: true, service: 'portfolio-contact', version: '2.1.0', provider: 'resend', configured: config.configured }));

  const perIp = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { ok: false, code: 'RATE_LIMITED' }
  });
  const acrossClients = rateLimit({
    windowMs: 60 * 60 * 1000, limit: config.hourly, keyGenerator: () => 'contact-service',
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { ok: false, code: 'SERVICE_BUSY' }
  });

  app.post('/send-email', perIp, (request, response, next) => {
    if (!request.is(['application/json', 'application/x-www-form-urlencoded'])) return response.status(415).json({ ok: false, code: 'INVALID_REQUEST' });
    next();
  }, express.json({ limit: '64kb' }), express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 12 }), (request, response, next) => {
    const input = parseInput(request.body);
    if (!input) return response.status(400).json({ ok: false, code: 'INVALID_INPUT' });
    if (!config.configured) return response.status(503).json({ ok: false, code: 'NOT_CONFIGURED' });
    response.locals.contact = input;
    next();
  }, acrossClients, async (_request, response) => {
    const input = response.locals.contact;
    const emails = makeEmails(input, config);
    try {
      await send(emails.primary, `portfolio-owner/${input.id}`);
    } catch (error) {
      const code = error instanceof DeliveryError ? error.code : 'DELIVERY_UNCONFIRMED';
      const providerStatus = error instanceof DeliveryError ? error.status : 0;
      logger.warn('Contact primary failed', { code, providerStatus });
      if ([401, 403].includes(providerStatus)) return response.status(503).json({ ok: false, code: 'NOT_CONFIGURED' });
      if (providerStatus === 429) return response.status(503).json({ ok: false, code: 'SERVICE_BUSY' });
      const uncertain = code !== 'PROVIDER_REJECTED' || providerStatus === 409 || providerStatus >= 500;
      return response.status(code === 'PROVIDER_TIMEOUT' ? 504 : 502).json({ ok: false, code: uncertain ? 'DELIVERY_UNCONFIRMED' : 'DELIVERY_FAILED' });
    }

    // The primary message is already accepted. A receipt failure must never report total failure.
    let confirmation = 'disabled';
    if (config.confirmation) {
      try {
        await send(emails.receipt, `portfolio-receipt/${input.id}`);
        confirmation = 'accepted';
      } catch (_) {
        confirmation = 'failed';
        logger.warn('Contact receipt failed; primary message already accepted.');
      }
    }
    response.status(200).json({ ok: true, confirmation });
  });

  app.use((_request, response) => response.status(404).json({ ok: false, code: 'NOT_FOUND' }));
  app.use((error, _request, response, _next) => {
    const status = error.status === 403 ? 403 : error.status === 413 ? 413 : error.status === 415 ? 415 : 400;
    response.status(status).json({ ok: false, code: status === 403 ? 'ORIGIN_DENIED' : 'INVALID_REQUEST' });
  });
  return app;
}

module.exports = { createApp, createMailSender, DeliveryError, settings, makeEmails, parseInput };

if (require.main === module) {
  // Native Node loading; values already supplied by Render take precedence.
  try { process.loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT configuration.');
  if (!settings(process.env).configured) console.warn('Contact mail is not configured. Set RESEND_API_KEY, CONTACT_FROM and CONTACT_TO.');
  const server = createApp().listen(port, '0.0.0.0', () => console.log(`Portfolio contact v2 / Resend listening on port ${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 35000).unref();
  });
}
