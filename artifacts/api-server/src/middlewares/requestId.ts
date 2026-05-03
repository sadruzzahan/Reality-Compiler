import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

const HEADER = "x-request-id";
const VALID = /^[A-Za-z0-9._-]{1,128}$/;

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header(HEADER);
  const id = incoming && VALID.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  // Some libs (pino-http) read req.id; keep them in sync.
  (req as Request & { id?: string }).id = id;
  res.setHeader("X-Request-Id", id);
  next();
}
