import type { ZodIssue } from "zod";

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "BAD_REQUEST"
  | "UPSTREAM_ERROR"
  | "INTERNAL";

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
    fields?: Array<{ path: string; message: string }>;
  };
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION: 400,
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields?: Array<{ path: string; message: string }>;
  constructor(
    code: ErrorCode,
    message: string,
    fields?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fields = fields;
  }
}

export function notFound(what = "Resource"): ApiError {
  return new ApiError("NOT_FOUND", `${what} not found`);
}

export function forbidden(message = "Forbidden"): ApiError {
  return new ApiError("FORBIDDEN", message);
}

export function badRequest(message: string): ApiError {
  return new ApiError("BAD_REQUEST", message);
}

export function conflict(message: string): ApiError {
  return new ApiError("CONFLICT", message);
}

export function validationError(issues: ZodIssue[]): ApiError {
  return new ApiError(
    "VALIDATION",
    "Invalid request",
    issues.map((i) => ({
      path: i.path.join(".") || "(root)",
      message: i.message,
    })),
  );
}
