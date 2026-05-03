# Observability runbook

How Reality Compiler is instrumented and how to debug production incidents.

## What we capture

| Layer | Tool | Gated by |
| --- | --- | --- |
| Backend structured logs | `pino` + `pino-http` | always on |
| Backend error tracking | `@sentry/node` | `SENTRY_DSN` env var |
| Backend metrics | `prom-client` at `/metrics` | `METRICS_TOKEN` env var |
| Frontend error tracking | `@sentry/react` | `VITE_SENTRY_DSN` env var **and** user cookie consent (observability bucket) |
| Request correlation | `X-Request-Id` response header | always on |

Nothing leaves the box unless the corresponding env var is set. Frontend
telemetry additionally requires the user to opt in via the cookie banner.

## Environment variables

```
# Backend
SENTRY_DSN=<dsn>             # enables backend error capture (optional)
SENTRY_RELEASE=<git-sha>     # tags events with the release (optional)
METRICS_TOKEN=<random>       # enables /metrics scrape endpoint (optional)
LOG_LEVEL=info               # pino level (default: info)

# Frontend (build-time, baked into the bundle)
VITE_SENTRY_DSN=<dsn>        # enables browser error capture (optional)
VITE_SENTRY_RELEASE=<git-sha>

# Source-map upload (CI only — never set in the running app)
SENTRY_AUTH_TOKEN=<token>
SENTRY_ORG=<org>
SENTRY_PROJECT=<project>
```

## Logs

Every request emits **one structured line** when the response finishes:

```json
{
  "level": "info",
  "time": 1714694400000,
  "req": { "id": "f7b1...", "method": "GET", "url": "/api/sessions" },
  "res": { "statusCode": 200 },
  "responseTime": 42,
  "userId": "user_2abc...",
  "msg": "GET /api/sessions 200 42ms"
}
```

- `level` follows the response status: `info` for 2xx/3xx, `warn` for 4xx,
  `error` for 5xx (or unhandled exceptions).
- `userId` is the Clerk user id when the request was authenticated, otherwise
  `null`.
- Auth headers and `Set-Cookie` are redacted at the logger level (see
  `artifacts/api-server/src/lib/logger.ts`).
- In production, logs are JSON. In dev, `pino-pretty` formats them.

To find every line for a request:

```sh
rg --json '"req":{"id":"<request-id>"' /var/log/reality-compiler/*.log
```

## Request correlation

Every API response carries an `X-Request-Id` header (UUID v4 unless the
caller supplied a valid one via the same header). This id appears in:

- `req.id` and `requestId` fields of every backend log line
- the `requestId` field of every error envelope returned to the client
- the `request_id` Sentry tag on backend events
- the `request_id` Sentry tag on frontend events that originated from a
  failed API call (extracted from the response headers via `ApiError`)

When a user reports an error, ask them for the request id from the in-app
error message — it appears under the message in the error fallback UI.

## Metrics

Mounted at `/metrics` (NOT under `/api`). Returns the Prometheus text format
when `METRICS_TOKEN` is set and the caller presents
`Authorization: Bearer <METRICS_TOKEN>`. Otherwise responds 404 (when the
env var is unset) or 401 (when the token is wrong).

Exposed series:

- `http_request_duration_seconds{method,route,status}` — histogram, buckets
  `[0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10]`. Cardinality is bounded by
  using mounted route patterns (e.g. `/api/sessions/:id`) instead of raw
  URLs.
- `http_requests_total{method,route,status}` — counter.
- The standard `prom-client` default metrics (event loop lag, GC, memory).

Quick scrape from the box:

```sh
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:$PORT/metrics | head -40
```

## Sentry

### Backend

`artifacts/api-server/src/instrument.ts` calls `Sentry.init` at process start
(imported as the very first line of `src/index.ts`). When `SENTRY_DSN` is
unset, `sentryEnabled` is `false` and `captureException` is a no-op.

