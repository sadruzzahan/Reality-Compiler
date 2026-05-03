import { Router, type IRouter } from "express";
import { eq, desc, and, asc, sql, inArray, isNull } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import {
  db,
  designSessionsTable,
  designOutputsTable,
  marketplaceListingsTable,
  ordersTable,
  quotesTable,
  suppliersTable,
  userProfilesTable,
  recordAudit,
  type MarketplaceListing,
  type UserProfile,
  type Quote,
  type Supplier,
} from "@workspace/db";
import { rankSuppliers } from "../lib/routing";
import { serializeSupplier } from "./suppliers";
import {
  GetMarketplaceListingParams,
  UnpublishListingParams,
  GetDesignerProfileParams,
  ListMarketplaceListingsQueryParams,
  PublishListingBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { handleForUser } from "../lib/handles";
import { deleteObjectByUrl } from "../lib/objectStorage";
import { asyncHandler } from "../middlewares/asyncHandler";
import { parseOrThrow } from "../middlewares/validate";
import { mutateLimiter } from "../middlewares/rateLimits";
import { badRequest, forbidden, notFound } from "../lib/errors";

const router: IRouter = Router();

async function resolveHandle(userId: string): Promise<string> {
  if (userId === "system-seed") return handleForUser(userId, null, null, null);
  try {
    const u = await clerkClient.users.getUser(userId);
    const email =
      u.primaryEmailAddress?.emailAddress ??
      u.emailAddresses[0]?.emailAddress ??
      null;
    return handleForUser(userId, email, u.username ?? null, u.firstName);
  } catch {
    return handleForUser(userId, null, null, null);
  }
}

async function loadProfilesByUserIds(
  userIds: string[],
): Promise<Map<string, UserProfile>> {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return new Map();
  const rows = await db
    .select()
    .from(userProfilesTable)
    .where(inArray(userProfilesTable.userId, unique));
  return new Map(rows.map((r) => [r.userId, r]));
}

async function buildSummary(
  listing: MarketplaceListing,
  profile?: UserProfile | null,
) {
  const [output] = await db
    .select()
    .from(designOutputsTable)
    .where(eq(designOutputsTable.sessionId, listing.sessionId))
    .orderBy(desc(designOutputsTable.createdAt))
    .limit(1);
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.marketplaceListingId, listing.id),
        isNull(ordersTable.deletedAt),
      ),
    );
  const resolvedProfile =
    profile === undefined
      ? (await loadProfilesByUserIds([listing.userId])).get(listing.userId) ?? null
      : profile;
  return {
    id: listing.id,
    sessionId: listing.sessionId,
    userId: listing.userId,
    creatorHandle: listing.creatorHandle,
    creatorDisplayName: resolvedProfile?.displayName ?? null,
    creatorAvatarUrl: resolvedProfile?.avatarUrl ?? null,
    title: listing.title,
    category: listing.category,
    description: listing.description,
    listingPrice: Number(listing.listingPrice),
    thumbnailUrl: output?.imageUrl ?? null,
    primaryMaterial: output?.primaryMaterial ?? null,
    productName: output?.productName ?? null,
    orderCount: c ?? 0,
    createdAt: listing.createdAt.toISOString(),
  };
}

function serializeOutput(out: typeof designOutputsTable.$inferSelect) {
  return {
    id: out.id,
    sessionId: out.sessionId,
    productName: out.productName,
    category: out.category,
    summary: out.summary,
    primaryMaterial: out.primaryMaterial,
    materials: out.materials,
    dimensions: out.dimensions,
    weightGrams: out.weightGrams === null ? null : Number(out.weightGrams),
    processes: out.processes,
    bom: out.bom,
    costEstimate: out.costEstimate,
    imageUrl: out.imageUrl,
    manufacturingNotes: out.manufacturingNotes,
    createdAt: out.createdAt.toISOString(),
  };
}

router.get(
  "/marketplace/listings",
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(ListMarketplaceListingsQueryParams, req.query);
    const { category, sort } = params;

    const conds = [
      eq(marketplaceListingsTable.status, "active"),
      isNull(marketplaceListingsTable.deletedAt),
    ];
    if (category) conds.push(eq(marketplaceListingsTable.category, category));

    const rows = await db
      .select()
      .from(marketplaceListingsTable)
      .where(and(...conds));

    const profileMap = await loadProfilesByUserIds(rows.map((r) => r.userId));
    const summaries = await Promise.all(
      rows.map((r) => buildSummary(r, profileMap.get(r.userId) ?? null)),
    );

    switch (sort) {
      case "price-asc":
        summaries.sort((a, b) => a.listingPrice - b.listingPrice);
        break;
      case "price-desc":
        summaries.sort((a, b) => b.listingPrice - a.listingPrice);
        break;
      case "newest":
        summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "popular":
      default:
        summaries.sort(
          (a, b) =>
            b.orderCount - a.orderCount ||
            b.createdAt.localeCompare(a.createdAt),
        );
        break;
    }

    res.json(summaries);
  }),
);

