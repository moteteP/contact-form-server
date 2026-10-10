'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createApp, createMailSender, DeliveryError, settings } = require('../server');

// No real credentials. Every email transport in this suite is a local fake.
const env = {
  RESEND_API_KEY: 're_test_only_not_a_real_key', CONTACT_FROM: 'contact@mail.example.com',
  CONTACT_TO: 'owner@example.com', ALLOWED_ORIGINS: 'https://port.alvarezsm.com',
  SEND_CONFIRMATION: 'true'
};
const valid = () => ({ name: 'Visitor Example', email: 'visitor@example.com', message: 'A local test of the contact service.', honeypot: '', language: 'es', submission_id: randomUUID() });
async function fixture(t, overrides = {}) {
  const calls = [], logs = [];
  const app = createApp({ env, sendEmail: async (payload, key) => { calls.push({ payload, key }); return 'fake-accepted-id'; },
    logger: { warn: (...args) => logs.push(args) }, ...overrides });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body = valid(), headers = {}) => fetch(base + '/send-email', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://port.alvarezsm.com', ...headers }, body: JSON.stringify(body)
  });
  return { base, post, calls, logs, app };
}

test('health is non-sending liveness/configuration, not a claim of delivery', async t => {
  const { base, calls } = await fixture(t);
  const response = await fetch(base + '/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'portfolio-contact', version: '2.0.0', provider: 'resend', configured: true });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(calls.length, 0);
  assert.equal((await fetch(base + '/.env')).status, 404);
});

test('a valid form uses the verified sender, visitor reply-to and separate receipt key', async t => {
  const { base, calls } = await fixture(t);
  const body = valid();
  const response = await fetch(base + '/send-email', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGINS, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, confirmation: 'accepted' });
  assert.equal(response.headers.get('access-control-allow-origin'), env.ALLOWED_ORIGINS);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.from, 'AlvarezSM | Portfolio <contact@mail.example.com>');
  assert.deepEqual(calls[0].payload.to, ['owner@example.com']);
  assert.equal(calls[0].payload.reply_to, body.email);
  assert.equal(calls[0].key, 'portfolio-owner/' + body.submission_id);
  assert.equal(calls[1].key, 'portfolio-receipt/' + body.submission_id);
  assert.equal(calls[1].payload.reply_to, env.CONTACT_TO);
  assert.equal(calls[1].payload.subject, 'Gracias por tu mensaje');
});

test('user HTML is escaped, and receipts never echo user-supplied text or links', async t => {
  const { post, calls } = await fixture(t);
  const body = { ...valid(), name: '<b>Visitor & Co</b>', message: '<img src=x onerror=alert(1)>\nAn enquiry & more.' };
  assert.equal((await post(body)).status, 200);
  assert(calls[0].payload.html.includes('&lt;img src=x onerror=alert(1)&gt;<br>'));
  assert(calls[0].payload.html.includes('&lt;b&gt;Visitor &amp; Co&lt;/b&gt;'));
  assert(!calls[0].payload.html.includes('<img src=x'));
  assert(!calls[1].payload.html.includes('onerror'));
  assert(!calls[1].payload.text.includes(body.message));
});

test('receipt failure is still success; no false total failure or private data in logs', async t => {
  let count = 0;
  const { post, logs } = await fixture(t, { sendEmail: async () => { if (++count === 2) throw Error('private provider details'); return 'accepted'; } });
  const response = await post();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, confirmation: 'failed' });
  assert(!JSON.stringify(logs).includes('private provider details'));
});

test('receipt is optional; old clients without submission id/language still work', async t => {
  const { post, calls } = await fixture(t, { env: { ...env, SEND_CONFIRMATION: 'false' } });
  const body = valid(); delete body.language; delete body.submission_id;
  const response = await post(body);
  assert.deepEqual(await response.json(), { ok: true, confirmation: 'disabled' });
  assert.equal(calls.length, 1);
  assert.match(calls[0].key, /^portfolio-owner\/[a-f0-9-]{36}$/);
});

test('validation rejects unsafe, missing and malformed fields without sending', async t => {
  const cases = [null, [], {}, { name: ['Visitor'] }, { name: 'x' }, { name: 'A\r\nB' }, { name: 'x'.repeat(121) },
    { email: 'not-email' }, { email: 'a@b.example\r\nBCC:x@y.example' }, { email: 'bad..domain@example..com' },
    { message: 'short' }, { message: 'x'.repeat(5001) }, { message: 'message with a null\0' },
    { honeypot: 'bot' }, { honeypot: [] }, { language: 'invalid' }, { language: {} }, { submission_id: 'not-uuid' }];
  for (const [index, change] of cases.entries()) await t.test(String(index), async child => {
    const { post, calls } = await fixture(child);
    const body = change === null || Array.isArray(change) || Object.keys(change).length === 0 ? change : { ...valid(), ...change };
    assert.equal((await post(body)).status, 400);
    assert.equal(calls.length, 0);
  });
});

test('JSON syntax, payload size and content type have bounded errors', async t => {
  const { base, calls } = await fixture(t);
  for (const [body, type, expected] of [['{bad', 'application/json', 400], ['x'.repeat(70000), 'application/json', 413], ['text', 'text/plain', 415]]) {
    const response = await fetch(base + '/send-email', { method: 'POST', headers: { 'Content-Type': type }, body });
    assert.equal(response.status, expected);
    assert.equal((await response.json()).ok, false);
  }
  assert.equal(calls.length, 0);
});

