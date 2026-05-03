import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, userProfilesTable, type UserProfile } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { handleForUser } from "../lib/handles";
import { UpdateMyProfileBody } from "@workspace/api-zod";
import { asyncHandler } from "../middlewares/asyncHandler";
import { parseOrThrow } from "../middlewares/validate";
import { mutateLimiter } from "../middlewares/rateLimits";
import { ApiError, badRequest } from "../lib/errors";
import {
  PayloadTooLargeError,
  deleteObjectByUrl,
  streamUpload,
} from "../lib/objectStorage";

const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED_AVATAR_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const router: IRouter = Router();

async function loadProfile(userId: string): Promise<UserProfile | null> {
  const [row] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));
  return row ?? null;
}

async function buildMeResponse(userId: string) {
  const profile = await loadProfile(userId);
  try {
    const user = await clerkClient.users.getUser(userId);
    const email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null;
    return {
      userId,
      handle: handleForUser(userId, email, user.username ?? null, user.firstName),
      email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      imageUrl: user.imageUrl ?? null,
      displayName: profile?.displayName ?? null,
      bio: profile?.bio ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
    };
  } catch {
    return {
      userId,
      handle: handleForUser(userId, null, null, null),
      email: null,
      firstName: null,
      lastName: null,
      imageUrl: null,
      displayName: profile?.displayName ?? null,
      bio: profile?.bio ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
    };
  }
}

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await buildMeResponse(req.userId!));
  }),
);

router.patch(
  "/me/profile",
  requireAuth,
  mutateLimiter,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const body = parseOrThrow(UpdateMyProfileBody, req.body);

    const normalize = (v: string | null | undefined): string | null => {
      if (v === undefined || v === null) return null;
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed;
    };

    const values = {
      displayName: normalize(body.displayName),
      bio: normalize(body.bio),
      avatarUrl: normalize(body.avatarUrl),
    };

    await db
      .insert(userProfilesTable)
      .values({ userId, ...values })
      .onConflictDoUpdate({
        target: userProfilesTable.userId,
        set: { ...values, updatedAt: new Date() },
      });

    res.json(await buildMeResponse(userId));
  }),
);

router.post(
  "/me/avatar",
  requireAuth,
  mutateLimiter,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const contentType = String(req.headers["content-type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!ALLOWED_AVATAR_TYPES.has(contentType)) {
      throw badRequest(
        "Unsupported image type. Use PNG, JPEG, or WebP via Content-Type.",
      );
    }

    const ext =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "jpg";
    // Versioned key (avoids cache busts when the avatar changes; old object
    // is deleted below). Scoped under `avatars/<userId>/...`.
    const safeUser = encodeURIComponent(userId);
    const key = `avatars/${safeUser}/${randomUUID()}.${ext}`;

    let url: string;
    try {
      const result = await streamUpload(
        key,
        contentType,
        req,
        MAX_AVATAR_BYTES,
      );
      url = result.url;
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        throw new ApiError("PAYLOAD_TOO_LARGE", "Avatar too large (max 4 MB)");
      }
      throw err;
    }

    const previous = await loadProfile(userId);
    await db
      .insert(userProfilesTable)
      .values({ userId, avatarUrl: url })
      .onConflictDoUpdate({
        target: userProfilesTable.userId,
        set: { avatarUrl: url, updatedAt: new Date() },
      });

    if (previous?.avatarUrl && previous.avatarUrl !== url) {
      await deleteObjectByUrl(previous.avatarUrl);
    }

    res.json(await buildMeResponse(userId));
  }),
);

export default router;
