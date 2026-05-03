import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { ApiError } from "../lib/errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function getUserId(req: Request): string | null {
  const auth = getAuth(req);
  return auth?.userId ?? null;
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const userId = getUserId(req);
  if (!userId) {
    next(new ApiError("UNAUTHENTICATED", "Authentication required"));
    return;
  }
  req.userId = userId;
  next();
}

export function attachUserId(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const userId = getUserId(req);
  if (userId) req.userId = userId;
  next();
}
