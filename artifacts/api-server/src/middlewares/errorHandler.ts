import type { Request, Response, NextFunction } from "express";
import { ApiError, type ErrorEnvelope } from "../lib/errors";
import { logger } from "../lib/logger";

const isProduction = process.env.NODE_ENV === "production";

interface BodyParserError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    typeof (err as { type?: unknown }).type === "string"
  );
}

export function notFoundHandler(req: Request, res: Response): void {
  const env: ErrorEnvelope = {
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found`,
      requestId: req.requestId,
    },
  };
  res.status(404).json(env);
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (isBodyParserError(err)) {
    if (err.type === "entity.too.large") {
      apiError = new ApiError("PAYLOAD_TOO_LARGE", "Request body too large");
    } else if (
      err.type === "entity.parse.failed" ||
      err.type === "request.aborted"
    ) {
      apiError = new ApiError("BAD_REQUEST", "Malformed request body");
    } else {
      apiError = new ApiError("BAD_REQUEST", err.message || "Bad request");
    }
  } else {
    apiError = new ApiError(
      "INTERNAL",
      isProduction ? "Internal server error" : (err as Error)?.message || "Internal server error",
    );
  }

  const log = req.log ?? logger;
  if (apiError.status >= 500) {
    log.error(
      { err, requestId: req.requestId, code: apiError.code },
      "Request failed",
    );
  } else {
    log.warn(
      { requestId: req.requestId, code: apiError.code, status: apiError.status },
      apiError.message,
    );
  }

  if (res.headersSent) return;

  const env: ErrorEnvelope = {
    error: {
      code: apiError.code,
      message: apiError.message,
      requestId: req.requestId,
      ...(apiError.fields ? { fields: apiError.fields } : {}),
    },
  };
  res.status(apiError.status).json(env);
}
