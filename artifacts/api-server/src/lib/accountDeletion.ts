import { createHash } from "crypto";
import { and, eq, isNull, lt, inArray } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import {
  db,
  designSessionsTable,
  designOutputsTable,
  marketplaceListingsTable,
  ordersTable,
  userProfilesTable,
  recordAudit,
} from "@workspace/db";
import { deleteObjectByUrl, deleteObjectByKey } from "./objectStorage";
import { logger } from "./logger";

const ANON_PREFIX = "deleted-user:";

/**
 * Stable, non-reversible marker we substitute for a real Clerk userId after
 * deletion. We keep it deterministic so a designer's anonymised orders can
 * still be grouped for tax / dispute purposes without revealing the original
 * userId.
 */
export function anonymiseUserId(userId: string): string {
  const digest = createHash("sha256").update(userId).digest("hex").slice(0, 24);
  return `${ANON_PREFIX}${digest}`;
}

const ANON_SHIPPING = {
  recipient: "[deleted]",
  line1: "[deleted]",
  line2: null,
  city: "[deleted]",
  region: "[deleted]",
  postalCode: "00000",
  country: "XX",
} as const;

export interface AccountDeletionSummary {
  sessionsDeleted: number;
  listingsDeleted: number;
  ordersAnonymised: number;
  anonId: string;
}

/**
 * Soft-deletes a user's data: sessions, listings, profile, and anonymises
 * the buyer info on any orders they placed (orders are retained for tax /
 * fulfilment audit). Designer references on orders are remapped to the
 * anonymous id so payout history stays consistent.
 *
 * Object cleanup is intentionally deferred to the 30-day purge job so the
 * user has a window to recover via support if the deletion was mistaken.
 */
