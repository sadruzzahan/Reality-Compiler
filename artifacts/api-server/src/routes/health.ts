import { Router, type IRouter } from "express";
import { sql } from "@workspace/db";
import { db } from "@workspace/db";
import { HealthCheckResponse } from "@workspace/api-zod";
import { asyncHandler } from "../middlewares/asyncHandler";

const router: IRouter = Router();

const REQUIRED_ENV = [
  "DATABASE_URL",
  "AI_INTEGRATIONS_OPENAI_BASE_URL",
  "AI_INTEGRATIONS_OPENAI_API_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
];

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

async function probeAiIntegration(
  log: { error: (...args: unknown[]) => void } | undefined,
): Promise<"ok" | "error" | "missing"> {
  const baseUrl = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  const apiKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  if (!baseUrl || !apiKey) return "missing";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    // OpenAI-compatible providers expose /v1/models. We don't care about the
    // body — only that the upstream is reachable and accepts our credentials.
    const url = baseUrl.replace(/\/+$/, "") + "/models";
    const r = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (r.status >= 500) return "error";
    return "ok";
  } catch (err) {
    (log ?? console).error({ err }, "Readyz AI probe failed");
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

router.get(
  "/readyz",
  asyncHandler(async (req, res) => {
    const checks: Record<string, "ok" | "missing" | "error"> = {};
    for (const key of REQUIRED_ENV) {
      checks[key] = process.env[key] ? "ok" : "missing";
    }
    const [dbStatus, aiStatus] = await Promise.all([
      (async () => {
        try {
          await db.execute(sql`select 1`);
          return "ok" as const;
        } catch (err) {
          // Log the underlying error server-side; never leak DB details to
          // the public readiness endpoint.
          (req.log ?? console).error({ err }, "Readyz DB check failed");
          return "error" as const;
        }
      })(),
      probeAiIntegration(req.log),
    ]);
    const ready =
      dbStatus === "ok" &&
      aiStatus === "ok" &&
      Object.values(checks).every((v) => v === "ok");
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      database: dbStatus,
      ai: aiStatus,
      env: checks,
    });
  }),
);

export default router;
