import type { ZodTypeAny, infer as zInfer } from "zod";
import { validationError } from "../lib/errors";

export function parseOrThrow<S extends ZodTypeAny>(
  schema: S,
  input: unknown,
): zInfer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw validationError(result.error.issues);
  }
  return result.data;
}
