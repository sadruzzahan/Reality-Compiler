import * as Sentry from "@sentry/react";
import { ApiError } from "@workspace/api-client-react";
import { readConsent } from "./cookie-consent";

let initialized = false;
// Tracked separately from `initialized` because revoking observability
// consent must immediately silence telemetry — Sentry has no public API to
// fully un-init the client mid-session, so we gate every emission point on
// this flag and re-check it on every consent change.
let enabled = false;

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
    tracesSampleRate: 0,
    sendDefaultPii: false,
    integrations: [],
    beforeSend(event, hint) {
      // Last-line consent kill-switch: if the user revoked observability
      // consent after init, drop the event before it's sent over the wire.
      if (!enabled) return null;
      // Drop 4xx ApiError noise — those are user mistakes (validation,
      // not-found, unauthorized) not server failures.
      const ex: unknown = hint?.originalException;
      if (ex instanceof ApiError && ex.status >= 400 && ex.status < 500) {
        return null;
      }
      return event;
    },
  });

  initialized = true;
}

export function captureException(
  err: unknown,
  ctx?: Record<string, unknown>,
): void {
  if (!initialized || !enabled) return;
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
