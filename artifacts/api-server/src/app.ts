import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { requestIdMiddleware } from "./middlewares/requestId";
import { corsMiddleware } from "./middlewares/cors";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";
import { globalLimiter } from "./middlewares/rateLimits";
import router from "./routes";
import metricsRouter from "./routes/metrics";
import { logger } from "./lib/logger";
import { metricsMiddleware } from "./lib/metrics";

const app: Express = express();

// Trust the Replit edge proxy so req.ip / x-forwarded-* are honored. This must
// run before the rate limiter (which keys by IP for unauthenticated traffic).
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Request ID first so every subsequent log line carries it.
app.use(requestIdMiddleware);

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req as { id?: string }).id ?? "unknown",
    // One structured line per request: method, path, status, duration,
    // userId, requestId. Severity follows status class so error budgets and
    // alerts can key off log level alone.
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    customProps: (req) => {
      // getAuth() is safe to call even when clerk hasn't authenticated the
      // request — it returns an object with userId === null. customProps runs
      // when the response log is emitted, so clerkMiddleware has already run.
      let userId: string | null = null;
      try {
        userId = getAuth(req as never)?.userId ?? null;
      } catch {
        userId = null;
      }
      return { userId };
    },
    customSuccessMessage: (req, res, time) =>
      `${req.method} ${req.url?.split("?")[0]} ${res.statusCode} ${time}ms`,
    customErrorMessage: (req, res, _err) =>
      `${req.method} ${req.url?.split("?")[0]} ${res.statusCode}`,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Record Prometheus metrics for every request (cheap; cardinality is bounded
// to mounted route patterns). Mount before rate limiter so metric scrapers
// don't burn the global budget.
app.use(metricsMiddleware);

// Prometheus scrape endpoint — gated by METRICS_TOKEN env var. Disabled when
// the env var is unset (returns 404). Mounted before rate limiter and CORS so
// it stays scrapeable from internal monitoring without burning the budget.
app.use("/metrics", metricsRouter);

// Clerk Frontend API proxy MUST stay before body parsing — it streams the raw
// request body upstream and would break if we consumed it first.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Security headers. This server emits only JSON and never serves HTML, so we
// apply a maximally restrictive CSP (`default-src 'none'`) — nothing should
// ever be embedded, framed, scripted, or styled from an API response. The
// front-end is served by Vite under a different artifact and ships its own
// CSP tuned for Clerk and the OpenAI image hosts.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    // COEP would force every cross-origin response to opt in via CORP — too
    // strict for a JSON API consumed by browsers from another origin.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" },
    // HSTS only in production. In dev the API is reached over the Replit
    // proxy on a different hostname, and pinning HSTS there can cause sticky
    // cache issues if a developer later switches schemes.
    strictTransportSecurity:
      process.env["NODE_ENV"] === "production"
        ? {
            maxAge: 60 * 60 * 24 * 365,
            includeSubDomains: true,
            preload: true,
          }
        : false,
  }),
);

app.use(corsMiddleware());

// Global rate limit applies to every request (after CORS preflight is handled
// by `cors`, before any route work).
app.use(globalLimiter);

// Default JSON parser. Note: express.json only matches `application/json`
// by default, so the binary `POST /api/me/avatar` route (image/png|jpeg|webp)
// streams its body directly via `streamUpload` and is unaffected here.
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env["CLERK_PUBLISHABLE_KEY"],
    ),
  })),
);

app.use("/api", router);

// 404 for anything not matched by the API router.
app.use("/api", notFoundHandler);

// Centralised error handler — must be LAST.
app.use(errorHandler);

export default app;
