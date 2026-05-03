import { Router, type IRouter } from "express";
import { eq, desc, and, asc, sql, inArray } from "drizzle-orm";
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
    .where(eq(ordersTable.marketplaceListingId, listing.id));
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

router.get("/marketplace/listings", async (req, res): Promise<void> => {
  const params = ListMarketplaceListingsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { category, sort } = params.data;

  const conds = [eq(marketplaceListingsTable.status, "active")];
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
});

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

router.get("/marketplace/listings/:id", async (req, res): Promise<void> => {
  const params = GetMarketplaceListingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [listing] = await db
    .select()
    .from(marketplaceListingsTable)
    .where(eq(marketplaceListingsTable.id, params.data.id));
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  const [output] = await db
    .select()
    .from(designOutputsTable)
    .where(eq(designOutputsTable.sessionId, listing.sessionId))
    .orderBy(desc(designOutputsTable.createdAt))
    .limit(1);
  if (!output) {
    res.status(404).json({ error: "Listing has no design output" });
    return;
  }
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(eq(ordersTable.marketplaceListingId, listing.id));
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
});

router.post(
  "/marketplace/listings",
  requireAuth,
  async (req, res): Promise<void> => {
    const body = PublishListingBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const userId = req.userId!;
    const { sessionId, title, category, description, listingPrice } = body.data;

    const [session] = await db
      .select()
      .from(designSessionsTable)
      .where(eq(designSessionsTable.id, sessionId));
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    if (session.userId !== userId) {
      res.status(403).json({ error: "Not session owner" });
      return;
    }
    if (session.status !== "ready") {
      res.status(400).json({ error: "Session is not ready to publish" });
      return;
    }

    const handle = await resolveHandle(userId);

    const [existing] = await db
      .select()
      .from(marketplaceListingsTable)
      .where(eq(marketplaceListingsTable.sessionId, sessionId));

    let listing: MarketplaceListing;
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
          updatedAt: new Date(),
        })
        .where(eq(marketplaceListingsTable.id, existing.id))
        .returning();
      listing = updated!;
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
    }

    const [output] = await db
      .select()
      .from(designOutputsTable)
      .where(eq(designOutputsTable.sessionId, sessionId))
      .orderBy(desc(designOutputsTable.createdAt))
      .limit(1);
    if (!output) {
      res.status(400).json({ error: "Session has no design output" });
      return;
    }
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(ordersTable)
      .where(eq(ordersTable.marketplaceListingId, listing.id));
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
  },
);

router.delete(
  "/marketplace/listings/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UnpublishListingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [listing] = await db
      .select()
      .from(marketplaceListingsTable)
      .where(eq(marketplaceListingsTable.id, params.data.id));
    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    if (listing.userId !== req.userId) {
      res.status(403).json({ error: "Not owner" });
      return;
    }
    await db
      .delete(marketplaceListingsTable)
      .where(eq(marketplaceListingsTable.id, listing.id));
    res.sendStatus(204);
  },
);

router.get(
  "/marketplace/profile/:userId",
  async (req, res): Promise<void> => {
    const params = GetDesignerProfileParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const targetUserId = params.data.userId;
    const listings = await db
      .select()
      .from(marketplaceListingsTable)
      .where(
        and(
          eq(marketplaceListingsTable.userId, targetUserId),
          eq(marketplaceListingsTable.status, "active"),
        ),
      )
      .orderBy(desc(marketplaceListingsTable.createdAt));

    const profile =
      (await loadProfilesByUserIds([targetUserId])).get(targetUserId) ?? null;
    const summaries = await Promise.all(
      listings.map((l) => buildSummary(l, profile)),
    );
    const totalOrders = summaries.reduce((sum, s) => sum + s.orderCount, 0);
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
    });
  },
);

export default router;
