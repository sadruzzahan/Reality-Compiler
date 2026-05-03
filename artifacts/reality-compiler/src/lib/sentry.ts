import * as Sentry from "@sentry/react";
import { ApiError } from "@workspace/api-client-react";
import { readConsent } from "./cookie-consent";

let initialized = false;
// Tracked separately from `initialized` because revoking observability
// consent must immediately silence telemetry — Sentry has no public API to
// fully un-init the client mid-session, so we gate every emission point on
// this flag and re-check it on every consent change.
let enabled = false;
// The most recent failing API requestId. Persisted at module scope so that
// a runtime crash that happens AFTER an API error (e.g. a render that tries
// to use the failed response) inherits the correlation id even though the
// crash itself is not an ApiError.
let lastApiRequestId: string | null = null;

function consentAllows(): boolean {
  const consent = readConsent();
  return Boolean(consent?.observability);
}

export function initSentryIfConsented(): void {
  if (typeof window === "undefined") return;

  // Allow consent state to flip the kill-switch on/off without re-init.
  enabled = consentAllows();

  if (initialized) return;
  if (!enabled) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    // Errors only — no performance traces, no replays. Cheap, low-noise.
    // We deliberately leave `integrations` unset so the default browser
    // integrations (GlobalHandlers, BrowserApiErrors, TryCatch, …) stay on:
    // they capture uncaught errors and unhandled promise rejections that
    // bypass our React ErrorBoundary and React Query handlers.
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event, hint) {
      // Last-line consent kill-switch: if the user revoked observability
      // consent after init, drop the event before it's sent over the wire.
      if (!enabled) return null;
      const ex: unknown = hint?.originalException;
      // Drop 4xx ApiError noise — those are user mistakes (validation,
      // not-found, unauthorized) not server failures.
      if (ex instanceof ApiError && ex.status >= 400 && ex.status < 500) {
        return null;
      }
      // Stamp the most recent failing API requestId on every event when no
      // event-specific request_id has already been set. This gives us a
      // correlation handle even for crashes that aren't themselves ApiErrors.
      if (lastApiRequestId) {
        event.tags = { request_id: lastApiRequestId, ...event.tags };
      }
      return event;
    },
  });

  initialized = true;
}

export function recordApiFailure(err: unknown): void {
  if (!(err instanceof ApiError)) return;
  const requestId = err.headers?.get("x-request-id");
  if (requestId) {
    lastApiRequestId = requestId;
    if (initialized && enabled) {
      Sentry.getCurrentScope().setTag("last_api_request_id", requestId);
    }
  }
}

export function setSentryUser(userId: string | null): void {
  if (!initialized || !enabled) return;
  Sentry.getCurrentScope().setUser(userId ? { id: userId } : null);
}

export function setSentryRoute(route: string): void {
  if (!initialized || !enabled) return;
  Sentry.getCurrentScope().setTag("route", route);
}

export function captureException(
  err: unknown,
  ctx?: Record<string, unknown>,
): void {
  if (!initialized || !enabled) return;
  recordApiFailure(err);
  Sentry.withScope((scope) => {
    if (ctx) {
      for (const [key, value] of Object.entries(ctx)) {
        if (value !== undefined && value !== null) {
          scope.setExtra(key, value);
        }
      }
    }
    if (err instanceof ApiError) {
      const apiErr = err as ApiError;
      const requestId = apiErr.headers?.get("x-request-id");
      if (requestId) scope.setTag("request_id", requestId);
      scope.setTag("api_status", String(apiErr.status));
      scope.setTag("api_url", apiErr.url);
    }
    Sentry.captureException(err);
  });
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
