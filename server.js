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
const escapeHtml = value => value.replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));

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
  return { name, email, message, language: body.language || 'en', id: body.submission_id || randomUUID() };
}

function emailFrame(title, content, language = 'en') {
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#edf2f1;color:#14232b;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #d8e3df;border-radius:16px">
<tr><td style="padding:28px;background:#0b141c;color:#76dfc1;border-radius:16px 16px 0 0;font-size:12px;font-weight:bold;letter-spacing:3px">ALVAREZSM / PORTFOLIO</td></tr>
<tr><td style="padding:28px;font-size:16px;line-height:1.7"><h1 style="margin:0 0 22px;font-size:28px;line-height:1.2;letter-spacing:-1px">${title}</h1>${content}</td></tr>
<tr><td style="padding:20px 28px;border-top:1px solid #d8e3df;font-size:12px;line-height:1.7;color:#52646d">Pedro Alvarez · Front-end development<br><a href="https://port.alvarezsm.com" style="color:#176b59">Portfolio</a> · <a href="https://port.alvarezsm.com/privacy-policy.html" style="color:#176b59">Privacy Policy</a></td></tr>
</table></td></tr></table></body></html>`;
}

function makeEmails(input, config) {
  const from = `AlvarezSM | Portfolio <${config.from}>`;
  const primary = {
    from, to: [config.to], reply_to: input.email,
    subject: 'New portfolio contact message',
    text: `Name: ${input.name}\nEmail: ${input.email}\n\n${input.message}`,
    html: emailFrame('A new conversation.', `<p><strong>Name:</strong> ${escapeHtml(input.name)}<br><strong>Email:</strong> ${escapeHtml(input.email)}</p><div style="padding:20px;background:#f1f7f4;border-left:3px solid #24866d;overflow-wrap:anywhere">${escapeHtml(input.message).replace(/\n/g, '<br>')}</div>`)
  };
  const receiptCopy = {
    en: { subject: 'Thank you for your message', title: 'Let’s make it happen.', body: 'Thank you for contacting me. Your message has been submitted successfully. I’ll get back to you at this email address.', note: 'If you did not submit a portfolio enquiry, you can ignore this email.' },
    es: { subject: 'Gracias por tu mensaje', title: 'Hagámoslo realidad.', body: 'Gracias por contactar conmigo. Tu mensaje se ha enviado correctamente. Te responderé a esta dirección de correo.', note: 'Si no has enviado una consulta desde el portfolio, puedes ignorar este correo.' },
    fr: { subject: 'Merci pour votre message', title: 'Donnons-lui vie.', body: 'Merci de m’avoir contacté. Votre message a bien été soumis. Je vous répondrai à cette adresse e-mail.', note: 'Si vous n’avez pas envoyé de demande depuis le portfolio, vous pouvez ignorer cet e-mail.' }
  }[input.language];
  // Do not echo untrusted names, links or messages into an automatic email to a visitor.
  const receipt = {
    from, to: [input.email], reply_to: config.to,
    subject: receiptCopy.subject,
    text: `${receiptCopy.body}\n\nPedro Alvarez\nhttps://port.alvarezsm.com\n\n${receiptCopy.note}`,
    html: emailFrame(receiptCopy.title, `<p>${receiptCopy.body}</p><p>Pedro Alvarez</p><p style="font-size:12px;color:#52646d">${receiptCopy.note}</p>`, input.language)
  };
  return { primary, receipt };
}

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
  app.get('/health', (_request, response) => response.json({ ok: true, service: 'portfolio-contact', version: '2.0.0', provider: 'resend', configured: config.configured }));

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
