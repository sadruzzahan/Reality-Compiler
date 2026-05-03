import client from "prom-client";
import type { Request, Response, NextFunction } from "express";

export const register = new client.Registry();
register.setDefaultLabels({ app: "reality-compiler-api" });
client.collectDefaultMetrics({ register });

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"] as const,
  registers: [register],
});

function resolveRoute(req: Request): string {
  // Prefer mounted route pattern (e.g. "/api/sessions/:id") so cardinality
  // stays bounded; fall back to "unmatched" for 404s and unknown routes.
  const baseUrl = req.baseUrl ?? "";
  const routePath = req.route?.path;
  if (routePath) return `${baseUrl}${routePath}`;
  return "unmatched";
}

export function metricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = {
      method: req.method,
      route: resolveRoute(req),
      status: String(res.statusCode),
    };
    httpRequestDuration.observe(labels, duration);
    httpRequestsTotal.inc(labels);
  });
  next();
}
