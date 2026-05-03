import { Router, type IRouter } from "express";
import { eq, desc, and, asc, sql, inArray, isNull } from "@workspace/db";
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
  CountMarketplaceListingsQueryParams,
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

/**
 * Cursor encoding. Cursors are base64url-encoded JSON of
 * `{ s: sort, k: tuple }` so we can both detect a stale cursor (sort
 * changed mid-scroll) and keep the encoded value small. We never trust
 * the cursor — invalid cursors return 400.
 */
type SortKey = "popular" | "recent" | "price-asc" | "price-desc";

interface CursorPayload {
  s: SortKey;
  /** Sort-specific tuple: e.g. [orderCount, id] for popular. */
  k: (number | string)[];
}

function encodeCursor(p: CursorPayload): string {
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
}

function decodeCursor(raw: string, expectedSort: SortKey): CursorPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw badRequest("Invalid cursor.");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as CursorPayload).k) ||
    (parsed as CursorPayload).s !== expectedSort
  ) {
    // Sort flipped after the cursor was minted — caller should restart
    // pagination from the top with no cursor.
    throw badRequest(
      "Cursor is incompatible with the current sort. Re-fetch from the start.",
    );
  }
  // Per-sort tuple validation. Keep this aligned with how cursors are
  // minted at the bottom of the listings handler — a malformed tuple
  // would otherwise reach the SQL builder and produce a 500.
  const k = (parsed as CursorPayload).k;
  const isFiniteNum = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  let ok = false;
  switch (expectedSort) {
    case "popular":
      ok = k.length === 2 && isFiniteNum(k[0]) && isFiniteNum(k[1]);
      break;
    case "recent":
      ok =
        k.length === 2 &&
        typeof k[0] === "string" &&
        !Number.isNaN(Date.parse(k[0])) &&
        isFiniteNum(k[1]);
      break;
    case "price-asc":
    case "price-desc":
      ok = k.length === 2 && isFiniteNum(k[0]) && isFiniteNum(k[1]);
      break;
  }
  if (!ok) throw badRequest("Invalid cursor.");
  return parsed as CursorPayload;
}

/**
 * Resolve `creator` (which may be a Clerk userId, a handle, or @handle)
 * to a concrete userId. Returns null when the creator string is set but
 * doesn't match any known designer — the route then short-circuits to
 * an empty page rather than ignoring the filter.
 */
async function resolveCreatorFilter(
  creator: string | undefined,
): Promise<string | null | undefined> {
  if (!creator) return undefined;
  const stripped = creator.startsWith("@") ? creator.slice(1) : creator;
  // Already a Clerk-style userId? (`user_…`)
  if (/^user_[A-Za-z0-9]+$/.test(stripped)) return stripped;
  // Otherwise try matching as a creator_handle on a published listing.
  const [row] = await db
    .select({ userId: marketplaceListingsTable.userId })
    .from(marketplaceListingsTable)
    .where(eq(marketplaceListingsTable.creatorHandle, stripped))
    .limit(1);
  return row?.userId ?? null;
}

interface ListingFilters {
  q: string | undefined;
  category: string | undefined;
  minPrice: number | undefined;
  maxPrice: number | undefined;
  creatorUserId: string | null | undefined;
}

function buildFilterClauses(filters: ListingFilters): {
  whereSql: ReturnType<typeof sql>;
  hasQuery: boolean;
} {
  const parts: ReturnType<typeof sql>[] = [
    sql`l.status = 'active' AND l.deleted_at IS NULL`,
  ];
  if (filters.category) {
    parts.push(sql`l.category = ${filters.category}`);
  }
  if (filters.minPrice != null) {
    parts.push(sql`l.listing_price >= ${String(filters.minPrice)}`);
  }
  if (filters.maxPrice != null) {
    parts.push(sql`l.listing_price <= ${String(filters.maxPrice)}`);
  }
  if (filters.creatorUserId) {
    parts.push(sql`l.user_id = ${filters.creatorUserId}`);
  }
  let hasQuery = false;
  if (filters.q && filters.q.trim().length > 0) {
    hasQuery = true;
    const q = filters.q.trim();
    // Combine FTS (long, well-formed queries) with a trigram similarity
    // fallback (typo-tolerant for short queries). Either match makes the
    // row eligible; ordering for `q` results is handled in the sort
    // selection below.
    parts.push(
      sql`(
        l.search_vector @@ websearch_to_tsquery('english', ${q})
        OR l.title % ${q}
        OR l.title ILIKE ${"%" + q + "%"}
      )`,
    );
  }
  return {
    whereSql: sql.join(parts, sql` AND `),
    hasQuery,
  };
}

type ListingRow = {
  id: number;
  session_id: number;
  user_id: string;
  creator_handle: string;
  title: string;
  category: string;
  description: string;
  listing_price: string;
  // node-postgres returns timestamptz as a Date when the type parser is
  // installed and as an ISO string otherwise; we accept both and
  // normalise downstream.
  created_at: Date | string;
  order_count: number;
  thumbnail_url: string | null;
  primary_material: string | null;
  product_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
} & Record<string, unknown>;

function createdAtIso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