test('maximum-length non-ASCII message fits the form body limit', async t => {
  const { base } = await fixture(t);
  const response = await fetch(base + '/send-email', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...valid(), message: '界'.repeat(5000) }) });
  assert.equal(response.status, 200);
});

test('CORS denies foreign origins; preflights do not consume the submission quota', async t => {
  const { base, post, calls } = await fixture(t);
  assert.equal((await post(valid(), { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await post(valid(), { Origin: 'null' })).status, 403);
  for (let index = 0; index < 7; index++) {
    const response = await fetch(base + '/send-email', { method: 'OPTIONS', headers: { Origin: env.ALLOWED_ORIGINS, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    assert.equal(response.status, 204);
  }
  for (let index = 0; index < 5; index++) assert.equal((await post()).status, 200);
  const limited = await post();
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).code, 'RATE_LIMITED');
  assert(limited.headers.get('retry-after'));
  assert.equal(calls.length, 10);
});

test('Render proxy accounting separates IPs; extra service-wide quota bounds volume', async t => {
  const { post, app } = await fixture(t, { env: { ...env, RENDER: 'true', MAX_MESSAGES_PER_HOUR: '2' } });
  assert.equal(app.get('trust proxy'), 1);
  assert.equal((await post(valid(), { 'X-Forwarded-For': '198.51.100.1' })).status, 200);
  assert.equal((await post(valid(), { 'X-Forwarded-For': '198.51.100.2' })).status, 200);
  const response = await post(valid(), { 'X-Forwarded-For': '198.51.100.3' });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'SERVICE_BUSY');
});

test('configuration is checked before any provider request', async t => {
  const { post, base, calls } = await fixture(t, { env: {} });
  assert.equal((await (await fetch(base + '/health')).json()).configured, false);
  const response = await post();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'NOT_CONFIGURED');
  assert.equal(calls.length, 0);
  assert.equal(settings({ ...env, CONTACT_FROM: 'bad\nemail@example.com' }).configured, false);
});

test('provider failures distinguish rejection from unconfirmed delivery', async t => {
  const cases = [
    [new DeliveryError('PROVIDER_REJECTED', 403), 503, 'NOT_CONFIGURED'],
    [new DeliveryError('PROVIDER_REJECTED', 429), 503, 'SERVICE_BUSY'],
    [new DeliveryError('PROVIDER_REJECTED', 422), 502, 'DELIVERY_FAILED'],
    [new DeliveryError('PROVIDER_REJECTED', 500), 502, 'DELIVERY_UNCONFIRMED'],
    [new DeliveryError('PROVIDER_REJECTED', 409), 502, 'DELIVERY_UNCONFIRMED'],
    [new DeliveryError('PROVIDER_TIMEOUT'), 504, 'DELIVERY_UNCONFIRMED'],
    [new Error('secret provider details'), 502, 'DELIVERY_UNCONFIRMED']
  ];
  for (const [error, expectedStatus, expectedCode] of cases) await t.test(expectedCode + '/' + error.status, async child => {
    let attempts = 0;
    const { post, logs } = await fixture(child, { sendEmail: async () => { attempts++; throw error; } });
    const response = await post();
    assert.equal(response.status, expectedStatus);
    assert.equal((await response.json()).code, expectedCode);
    assert.equal(attempts, 1);
    assert(!JSON.stringify(logs).includes('secret provider details'));
  });
});

test('unchanged retry has identical payloads and idempotency keys, including after restart', async t => {
  const input = valid();
  const a = await fixture(t), b = await fixture(t);
  await a.post(input); await a.post(input); await b.post(input);
  assert.deepEqual(a.calls.slice(0, 2), a.calls.slice(2, 4));
  assert.deepEqual(a.calls.slice(0, 2), b.calls);
});

test('HTTPS adapter uses Resend API, bearer auth and idempotency header', async () => {
  let captured;
  const send = createMailSender(env.RESEND_API_KEY, async (url, options) => { captured = { url, options }; return Response.json({ id: 'fake-provider-id' }); });
  assert.equal(await send({ text: 'local test' }, 'owner/test'), 'fake-provider-id');
  assert.equal(captured.url, 'https://api.resend.com/emails');
  assert.equal(captured.options.headers.Authorization, 'Bearer ' + env.RESEND_API_KEY);
  assert.equal(captured.options.headers['Idempotency-Key'], 'owner/test');
  assert.equal(captured.options.redirect, 'error');
  assert.equal(captured.options.method, 'POST');
});

test('HTTPS adapter rejects error/malformed responses and aborts stalled requests', async () => {
  for (const response of [Response.json({ message: 'private failure' }, { status: 403 }), Response.json({}), new Response('not json')]) {
    const send = createMailSender('fake', async () => response);
    await assert.rejects(send({}, 'test'), error => error instanceof DeliveryError && !error.message.includes('private'));
  }
  const send = createMailSender('fake', (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })), 20);
  await assert.rejects(send({}, 'test'), error => error.code === 'PROVIDER_TIMEOUT');
});
