# Security Policy & Operations

This document describes the threat model, hardening posture, and operational procedures (allowlist, secret rotation, incident response) for Reality Compiler.

## Surface

- **Public web app** — React + Vite, served as static assets, mounted at `/`.
- **API** — Express on port `8080`, mounted at `/api`. All HTTP endpoints documented in `lib/api-spec/openapi.yaml`.
- **Auth** — Clerk; sessions are HTTP-only cookies. The Express middleware reads the Clerk session and exposes `req.userId`.
- **Datastore** — Replit-managed Postgres. Access is via `DATABASE_URL` (and the `PG*` family). No direct internet exposure.
- **Outbound** — Replit AI Integrations proxy (OpenAI), object storage, Clerk Frontend API.

## Threat model (in scope)

| Threat | Mitigation |
| --- | --- |
| Cross-origin theft of cookies / Clerk session | Strict CORS allowlist (`ALLOWED_ORIGINS`); `credentials: true` only for known origins. |
| Brute force / credential stuffing | Clerk rate-limits auth endpoints. We rate-limit our own mutating + AI routes. |
| IDOR on sessions / orders / payouts | Every per-user resource is fetched with an explicit `userId` filter. Reads pass through the `userCanRead*` helpers. |
| Resource abuse on AI endpoints | `aiLimiter` (10/min/user) on `POST /sessions` and `POST /sessions/:id/messages`. |
| Oversized payloads | `express.json({ limit: "256kb" })` global; only routes that need more raise it explicitly. |
| Injection via JSON | Zod validation on every params/query/body before use; Drizzle parameterised queries throughout. |
| Information leakage on errors | Centralised error handler returns a fixed envelope `{ error: { code, message, requestId, fields? } }`. Stack traces never leave the server in production. |
| Header smuggling / clickjacking | `helmet` defaults applied to API responses (HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options=DENY). |

## Threat model (out of scope, owned by platform)

- DDoS at the edge (Replit autoscale handles this).
- Container isolation, OS patching.
- Postgres backups and point-in-time recovery (managed by Replit).

## CORS allowlist

`ALLOWED_ORIGINS` is a comma-separated list of fully-qualified origins (scheme + host, no path). Examples:

```
ALLOWED_ORIGINS=https://realitycompiler.com,https://www.realitycompiler.com
```

In addition, the middleware always allows:

- **Same-host requests**: an `Origin` whose host matches `x-forwarded-host` (the public hostname the request arrived on). This lets the front-end served on the same domain talk to the API without enumerating every deployment URL.
- `*.replit.dev`, `*.repl.co`, `*.replit.app`, `localhost`, `127.0.0.1`, `0.0.0.0` — **development only**, never in production.
- Non-browser requests (no `Origin` header at all — curl, server-to-server).

In production, anything that is not in `ALLOWED_ORIGINS` and not same-host is rejected, even if it ends in `.replit.app`.

Anything else is rejected without `Access-Control-Allow-*` headers, which causes the browser to block the request.

## Secrets & rotation

Secrets are managed via Replit secrets — never commit them. Required:

| Secret | Owner | Rotation cadence | Where to rotate |
| --- | --- | --- | --- |
| `CLERK_SECRET_KEY` | Auth | Quarterly or on suspected compromise | Workspace Auth pane → API keys. Replace in Replit secrets. |
| `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` | Auth | Quarterly | Workspace Auth pane. Public — safe to commit only via env. |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | AI | Auto-managed | Replit AI Integrations pane. |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | AI | Auto-managed | Replit AI Integrations pane. |
| `DATABASE_URL` (+ `PG*`) | Database | Auto-managed | Replit Database pane. Rotate by re-provisioning. |
| `STRIPE_SECRET_KEY` | Payments | Quarterly or on compromise | Stripe Dashboard → Developers → API keys. |
| `STRIPE_WEBHOOK_SECRET` | Payments | After endpoint rotation | Stripe Dashboard → Webhooks. |

To rotate a secret:

1. Generate a new value at the source.
2. Add it to Replit secrets with the same name (overwrites the old).
3. Restart the affected workflow(s).
4. Verify with the smoke checklist below.
5. Revoke the old credential at the source.

## Incident playbook

1. **Page on-call** — Whoever sees the alert first becomes the incident commander.
2. **Triage** — Pull `requestId` from the user report or alert. Search backend logs for the `requestId` to find the failing request and any upstream errors.
3. **Contain** — If a credential is suspected leaked, rotate immediately (see table above) and revoke active Clerk sessions via the Auth pane.
4. **Mitigate** — If a single endpoint is being abused, add a tighter limiter or a temporary feature flag. If a deploy regressed, roll back via the deployment dashboard.
5. **Communicate** — Post an internal status update; if user-visible >5 min, post a short public note in the contact email autoresponder.
6. **Post-mortem** — Within 48h. Use `docs/incident-response.md` template (created by the Deployment task).

## Reporting a vulnerability

Email security@realitycompiler.com (set up before launch) or the configured contact address. Provide a description, reproduction steps, and your contact info. We aim to acknowledge within 24h.