type QuoteWithSupplier = Quote & { supplier: Supplier };

function serializeQuote(q: QuoteWithSupplier) {
  return {
    id: q.id,
    sessionId: q.sessionId,
    supplier: serializeSupplier(q.supplier),
    unitCost: Number(q.unitCost),
    setupFee: Number(q.setupFee),
    totalCost: Number(q.totalCost),
    leadTimeDays: q.leadTimeDays,
    processBreakdown: q.processBreakdown,
    scoreFactors: q.scoreFactors,
    rank: q.rank,
    notes: q.notes,
    createdAt: q.createdAt.toISOString(),
  };
}

async function loadQuotesForSession(sessionId: number): Promise<QuoteWithSupplier[]> {
  const rows = await db
    .select({ quote: quotesTable, supplier: suppliersTable })
    .from(quotesTable)
    .innerJoin(suppliersTable, eq(suppliersTable.id, quotesTable.supplierId))
    .where(eq(quotesTable.sessionId, sessionId))
    .orderBy(asc(quotesTable.rank));
  return rows.map((r) => ({ ...r.quote, supplier: r.supplier }));
}

async function ensureQuotesForListing(
  sessionId: number,
  output: typeof designOutputsTable.$inferSelect,
): Promise<QuoteWithSupplier[]> {
  const existing = await loadQuotesForSession(sessionId);
  if (existing.length > 0) return existing;

  const suppliers = await db.select().from(suppliersTable);
  const ranked = rankSuppliers(
    {
      productName: output.productName,
      processes: output.processes,
      materials: output.materials,
      bom: output.bom,
      costEstimate: output.costEstimate,
    },
    suppliers,
  );
  if (ranked.length === 0) return [];

  await db.insert(quotesTable).values(
    ranked.map((r, idx) => ({
      sessionId,
      supplierId: r.supplier.id,
      unitCost: String(r.unitCost),
      setupFee: String(r.setupFee),
      totalCost: String(r.totalCost),
      leadTimeDays: r.leadTimeDays,
      processBreakdown: r.processBreakdown,
      scoreFactors: r.scoreFactors,
      rank: idx + 1,
      notes: r.notes,
    })),
  );
  return loadQuotesForSession(sessionId);
}

router.get(
  "/marketplace/listings/:id",
  // Rate-limited because the first request for a listing can lazily generate
  // and persist quotes (DB writes + supplier ranking compute).
  mutateLimiter,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(GetMarketplaceListingParams, req.params);
    const [listing] = await db
      .select()
      .from(marketplaceListingsTable)
      .where(
        and(
          eq(marketplaceListingsTable.id, params.id),
          isNull(marketplaceListingsTable.deletedAt),
        ),
      );
    if (!listing) throw notFound("Listing");
    const [output] = await db
      .select()
      .from(designOutputsTable)
      .where(eq(designOutputsTable.sessionId, listing.sessionId))
      .orderBy(desc(designOutputsTable.createdAt))
      .limit(1);
    if (!output) throw notFound("Listing has no design output");
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.marketplaceListingId, listing.id),
          isNull(ordersTable.deletedAt),
        ),
      );
    const quotes = await ensureQuotesForListing(listing.sessionId, output);
    res.json({
      id: listing.id,
      sessionId: listing.sessionId,
      userId: listing.userId,
      creatorHandle: listing.creatorHandle,
      title: listing.title,
      category: listing.category,
      description: listing.description,
      listingPrice: Number(listing.listingPrice),
      orderCount: c ?? 0,
      designOutput: serializeOutput(output),
      quotes: quotes.map(serializeQuote),
      createdAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
    });
  }),
);

