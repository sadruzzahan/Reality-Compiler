import express, { type Express } from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
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
import { logger } from "./lib/logger";

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

// Clerk Frontend API proxy MUST stay before body parsing — it streams the raw
// request body upstream and would break if we consumed it first.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Security headers. CSP and COEP are disabled because:
//   - This server only emits JSON; the front-end is served by Vite/Replit
//     which sets its own CSP.
//   - COEP would block third-party resources we legitimately depend on.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(corsMiddleware());

// Global rate limit applies to every request (after CORS preflight is handled
// by `cors`, before any route work).
app.use(globalLimiter);

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