Errors are forwarded from the centralised `errorHandler` middleware **only**
when the resolved status is ≥ 500. 4xx ApiErrors (validation, not-found,
unauthorized, rate-limited, etc.) are logged as `warn` but never sent to
Sentry — they would drown out real failures otherwise.

Each captured event includes:

- `request_id` tag
- `route` tag (`<METHOD> <route-pattern>`)
- Clerk `userId` on the user scope (only when present)

### Frontend

`artifacts/reality-compiler/src/lib/sentry.ts` is the single entry point.
`initSentryIfConsented()` runs in `src/main.tsx` before React mounts, and
again whenever the cookie banner emits a consent change event — so flipping
the observability switch on takes effect on the next page load _and_ within
the current session.

Sentry stays a no-op until **both**:

1. `VITE_SENTRY_DSN` is set at build time, AND
2. `localStorage["rc_cookie_consent_v1"]` includes `observability: true`.

The init call is the very first thing that runs in `main.tsx`, before
`App` is imported (App is loaded via dynamic `import()` after Sentry is
configured). This means errors thrown during component-module evaluation
are still captured.

Consent revocation is honoured live: when the user flips observability
off, the cookie banner emits `rc-cookie-consent-changed`, which flips an
`enabled` kill-switch checked by both `captureException` and Sentry's own
`beforeSend` hook. No further events leave the browser until consent is
re-granted (the SDK stays loaded but silenced — Sentry has no public API
to fully un-init mid-session).

A top-level `<Sentry.ErrorBoundary>` wraps `<App>` and renders the
`ErrorFallback` component on render-time crashes. The fallback shows the
human-readable error message, the request id (if the crash came from an
`ApiError`), the Sentry event id (if Sentry is initialized), a "Try again"
button (which calls `resetError`), a "Go home" button, and a "Report this"
button that pre-fills the contact form with all three identifiers.

React Query's `QueryCache` and `MutationCache` `onError` hooks forward
unhandled errors to Sentry via the same path. ApiError-based 4xx responses
are filtered out client-side too.

### Source maps

`vite build` emits `.map` files alongside the production bundle (see
`build.sourcemap = true` in `vite.config.ts`). They are then handled
**automatically** by `scripts/upload-sourcemaps.mjs`, which is wired into
the `build` npm script:

```
"build": "vite build --config vite.config.ts && node ./scripts/upload-sourcemaps.mjs"
```

The post-build script:

1. If `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are all set
   (and `SENTRY_RELEASE` if you want a release-bound upload), it shells out
   to `npx @sentry/cli sourcemaps upload` against `dist/public/`.
2. Whether or not the upload runs, it then **deletes every `.map` file**
   from `dist/public/` so production end-users can never download readable
   source. This guarantee holds even if the upload step is misconfigured —
   the deploy bundle is always source-map-free.

To verify locally:

```sh
pnpm --filter @workspace/reality-compiler run build
find artifacts/reality-compiler/dist/public -name '*.map'  # should print nothing
```

The backend already runs with `node --enable-source-maps` (see the
`start` script in `artifacts/api-server/package.json`) so server stack
traces resolve to the original TypeScript without any extra tooling.

## Common debugging recipes

**A user reports a 500.** Ask for the request id from the error UI. Search
logs by that id (`rg '"req":{"id":"<id>"'`). The matching line includes
`userId`, status, and duration; the `error` line just before it has the
stack. The same event in Sentry carries the `request_id` tag.

**Latency spike.** Check the `http_request_duration_seconds` histogram in
Prometheus / Grafana. Look at p95 by `route` to find the offending endpoint,
then drill into logs filtered by that route pattern and `level >= warn`.

**Frontend white-screen.** Check Sentry for a render-time error in the
matching release. If Sentry is dark (user opted out of observability cookies
or dsn unset), check the browser console for the `ErrorFallback` UI — it
shows the request id (if any) and the underlying error message.
