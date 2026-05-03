import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, userProfilesTable, type UserProfile } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { handleForUser } from "../lib/handles";
import { UpdateMyProfileBody } from "@workspace/api-zod";

const router: IRouter = Router();

async function loadProfile(userId: string): Promise<UserProfile | null> {
  const [row] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));
  return row ?? null;
}

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const profile = await loadProfile(userId);
  try {
    const user = await clerkClient.users.getUser(userId);
    const email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null;
    res.json({
      userId,
      handle: handleForUser(userId, email, user.username ?? null, user.firstName),
      email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      imageUrl: user.imageUrl ?? null,
      displayName: profile?.displayName ?? null,
      bio: profile?.bio ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
    });
  } catch {
    res.json({
      userId,
      handle: handleForUser(userId, null, null, null),
      email: null,
      firstName: null,
      lastName: null,
      imageUrl: null,
      displayName: profile?.displayName ?? null,
      bio: profile?.bio ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
    });
  }
});

router.patch("/me/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = UpdateMyProfileBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const normalize = (v: string | null | undefined): string | null => {
    if (v === undefined || v === null) return null;
    const trimmed = v.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const values = {
    displayName: normalize(body.data.displayName),
    bio: normalize(body.data.bio),
    avatarUrl: normalize(body.data.avatarUrl),
  };

  await db
    .insert(userProfilesTable)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: userProfilesTable.userId,
      set: { ...values, updatedAt: new Date() },
    });

  const profile = await loadProfile(userId);
  try {
    const user = await clerkClient.users.getUser(userId);
    const email =
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null;
    res.json({
      userId,
      handle: handleForUser(userId, email, user.username ?? null, user.firstName),
      email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      imageUrl: user.imageUrl ?? null,
      displayName: profile?.displayName ?? null,
      bio: profile?.bio ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
    });
  } catch {
    res.json({
      userId,
      handle: handleForUser(userId, null, null, null),
      email: null,
      firstName: null,
      lastName: null,
      imageUrl: null,
      displayName: profile?.displayName ?? null,
      bio: profile?.bio ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
    });
  }
});

export default router;
