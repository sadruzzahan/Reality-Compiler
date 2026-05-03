import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ApiError } from "../lib/errors";

const DISABLED = process.env["RATE_LIMIT_DISABLED"] === "1";

function noop(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

function keyByUserOrIp(req: Request): string {
  if (req.userId) return `u:${req.userId}`;
  return `ip:${ipKeyGenerator(req.ip ?? "0.0.0.0")}`;
}

function build(options: Partial<Options>): RequestHandler {
  if (DISABLED) return noop;
  return rateLimit({
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: keyByUserOrIp,
    handler: (_req, _res, next) => {
      next(
        new ApiError("RATE_LIMITED", "Too many requests — slow down and retry."),
      );
    },
    ...options,
  });
}

// Global cap to keep noisy clients from hammering the API.
export const globalLimiter = build({
  windowMs: 60_000,
  limit: 600,
});

// Mutating endpoints (publish listing, place order, profile updates).
export const mutateLimiter = build({
  windowMs: 60_000,
  limit: 60,
});

// AI / image generation endpoints — expensive, slow, and cost-bearing.
export const aiLimiter = build({
  windowMs: 60_000,
  limit: 10,
});
