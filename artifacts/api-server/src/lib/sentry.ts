import { Sentry, sentryEnabled } from "../instrument";

export function captureException(
  err: unknown,
  ctx?: { requestId?: string; userId?: string; route?: string },
): void {
  if (!sentryEnabled) return;
  Sentry.withScope((scope) => {
    if (ctx?.requestId) scope.setTag("request_id", ctx.requestId);
    if (ctx?.route) scope.setTag("route", ctx.route);
    if (ctx?.userId) scope.setUser({ id: ctx.userId });
    Sentry.captureException(err);
  });
}

export { sentryEnabled };
