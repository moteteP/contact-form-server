# AlvarezSM contact service 2.1.0 — Resend HTTPS

Node.js 22, Express 5. Replaces the old SMTP transport while preserving `POST /send-email`.

## Configuration

Set these in Render Environment (use `.env.example` only as a local template):

- `RESEND_API_KEY`: private sending key.
- `CONTACT_FROM`: bare email address on your verified Resend domain/subdomain.
- `CONTACT_TO`: existing destination inbox; a single bare email address.
- `ALLOWED_ORIGINS`: comma-separated exact origins, default `https://port.alvarezsm.com`.
- `SEND_CONFIRMATION=true`: opt in to the visitor receipt. Default is off if unset.
- `TRUST_PROXY=1`: use only behind the expected single trusted proxy, such as the direct Render endpoint. Default is false outside Render; `RENDER=true` also selects one hop.
- `MAX_MESSAGES_PER_HOUR`: optional per-instance service-wide submission cap, default 25. Per-client cap is five attempts per 15 minutes.

Render build: `npm ci --omit=dev`. Start: `npm start`. Set `NODE_VERSION=22` to override old service settings. Let Render supply `PORT`; the server binds `0.0.0.0`.

For local work, use Node 22, `npm ci`, then `npm test`. The test suite uses fake transports and never sends email. `npm start` loads a local `.env` using Node's native loader; existing environment variables take precedence. Add your explicit localhost origin to `ALLOWED_ORIGINS` for browser testing.

## API

`GET /health`: version, provider and syntactic configuration status. HTTP 200 is a liveness check, not proof of a valid provider key or inbox delivery.

`POST /send-email`: JSON or URL-encoded body, maximum 64 KiB:

```json
{
  "name": "Visitor Example",
  "email": "visitor@example.com",
  "message": "A message of between 10 and 5000 characters.",
  "honeypot": "",
  "language": "en",
  "submission_id": "2f6e2c1a-5f23-4c11-9589-47e92fce9e54",
  "submitted_at": "2026-10-10T09:04:00.000Z"
}
```

`language` is optional (`en`, `es`, `fr`). `submission_id` is an optional UUID v4 for old-client compatibility. New clients must reuse it for unchanged retries. Missing IDs get a fresh server UUID and do not protect retries.

`submitted_at` is optional for legacy clients, and must be a canonical UTC ISO timestamp with milliseconds when supplied. It is the browser's initial submission time, not an independently verified server receipt time. New clients retain the same timestamp, language and UUID on an unchanged retry. The templates display the timestamp in Europe/Paris, with automatic daylight-saving handling. When it is absent, the template refers to the email header instead of inventing a time.

Templates live in `email-templates.js`. Commit `assets/pa-logo.png` alongside it: it is embedded as a base64 CID attachment, using the Resend REST `content_id` field. There is no external logo request. The display name is AlvarezSM; no owner's personal name is hardcoded. The owner notification retains visitor details; the localized visitor receipt does not repeat their name, email or message. The short reference is a convenience label, not an authentication token or guaranteed-unique database key.

Success: `200 {"ok":true,"confirmation":"accepted"}`. Confirmation may instead be `disabled` or `failed`; the main message has still been accepted by Resend. Acceptance is not a delivery guarantee.

Errors use `{ "ok": false, "code": "..." }`: `INVALID_INPUT`, `INVALID_REQUEST`, `ORIGIN_DENIED`, `RATE_LIMITED`, `SERVICE_BUSY`, `NOT_CONFIGURED`, `DELIVERY_FAILED`, `DELIVERY_UNCONFIRMED`, `NOT_FOUND`.

## Design notes

- Native `fetch` calls the [Resend REST API](https://resend.com/docs/api-reference/emails/send-email) over HTTPS with a 15-second timeout per request. No SMTP or browser-side API key.
- Separate idempotency keys for primary and receipt; stable payloads for unchanged retries. Resend's retention is 24 hours. Do not retry the same ID with changed content, sender configuration or a modified email template.
- Confirmations are awaited, but their failure never changes primary success to failure. No persistent queue or automatic background retries. If the process is killed mid-send, check provider status before a manual retry.
- HTML-escaped visitor content in the owner email; no untrusted visitor content echoed to the receipt. No tracking pixel, remote logo request, personal message logging or public static file serving.
- CORS is a browser restriction, not authentication or a complete bot defense. In-memory limits reset on restarts and are not shared across instances. Add durable limits/challenge verification if traffic warrants it.
- Deployment and real delivery remain manual; `INSTALAR.md` in the delivery package has the Spanish walkthrough. Browser previews are not a substitute for checking real Gmail, Outlook or Apple Mail rendering after deployment.

No real `.env`, API keys or `node_modules` should be committed.
