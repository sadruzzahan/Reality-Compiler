import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
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

router.get(
  "/readyz",
  asyncHandler(async (req, res) => {
    const checks: Record<string, "ok" | "missing" | "error"> = {};
    for (const key of REQUIRED_ENV) {
      checks[key] = process.env[key] ? "ok" : "missing";
    }
    let dbStatus: "ok" | "error" = "ok";
    try {
      await db.execute(sql`select 1`);
    } catch (err) {
      dbStatus = "error";
      // Log the underlying error server-side; never leak DB details to the
      // public readiness endpoint.
      (req.log ?? console).error({ err }, "Readyz DB check failed");
    }
    const ready =
      dbStatus === "ok" && Object.values(checks).every((v) => v === "ok");
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      database: dbStatus,
      env: checks,
    });
  }),
);

export default router;
