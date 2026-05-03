import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, userProfilesTable, type UserProfile } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { handleForUser } from "../lib/handles";
import { UpdateMyProfileBody } from "@workspace/api-zod";
import { asyncHandler } from "../middlewares/asyncHandler";
import { parseOrThrow } from "../middlewares/validate";
import { mutateLimiter } from "../middlewares/rateLimits";

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

export default router;
