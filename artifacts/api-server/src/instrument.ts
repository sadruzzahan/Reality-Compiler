import * as Sentry from "@sentry/node";

const dsn = process.env["SENTRY_DSN"];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    release: process.env["SENTRY_RELEASE"],
    tracesSampleRate: 0,
    sendDefaultPii: false,
    integrations: [],
    beforeSend(event, hint) {
      const ex = hint?.originalException as
        | { status?: number; statusCode?: number }
        | undefined;
      const status = ex?.status ?? ex?.statusCode;
      if (typeof status === "number" && status < 500) return null;
      return event;
    },
  });
}

export const sentryEnabled = Boolean(dsn);
export { Sentry };