router.post(
  "/marketplace/listings",
  requireAuth,
  mutateLimiter,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(PublishListingBody, req.body);
    const userId = req.userId!;
    const { sessionId, title, category, description, listingPrice } = body;

    const [session] = await db
      .select()
      .from(designSessionsTable)
      .where(
        and(
          eq(designSessionsTable.id, sessionId),
          isNull(designSessionsTable.deletedAt),
        ),
      );
    if (!session) throw notFound("Session");
    if (session.userId !== userId) throw forbidden("Not session owner");
    if (session.status !== "ready") {
      throw badRequest("Session is not ready to publish");
    }

    const handle = await resolveHandle(userId);

    const [existing] = await db
      .select()
      .from(marketplaceListingsTable)
      .where(eq(marketplaceListingsTable.sessionId, sessionId));

    let listing: MarketplaceListing;
    let auditAction: "listing.publish" | "listing.update";
    if (existing) {
      const [updated] = await db
        .update(marketplaceListingsTable)
        .set({
          title,
          category,
          description,
          listingPrice: String(listingPrice),
          status: "active",
          creatorHandle: handle,
          // Re-publish: clear any previous soft-delete tombstone.
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceListingsTable.id, existing.id))
        .returning();
      listing = updated!;
      auditAction =
        existing.status === "active" && existing.deletedAt == null
          ? "listing.update"
          : "listing.publish";
    } else {
      const [created] = await db
        .insert(marketplaceListingsTable)
        .values({
          sessionId,
          userId,
          creatorHandle: handle,
          title,
          category,
          description,
          listingPrice: String(listingPrice),
          status: "active",
        })
        .returning();
      listing = created!;
      auditAction = "listing.publish";
    }
    await recordAudit({
      actorUserId: userId,
      action: auditAction,
      targetType: "marketplace_listing",
      targetId: listing.id,
      before: existing
        ? {
            status: existing.status,
            title: existing.title,
            listingPrice: existing.listingPrice,
            deletedAt: existing.deletedAt,
          }
        : null,
      after: {
        status: listing.status,
        title: listing.title,
        listingPrice: listing.listingPrice,
      },
      requestId: req.id ? String(req.id) : null,
    });

    const [output] = await db
      .select()
      .from(designOutputsTable)
      .where(eq(designOutputsTable.sessionId, sessionId))
      .orderBy(desc(designOutputsTable.createdAt))
      .limit(1);
    if (!output) throw badRequest("Session has no design output");
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.marketplaceListingId, listing.id),
          isNull(ordersTable.deletedAt),
        ),
      );
    const quotes = await ensureQuotesForListing(sessionId, output);
    res.status(201).json({
      id: listing.id,
      sessionId: listing.sessionId,
      userId: listing.userId,
      creatorHandle: listing.creatorHandle,
      title: listing.title,
      category: listing.category,
      description: listing.description,
      listingPrice: Number(listing.listingPrice),
      orderCount: c ?? 0,
      designOutput: serializeOutput(output),
      quotes: quotes.map(serializeQuote),
      createdAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
    });
  }),
);

router.delete(
  "/marketplace/listings/:id",
  requireAuth,
  mutateLimiter,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(UnpublishListingParams, req.params);
    const [listing] = await db
      .select()
      .from(marketplaceListingsTable)
      .where(
        and(
          eq(marketplaceListingsTable.id, params.id),
          isNull(marketplaceListingsTable.deletedAt),
        ),
      );
    if (!listing) throw notFound("Listing");
    if (listing.userId !== req.userId) throw forbidden("Not owner");
    // Soft-delete: keep the row so existing orders that reference it remain
    // resolvable (designer order list shows `listingDeleted: true`).
    await db
      .update(marketplaceListingsTable)
      .set({
        deletedAt: new Date(),
        status: "removed",
        updatedAt: new Date(),
      })
      .where(eq(marketplaceListingsTable.id, listing.id));
    // Best-effort orphan cleanup: the underlying session normally retains
    // ownership of the concept image, but if the session itself is already
    // soft-deleted then the image is unreachable and safe to drop.
    try {
      const [session] = await db
        .select({
          deletedAt: designSessionsTable.deletedAt,
        })
        .from(designSessionsTable)
        .where(eq(designSessionsTable.id, listing.sessionId));
      if (session?.deletedAt) {
        const outs = await db
          .select({ imageUrl: designOutputsTable.imageUrl })
          .from(designOutputsTable)
          .where(eq(designOutputsTable.sessionId, listing.sessionId));
        await Promise.all(outs.map((o) => deleteObjectByUrl(o.imageUrl)));
      }
    } catch (err) {
      req.log.warn(
        { err, listingId: listing.id },
        "Failed to enqueue object deletion for unpublished listing",
      );
    }
    await recordAudit({
      actorUserId: req.userId!,
      action: "listing.unpublish",
      targetType: "marketplace_listing",
      targetId: listing.id,
      before: { status: listing.status, title: listing.title },
      requestId: req.id ? String(req.id) : null,
    });
    res.sendStatus(204);
  }),
);

router.get(
  "/marketplace/profile/:userId",
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(GetDesignerProfileParams, req.params);
    const targetUserId = params.userId;
    const listings = await db
      .select()
      .from(marketplaceListingsTable)
      .where(
        and(
          eq(marketplaceListingsTable.userId, targetUserId),
          eq(marketplaceListingsTable.status, "active"),
          isNull(marketplaceListingsTable.deletedAt),
        ),
      )
      .orderBy(desc(marketplaceListingsTable.createdAt));

    const profile =
      (await loadProfilesByUserIds([targetUserId])).get(targetUserId) ?? null;
    const summaries = await Promise.all(
      listings.map((l) => buildSummary(l, profile)),
    );
    const totalOrders = summaries.reduce((sum, s) => sum + s.orderCount, 0);
    const [{ payouts: totalPayouts }] = await db
      .select({
        payouts: sql<string>`coalesce(sum(${ordersTable.payoutAmount}), 0)::text`,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.designerUserId, targetUserId),
          isNull(ordersTable.deletedAt),
        ),
      );
    const handle =
      listings[0]?.creatorHandle ?? (await resolveHandle(targetUserId));

    res.json({
      userId: targetUserId,
      handle,
      displayName: profile?.displayName ?? null,
      bio: profile?.bio ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      listings: summaries,
      totalListings: summaries.length,
      totalOrders,
      totalPayouts: Number(totalPayouts ?? 0),
    });
  }),
);

export default router;
