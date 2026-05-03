import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { eq, db, userProfilesTable } from "@workspace/db";
import { ApiError } from "../lib/errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      isAdmin?: boolean;
    }
  }
}

export function getUserId(req: Request): string | null {
  const auth = getAuth(req);
  return auth?.userId ?? null;
}

/**
 * True iff the Clerk session claims contain `publicMetadata.role === "admin"`.
 * Read directly off the verified JWT — no Clerk API round-trip — so this is
 * cheap to call on every admin route.
 *
 * Admins are promoted out-of-band by setting `publicMetadata.role = "admin"`
 * on the Clerk User (see docs/admin.md).
 */
export function isAdminFromClaims(req: Request): boolean {
  try {
    const auth = getAuth(req);
    const claims = auth?.sessionClaims as
      | { publicMetadata?: { role?: unknown }; metadata?: { role?: unknown } }
      | undefined;
    const role =
      (claims?.publicMetadata?.role as string | undefined) ??
      (claims?.metadata?.role as string | undefined) ??
      undefined;
    return role === "admin";
  } catch {
    return false;
  }
}

/**
 * Cheap suspension check. Returns the suspension timestamp if the user is
 * currently suspended; null otherwise. Looked up against `user_profiles` —
 * absence of a profile row means "not suspended" (the column defaults to
 * NULL).
 */
async function getSuspendedAt(userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ suspendedAt: userProfilesTable.suspendedAt })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));
  return row?.suspendedAt ?? null;
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
  // Suspension enforcement: every authenticated request short-circuits to
  // 403 once an admin has set `suspended_at`. Admins themselves can never
  // be suspended in practice (Clerk role takes priority), but we still
  // honour the column for them so an admin can always lift the suspension
  // via the admin console without paradoxically being locked out.
  void getSuspendedAt(userId)
    .then((suspendedAt) => {
      if (suspendedAt && !isAdminFromClaims(req)) {
        next(
          new ApiError(
            "FORBIDDEN",
            "Your account has been suspended. Contact support if you believe this is in error.",
          ),
        );
        return;
      }
      req.userId = userId;
      req.isAdmin = isAdminFromClaims(req);
      next();
    })
    .catch((err) => next(err));
}

/**
 * Gate for /admin/* routes. Requires both authentication AND
 * `publicMetadata.role === "admin"` on the Clerk session. Suspension still
 * applies — a "suspended admin" gets 403, mirroring requireAuth.
 */
export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const userId = getUserId(req);
  if (!userId) {
    next(new ApiError("UNAUTHENTICATED", "Authentication required"));
    return;
  }
  if (!isAdminFromClaims(req)) {
    next(new ApiError("FORBIDDEN", "Admin privileges required"));
    return;
  }
  void getSuspendedAt(userId)
    .then((suspendedAt) => {
      if (suspendedAt) {
        next(new ApiError("FORBIDDEN", "Your admin account is suspended."));
        return;
      }
      req.userId = userId;
      req.isAdmin = true;
      next();
    })
    .catch((err) => next(err));
}

export function attachUserId(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const userId = getUserId(req);
  if (userId) {
    req.userId = userId;
    req.isAdmin = isAdminFromClaims(req);
  }
  next();
}

/**
 * Server-side helper to look up `publicMetadata.role` via the Clerk SDK.
 * Use this only when verifying admin status of *another* user (not the
 * caller); for the caller, prefer `isAdminFromClaims(req)` which avoids
 * a Clerk API round-trip.
 */
export async function isAdminUserId(userId: string): Promise<boolean> {
  try {
    const u = await clerkClient.users.getUser(userId);
    const role = (u.publicMetadata as { role?: unknown } | undefined)?.role;
    return role === "admin";
  } catch {
    return false;
  }
}