router.get(
  "/marketplace/listings",
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(ListMarketplaceListingsQueryParams, req.query);
    const sort: SortKey = params.sort ?? "popular";
    const limit = params.limit ?? 24;

    const creatorUserId = await resolveCreatorFilter(params.creator);
    if (params.creator && creatorUserId === null) {
      // Creator filter was specified but no such designer exists —
      // return an empty page deterministically rather than silently
      // ignoring the filter.
      res.json({ items: [], nextCursor: null });
      return;
    }

    const filters: ListingFilters = {
      q: params.q,
      category: params.category,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      creatorUserId,
    };
    const { whereSql } = buildFilterClauses(filters);

    // Cursor predicate (keyset). Always tie-break on id so the page is
    // deterministic across rows that share the primary sort value.
    let cursorPred = sql`TRUE`;
    if (params.cursor) {
      const cur = decodeCursor(params.cursor, sort);
      switch (sort) {
        case "popular": {
          const [oc, id] = cur.k as [number, number];
          cursorPred = sql`(coalesce(oc.order_count, 0), l.id) < (${oc}, ${id})`;
          break;
        }
        case "recent": {
          const [created, id] = cur.k as [string, number];
          cursorPred = sql`(l.created_at, l.id) < (${new Date(created)}, ${id})`;
          break;
        }
        case "price-asc": {
          const [price, id] = cur.k as [number, number];
          cursorPred = sql`(l.listing_price, l.id) > (${String(price)}, ${id})`;
          break;
        }
        case "price-desc": {
          const [price, id] = cur.k as [number, number];
          cursorPred = sql`(l.listing_price, l.id) < (${String(price)}, ${id})`;
          break;
        }
      }
    }

    let orderBy: ReturnType<typeof sql>;
    switch (sort) {
      case "popular":
        orderBy = sql`coalesce(oc.order_count, 0) DESC, l.id DESC`;
        break;
      case "recent":
        orderBy = sql`l.created_at DESC, l.id DESC`;
        break;
      case "price-asc":
        orderBy = sql`l.listing_price ASC, l.id ASC`;
        break;
      case "price-desc":
        orderBy = sql`l.listing_price DESC, l.id DESC`;
        break;
    }

    // Fetch limit+1 so we know whether a next page exists.
    const fetchLimit = limit + 1;
    const rows = await db.execute<ListingRow>(sql`
      SELECT
        l.id,
        l.session_id,
        l.user_id,
        l.creator_handle,
        l.title,
        l.category,
        l.description,
        l.listing_price,
        l.created_at,
        coalesce(oc.order_count, 0)::int AS order_count,
        o.image_url AS thumbnail_url,
        o.primary_material,
        o.product_name,
        up.display_name,
        up.avatar_url
      FROM marketplace_listings l
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS order_count
        FROM orders ord
        WHERE ord.marketplace_listing_id = l.id
          AND ord.deleted_at IS NULL
      ) oc ON TRUE
      LEFT JOIN LATERAL (
        SELECT image_url, primary_material, product_name
        FROM design_outputs
        WHERE session_id = l.session_id
        ORDER BY created_at DESC
        LIMIT 1
      ) o ON TRUE
      LEFT JOIN user_profiles up ON up.user_id = l.user_id
      WHERE ${whereSql} AND ${cursorPred}
      ORDER BY ${orderBy}
      LIMIT ${fetchLimit}
    `);

    const allRows = (rows as unknown as { rows: ListingRow[] }).rows;
    const hasMore = allRows.length > limit;
    const page = hasMore ? allRows.slice(0, limit) : allRows;

    let nextCursor: string | null = null;
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1]!;
      const tuple: (number | string)[] =
        sort === "popular"
          ? [last.order_count, last.id]
          : sort === "recent"
            ? [createdAtIso(last.created_at), last.id]
            : [Number(last.listing_price), last.id];
      nextCursor = encodeCursor({ s: sort, k: tuple });
    }

    const items = page.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      userId: r.user_id,
      creatorHandle: r.creator_handle,
      creatorDisplayName: r.display_name,
      creatorAvatarUrl: r.avatar_url,
      title: r.title,
      category: r.category,
      description: r.description,
      listingPrice: Number(r.listing_price),
      thumbnailUrl: r.thumbnail_url,
      primaryMaterial: r.primary_material,
      productName: r.product_name,
      orderCount: r.order_count,
      createdAt: createdAtIso(r.created_at),
    }));

    res.json({ items, nextCursor });
  }),
);

router.get(
  "/marketplace/listings/count",
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(CountMarketplaceListingsQueryParams, req.query);
    const creatorUserId = await resolveCreatorFilter(params.creator);
    if (params.creator && creatorUserId === null) {
      res.json({ total: 0 });
      return;
    }
    const { whereSql } = buildFilterClauses({
      q: params.q,
      category: params.category,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      creatorUserId,
    });
    const result = await db.execute<{ total: number }>(sql`
      SELECT count(*)::int AS total
      FROM marketplace_listings l
      WHERE ${whereSql}
    `);
    const total = (result as unknown as { rows: { total: number }[] }).rows[0]
      ?.total ?? 0;
    res.json({ total });
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
    // Listings are NOT inlined here anymore — the designer page loads
    // them via `listMarketplaceListings?creator=<userId>` so it shares
    // the paginated/searchable code path with the marketplace.
    const listings = await db
      .select({
        id: marketplaceListingsTable.id,
        creatorHandle: marketplaceListingsTable.creatorHandle,
      })
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
    const [{ totalOrders }] = await db
      .select({
        totalOrders: sql<number>`coalesce(count(*), 0)::int`,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.designerUserId, targetUserId),
          isNull(ordersTable.deletedAt),
        ),
      );
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
      totalListings: listings.length,
      totalOrders: Number(totalOrders ?? 0),
      totalPayouts: Number(totalPayouts ?? 0),
    });
  }),
);

export default router;