export async function softDeleteAccount(
  userId: string,
  requestId?: string,
): Promise<AccountDeletionSummary> {
  const anonId = anonymiseUserId(userId);
  const now = new Date();

  // All DB mutations run in a single transaction so a partial failure can
  // never leave the account half-anonymised.
  const { sessionsDeleted, listingsDeleted, buyerOrders } = await db.transaction(
    async (tx) => {
      const sessionsDeletedTx = await tx
        .update(designSessionsTable)
        .set({ deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(designSessionsTable.userId, userId),
            isNull(designSessionsTable.deletedAt),
          ),
        )
        .returning({ id: designSessionsTable.id });

      const listingsDeletedTx = await tx
        .update(marketplaceListingsTable)
        .set({ deletedAt: now, status: "archived", updatedAt: now })
        .where(
          and(
            eq(marketplaceListingsTable.userId, userId),
            isNull(marketplaceListingsTable.deletedAt),
          ),
        )
        .returning({ id: marketplaceListingsTable.id });

      // Anonymise buyer-side orders.
      const buyerOrdersTx = await tx
        .update(ordersTable)
        .set({
          userId: anonId,
          shippingAddress: ANON_SHIPPING,
          updatedAt: now,
        })
        .where(eq(ordersTable.userId, userId))
        .returning({ id: ordersTable.id });

      // Remap designer-side orders so payouts stay aggregable but no longer
      // reference the original Clerk userId.
      await tx
        .update(ordersTable)
        .set({ designerUserId: anonId, updatedAt: now })
        .where(eq(ordersTable.designerUserId, userId));

      // Profile soft-delete + best-effort PII scrub.
      await tx
        .insert(userProfilesTable)
        .values({
          userId,
          displayName: null,
          bio: null,
          avatarUrl: null,
          deletedAt: now,
        })
        .onConflictDoUpdate({
          target: userProfilesTable.userId,
          set: {
            displayName: null,
            bio: null,
            avatarUrl: null,
            deletedAt: now,
            updatedAt: now,
          },
        });

      return {
        sessionsDeleted: sessionsDeletedTx,
        listingsDeleted: listingsDeletedTx,
        buyerOrders: buyerOrdersTx,
      };
    },
  );

  // Best-effort revoke active Clerk sessions so the browser is signed out
  // even before the next page load. We do NOT delete the Clerk user here —
  // hard-delete in `purgeDeletedAccounts` handles that after the grace
  // window so accidental deletions can be recovered via support.
  try {
    const sessions = await clerkClient.sessions.getSessionList({ userId });
    for (const s of sessions.data) {
      try {
        await clerkClient.sessions.revokeSession(s.id);
      } catch (err) {
        logger.warn({ err, sessionId: s.id }, "clerk revoke session failed");
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, "clerk session list failed during deletion");
  }

  await recordAudit({
    actorUserId: userId,
    action: "account.soft_delete",
    targetType: "user",
    targetId: userId,
    after: {
      anonId,
      sessions: sessionsDeleted.length,
      listings: listingsDeleted.length,
      orders: buyerOrders.length,
    },
    requestId,
  });

  return {
    sessionsDeleted: sessionsDeleted.length,
    listingsDeleted: listingsDeleted.length,
    ordersAnonymised: buyerOrders.length,
    anonId,
  };
}

export interface PurgeSummary {
  usersPurged: number;
  sessionsPurged: number;
  listingsPurged: number;
  objectsDeleted: number;
}

/**
 * Hard-deletes data for accounts that were soft-deleted more than
 * `graceDays` ago. Removes generated images, avatars, sessions (cascades to
 * messages/outputs), listings, the profile row, and best-effort deletes the
 * Clerk user. Anonymised orders are intentionally retained.
 */
export async function purgeDeletedAccounts(
  graceDays = 30,
): Promise<PurgeSummary> {
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

  const profiles = await db
    .select()
    .from(userProfilesTable)
    .where(
      and(
        // deletedAt IS NOT NULL AND deletedAt < cutoff
        // drizzle expresses this as lt + isNotNull; lt() already excludes NULL.
        lt(userProfilesTable.deletedAt, cutoff),
      ),
    );

  let objectsDeleted = 0;
  let sessionsPurged = 0;
  let listingsPurged = 0;

  for (const profile of profiles) {
    const userId = profile.userId;
    if (profile.avatarUrl) {
      await deleteObjectByUrl(profile.avatarUrl);
      objectsDeleted += 1;
    }

    const sessions = await db
      .select({ id: designSessionsTable.id })
      .from(designSessionsTable)
      .where(eq(designSessionsTable.userId, userId));
    const sessionIds = sessions.map((s) => s.id);

    if (sessionIds.length > 0) {
      const outputs = await db
        .select({ imageUrl: designOutputsTable.imageUrl })
        .from(designOutputsTable)
        .where(inArray(designOutputsTable.sessionId, sessionIds));
      for (const o of outputs) {
        if (o.imageUrl) {
          await deleteObjectByUrl(o.imageUrl);
          objectsDeleted += 1;
        }
      }
      // Best-effort wipe of any remaining keys under the user prefix
      // (covers orphaned writes that never made it into design_outputs).
      try {
        await deleteObjectByKey(`avatars/${encodeURIComponent(userId)}/`);
      } catch (err) {
        logger.warn({ err, userId }, "purge: avatar prefix cleanup failed");
      }

      const purgedSessions = await db
        .delete(designSessionsTable)
        .where(inArray(designSessionsTable.id, sessionIds))
        .returning({ id: designSessionsTable.id });
      sessionsPurged += purgedSessions.length;
    }

    const purgedListings = await db
      .delete(marketplaceListingsTable)
      .where(eq(marketplaceListingsTable.userId, userId))
      .returning({ id: marketplaceListingsTable.id });
    listingsPurged += purgedListings.length;

    await db
      .delete(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId));

    try {
      await clerkClient.users.deleteUser(userId);
    } catch (err) {
      logger.warn({ err, userId }, "purge: clerk delete user failed");
    }

    await recordAudit({
      actorUserId: null,
      action: "account.hard_delete",
      targetType: "user",
      targetId: userId,
      after: { sessionsPurged, listingsPurged, objectsDeleted },
    });
  }

  return {
    usersPurged: profiles.length,
    sessionsPurged,
    listingsPurged,
    objectsDeleted,
  };
}
