import { Router, type IRouter } from "express";
import {
  eq,
  and,
  or,
  desc,
  asc,
  sql,
  inArray,
  isNull,
  isNotNull,
  ilike,
  gte,
} from "@workspace/db";
import { clerkClient } from "@clerk/express";
import {
  db,
  ordersTable,
  marketplaceListingsTable,
  designSessionsTable,
  designOutputsTable,
  suppliersTable,
  quotesTable,
  userProfilesTable,
  reportsTable,
  auditLogTable,
  recordAudit,
  type AdminOrderNote,
} from "@workspace/db";
import { z } from "zod";
import { asyncHandler } from "../middlewares/asyncHandler";
import { mutateLimiter } from "../middlewares/rateLimits";
import { parseOrThrow } from "../middlewares/validate";
import { requireAdmin, isAdminFromClaims } from "../middlewares/auth";
import { ApiError, badRequest, notFound } from "../lib/errors";
import { handleForUser } from "../lib/handles";
import { purgeDeletedAccounts } from "../lib/accountDeletion";
import { isStripeConfigured, refundOrder } from "../lib/stripe";
import { logger } from "../lib/logger";
import {
  AdminListListingsQueryParams,
  AdminUpdateListingParams,
  AdminUpdateListingBody,
  AdminListOrdersQueryParams,
  AdminGetOrderParams,
  AdminAddOrderNoteParams,
  AdminAddOrderNoteBody,
  AdminRefundOrderParams,
  AdminListUsersQueryParams,
  AdminGetUserParams,
  AdminSuspendUserParams,
  AdminSuspendUserBody,
  AdminUnsuspendUserParams,
  AdminListReportsQueryParams,
  AdminUpdateReportParams,
  AdminUpdateReportBody,
  AdminRefundOrderBody,
  CreateReportBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Legacy x-admin-token endpoints (cron-style). Kept for backwards
// compatibility — invoked by scheduled jobs, not the admin console.
// ─────────────────────────────────────────────────────────────────────────────

function requireAdminToken(req: { headers: Record<string, unknown> }): void {
  const expected = process.env["ADMIN_API_TOKEN"];
  if (!expected) {
    throw new ApiError(
      "INTERNAL",
      "ADMIN_API_TOKEN is not configured on the server.",
    );
  }
  const provided = String(req.headers["x-admin-token"] ?? "");
  if (provided !== expected) {
    throw new ApiError("UNAUTHENTICATED", "Invalid admin token");
  }
}

router.post(
  "/admin/purge-deleted",
  asyncHandler(async (req, res) => {
    requireAdminToken(req);
    const summary = await purgeDeletedAccounts();
    logger.info({ summary }, "admin purge completed");
    res.json(summary);
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers shared across admin routes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cheap public probe used by the SPA to know whether to render the admin
 * link. NOT gated by `requireAdmin` so callers don't get a hostile 403 in
 * the network panel; it just returns `{ isAdmin: false }` for non-admins.
 */
router.get(
  "/admin/me",
  asyncHandler(async (req, res) => {
    const isAdmin = isAdminFromClaims(req);
    res.json({ isAdmin, userId: req.userId ?? null });
  }),
);

interface ResolvedUser {
  userId: string;
  handle: string;
  email: string | null;
  imageUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
}

async function resolveClerkUsers(
  userIds: Iterable<string>,
): Promise<Map<string, ResolvedUser>> {
  const ids = Array.from(new Set(userIds)).filter(
    (id) => id && id !== "system-seed",
  );
  const out = new Map<string, ResolvedUser>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const u = await clerkClient.users.getUser(id);
        const email =
          u.primaryEmailAddress?.emailAddress ??
          u.emailAddresses[0]?.emailAddress ??
          null;
        const role = (u.publicMetadata as { role?: unknown } | undefined)?.role;
        out.set(id, {
          userId: id,
          handle: handleForUser(id, email, u.username ?? null, u.firstName),
          email,
          imageUrl: u.imageUrl ?? null,
          firstName: u.firstName ?? null,
          lastName: u.lastName ?? null,
          isAdmin: role === "admin",
        });
      } catch {
        out.set(id, {
          userId: id,
          handle: handleForUser(id, null, null, null),
          email: null,
          imageUrl: null,
          firstName: null,
          lastName: null,
          isAdmin: false,
        });
      }
    }),
  );
  return out;
}

async function loadProfilesByIds(
  userIds: Iterable<string>,
): Promise<Map<string, typeof userProfilesTable.$inferSelect>> {
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return new Map();
  const rows = await db
    .select()
    .from(userProfilesTable)
    .where(inArray(userProfilesTable.userId, ids));
  return new Map(rows.map((r) => [r.userId, r]));
}

// ─────────────────────────────────────────────────────────────────────────────
// /reports — public-auth report submission
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/reports",
  // requireAuth is applied below (we want suspension enforcement).
  // We import requireAuth lazily so the file stays self-contained.
  (req, res, next) => {
    void import("../middlewares/auth").then(({ requireAuth }) =>
      requireAuth(req, res, next),
    );
  },
  mutateLimiter,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(CreateReportBody, req.body);
    const reporter = req.userId!;

    // Light existence check so users get a 404 rather than admins seeing a
    // report on a target that doesn't exist.
    if (body.targetType === "listing") {
      const id = Number(body.targetId);
      if (!Number.isFinite(id) || id <= 0) throw badRequest("Invalid targetId");
      const [l] = await db
        .select({ id: marketplaceListingsTable.id })
        .from(marketplaceListingsTable)
        .where(eq(marketplaceListingsTable.id, id));
      if (!l) throw notFound("Listing");
    } else if (body.targetType === "order") {
      const id = Number(body.targetId);
      if (!Number.isFinite(id) || id <= 0) throw badRequest("Invalid targetId");
    }

    const [row] = await db
      .insert(reportsTable)
      .values({
        reporterUserId: reporter,
        targetType: body.targetType,
        targetId: body.targetId,
        reason: body.reason,
        notes: body.notes ?? null,
        status: "open",
      })
      .returning();

    await recordAudit({
      actorUserId: reporter,
      action: "admin.report.create",
      targetType: "report",
      targetId: row!.id,
      after: {
        targetType: body.targetType,
        targetId: body.targetId,
        reason: body.reason,
      },
      requestId: req.id ? String(req.id) : null,
    });

    res.status(201).json({
      id: row!.id,
      reporterUserId: row!.reporterUserId,
      targetType: row!.targetType,
      targetId: row!.targetId,
      reason: row!.reason,
      notes: row!.notes,
      status: row!.status,
      resolvedBy: row!.resolvedBy,
      resolvedAt: row!.resolvedAt?.toISOString() ?? null,
      resolutionNotes: row!.resolutionNotes,
      createdAt: row!.createdAt.toISOString(),
      updatedAt: row!.updatedAt.toISOString(),
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// /admin/dashboard
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/admin/dashboard",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      [openReports],
      [activeListings],
      [hiddenListings],
      [removedListings],
      [ordersAwaitingPayment],
      [ordersInProgress],
      [suspendedUsers],
      [last24hOrders],
      [last24hReports],
    ] = await Promise.all([
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(eq(reportsTable.status, "open")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(marketplaceListingsTable)
        .where(
          and(
            eq(marketplaceListingsTable.status, "active"),
            isNull(marketplaceListingsTable.deletedAt),
          ),
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(marketplaceListingsTable)
        .where(eq(marketplaceListingsTable.status, "hidden")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(marketplaceListingsTable)
        .where(eq(marketplaceListingsTable.status, "removed")),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.paymentStatus, "pending_payment"),
            isNull(ordersTable.deletedAt),
          ),
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(ordersTable)
        .where(
          and(
            inArray(ordersTable.status, [
              "queued",
              "in_production",
              "quality_check",
              "shipped",
            ]),
            eq(ordersTable.paymentStatus, "paid"),
            isNull(ordersTable.deletedAt),
          ),
        ),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(userProfilesTable)
        .where(isNotNull(userProfilesTable.suspendedAt)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(ordersTable)
        .where(gte(ordersTable.createdAt, since24h)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(reportsTable)
        .where(gte(reportsTable.createdAt, since24h)),
    ]);

    res.json({
      openReports: openReports?.c ?? 0,
      activeListings: activeListings?.c ?? 0,
      hiddenListings: hiddenListings?.c ?? 0,
      removedListings: removedListings?.c ?? 0,
      ordersAwaitingPayment: ordersAwaitingPayment?.c ?? 0,
      ordersInProgress: ordersInProgress?.c ?? 0,
      suspendedUsers: suspendedUsers?.c ?? 0,
      last24hOrders: last24hOrders?.c ?? 0,
      last24hReports: last24hReports?.c ?? 0,
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// /admin/listings
// ─────────────────────────────────────────────────────────────────────────────

async function buildListingRow(
  l: typeof marketplaceListingsTable.$inferSelect,
): Promise<unknown> {
  const [output] = await db
    .select({ imageUrl: designOutputsTable.imageUrl })
    .from(designOutputsTable)
    .where(eq(designOutputsTable.sessionId, l.sessionId))
    .orderBy(desc(designOutputsTable.createdAt))
    .limit(1);
  const [{ c }] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.marketplaceListingId, l.id),
        isNull(ordersTable.deletedAt),
      ),
    );
  return {
    id: l.id,
    sessionId: l.sessionId,
    userId: l.userId,
    creatorHandle: l.creatorHandle,
    title: l.title,
    category: l.category,
    description: l.description,
    listingPrice: Number(l.listingPrice),
    status: l.status,
    thumbnailUrl: output?.imageUrl ?? null,
    orderCount: c ?? 0,
    deletedAt: l.deletedAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

router.get(
  "/admin/listings",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const q = parseOrThrow(AdminListListingsQueryParams, req.query);
    const status = q.status ?? "all";
    const limit = q.limit ?? 50;
    const where: ReturnType<typeof and>[] = [];
    if (status === "active") {
      where.push(
        and(
          eq(marketplaceListingsTable.status, "active"),
          isNull(marketplaceListingsTable.deletedAt),
        )!,
      );
    } else if (status === "hidden") {
      where.push(eq(marketplaceListingsTable.status, "hidden"));
    } else if (status === "removed") {
      where.push(
        or(
          eq(marketplaceListingsTable.status, "removed"),
          isNotNull(marketplaceListingsTable.deletedAt),
        )!,
      );
    }
    if (q.q) {
      const pattern = `%${q.q}%`;
      where.push(
        or(
          ilike(marketplaceListingsTable.title, pattern),
          ilike(marketplaceListingsTable.creatorHandle, pattern),
          ilike(marketplaceListingsTable.category, pattern),
        )!,
      );
    }
    const rows = await db
      .select()
      .from(marketplaceListingsTable)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(marketplaceListingsTable.createdAt))
      .limit(limit);
    const out = await Promise.all(rows.map(buildListingRow));
    res.json(out);
  }),
);

router.patch(
  "/admin/listings/:id",
  requireAdmin,
  mutateLimiter,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(AdminUpdateListingParams, req.params);
    const body = parseOrThrow(AdminUpdateListingBody, req.body);
    const [existing] = await db
      .select()
      .from(marketplaceListingsTable)
      .where(eq(marketplaceListingsTable.id, params.id));
    if (!existing) throw notFound("Listing");

    const before = {
      status: existing.status,
      deletedAt: existing.deletedAt?.toISOString() ?? null,
    };
    let action: "admin.listing.hide" | "admin.listing.restore" | "admin.listing.remove";
    let next: { status: string; deletedAt: Date | null };
    if (body.action === "hide") {
      next = { status: "hidden", deletedAt: null };
      action = "admin.listing.hide";
    } else if (body.action === "restore") {
      next = { status: "active", deletedAt: null };
      action = "admin.listing.restore";
    } else {
      // 'remove' — soft-delete tombstone so existing orders keep their title
      // but the listing disappears from every public surface.
      next = { status: "removed", deletedAt: new Date() };
      action = "admin.listing.remove";
    }

    const [updated] = await db
      .update(marketplaceListingsTable)
      .set({
        status: next.status,
        deletedAt: next.deletedAt,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceListingsTable.id, params.id))
      .returning();

    await recordAudit({
      actorUserId: req.userId!,
      action,
      targetType: "marketplace_listing",
      targetId: existing.id,
      before,
      after: {
        status: updated!.status,
        deletedAt: updated!.deletedAt?.toISOString() ?? null,
        reason: body.reason ?? null,
      },
      requestId: req.id ? String(req.id) : null,
    });

    res.json(await buildListingRow(updated!));
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// /admin/orders
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/admin/orders",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const q = parseOrThrow(AdminListOrdersQueryParams, req.query);
    const status = q.status ?? "all";
    const paymentStatus = q.paymentStatus ?? "all";
    const limit = q.limit ?? 50;
    const where: ReturnType<typeof and>[] = [isNull(ordersTable.deletedAt)!];
    if (status !== "all") where.push(eq(ordersTable.status, status)!);
    if (paymentStatus !== "all")
      where.push(eq(ordersTable.paymentStatus, paymentStatus)!);

    let rows = await db
      .select({
        order: ordersTable,
        supplier: suppliersTable,
        session: designSessionsTable,
      })
      .from(ordersTable)
      .innerJoin(suppliersTable, eq(suppliersTable.id, ordersTable.supplierId))
      .innerJoin(
        designSessionsTable,
        eq(designSessionsTable.id, ordersTable.sessionId),
      )
      .where(and(...where))
      .orderBy(desc(ordersTable.createdAt))
      .limit(limit * 2); // overfetch a little so the post-filter q still hits limit

    if (q.q) {
      const needle = q.q.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.session.title.toLowerCase().includes(needle) ||
          r.supplier.name.toLowerCase().includes(needle) ||
          String(r.order.id).includes(needle) ||
          (r.order.userId ?? "").toLowerCase().includes(needle),
      );
    }
    rows = rows.slice(0, limit);

    const buyers = await resolveClerkUsers(rows.map((r) => r.order.userId));
    const designers = await resolveClerkUsers(
      rows
        .map((r) => r.order.designerUserId)
        .filter((id): id is string => !!id),
    );
    const listingIds = Array.from(
      new Set(
        rows
          .map((r) => r.order.marketplaceListingId)
          .filter((id): id is number => !!id),
      ),
    );
    const listingById = new Map<number, typeof marketplaceListingsTable.$inferSelect>();
    if (listingIds.length) {
      const ll = await db
        .select()
        .from(marketplaceListingsTable)
        .where(inArray(marketplaceListingsTable.id, listingIds));
      for (const l of ll) listingById.set(l.id, l);
    }

    res.json(
      rows.map((r) => {
        const listing = r.order.marketplaceListingId
          ? listingById.get(r.order.marketplaceListingId) ?? null
          : null;
        const notes = (r.order.adminNotes as AdminOrderNote[] | null) ?? [];
        return {
          id: r.order.id,
          userId: r.order.userId,
          buyerHandle: buyers.get(r.order.userId)?.handle ?? null,
          designerUserId: r.order.designerUserId,
          designerHandle: r.order.designerUserId
            ? designers.get(r.order.designerUserId)?.handle ?? null
            : null,
          listingId: r.order.marketplaceListingId,
          listingTitle: listing?.title ?? null,
          sessionTitle: r.session.title,
          supplierName: r.supplier.name,
          status: r.order.status,
          paymentStatus: r.order.paymentStatus,
          quantity: r.order.quantity,
          totalCost: Number(r.order.totalCost),
          refundedAmount: Number(r.order.refundedAmount),
          adminNoteCount: notes.length,
          createdAt: r.order.createdAt.toISOString(),
        };
      }),
    );
  }),
);

async function loadAdminOrderDetail(orderId: number, _actorId: string) {
  const [row] = await db
    .select({
      order: ordersTable,
      supplier: suppliersTable,
      session: designSessionsTable,
      quote: quotesTable,
    })
    .from(ordersTable)
    .innerJoin(suppliersTable, eq(suppliersTable.id, ordersTable.supplierId))
    .innerJoin(
      designSessionsTable,
      eq(designSessionsTable.id, ordersTable.sessionId),
    )
    .innerJoin(quotesTable, eq(quotesTable.id, ordersTable.quoteId))
    .where(eq(ordersTable.id, orderId));
  if (!row) return null;

  const adminNotesRaw = (row.order.adminNotes as AdminOrderNote[] | null) ?? [];
  const noteAuthorIds = adminNotesRaw.map((n) => n.by);
  const auditRows = await db
    .select()
    .from(auditLogTable)
    .where(
      and(
        eq(auditLogTable.targetType, "order"),
        eq(auditLogTable.targetId, String(orderId)),
      ),
    )
    .orderBy(desc(auditLogTable.createdAt))
    .limit(50);

  const allUserIds = [
    row.order.userId,
    ...(row.order.designerUserId ? [row.order.designerUserId] : []),
    ...noteAuthorIds,
    ...auditRows
      .map((a) => a.actorUserId)
      .filter((id): id is string => !!id),
  ];
  const users = await resolveClerkUsers(allUserIds);

  const listing = row.order.marketplaceListingId
    ? (
        await db
          .select()
          .from(marketplaceListingsTable)
          .where(
            eq(
              marketplaceListingsTable.id,
              row.order.marketplaceListingId,
            ),
          )
      )[0] ?? null
    : null;

  return {
    order: {
      id: row.order.id,
      sessionId: row.order.sessionId,
      sessionTitle: row.session.title,
      productName: null,
      quote: {
        id: row.quote.id,
        sessionId: row.quote.sessionId,
        supplier: {
          id: row.supplier.id,
          slug: row.supplier.slug,
          name: row.supplier.name,
          tagline: row.supplier.tagline,
          description: row.supplier.description,
          location: row.supplier.location,
          country: row.supplier.country,
          capabilities: row.supplier.capabilities,
          materials: row.supplier.materials,
          certifications: row.supplier.certifications,
          leadTimeMinDays: row.supplier.leadTimeMinDays,
          leadTimeMaxDays: row.supplier.leadTimeMaxDays,
          pricingMultiplier: Number(row.supplier.pricingMultiplier),
          setupFee: Number(row.supplier.setupFee),
          rating: Number(row.supplier.rating),
          capacityLevel: row.supplier.capacityLevel,
        },
        unitCost: Number(row.quote.unitCost),
        setupFee: Number(row.quote.setupFee),
        totalCost: Number(row.quote.totalCost),
        leadTimeDays: row.quote.leadTimeDays,
        processBreakdown: row.quote.processBreakdown,
        scoreFactors: row.quote.scoreFactors,
        rank: row.quote.rank,
        notes: row.quote.notes,
        createdAt: row.quote.createdAt.toISOString(),
      },
      supplier: {
        id: row.supplier.id,
        slug: row.supplier.slug,
        name: row.supplier.name,
        tagline: row.supplier.tagline,
        description: row.supplier.description,
        location: row.supplier.location,
        country: row.supplier.country,
        capabilities: row.supplier.capabilities,
        materials: row.supplier.materials,
        certifications: row.supplier.certifications,
        leadTimeMinDays: row.supplier.leadTimeMinDays,
        leadTimeMaxDays: row.supplier.leadTimeMaxDays,
        pricingMultiplier: Number(row.supplier.pricingMultiplier),
        setupFee: Number(row.supplier.setupFee),
        rating: Number(row.supplier.rating),
        capacityLevel: row.supplier.capacityLevel,
      },
      quantity: row.order.quantity,
      totalCost: Number(row.order.totalCost),
      payoutAmount: Number(row.order.payoutAmount),
      designerUserId: row.order.designerUserId,
      leadTimeDays: row.order.leadTimeDays,
      shippingAddress: row.order.shippingAddress,
      status: row.order.status,
      statusHistory: row.order.statusHistory,
      paymentStatus: row.order.paymentStatus,
      refundedAmount: Number(row.order.refundedAmount),
      createdAt: row.order.createdAt.toISOString(),
      updatedAt: row.order.updatedAt.toISOString(),
    },
    userId: row.order.userId,
    buyerHandle: users.get(row.order.userId)?.handle ?? null,
    designerHandle: row.order.designerUserId
      ? users.get(row.order.designerUserId)?.handle ?? null
      : null,
    listingId: row.order.marketplaceListingId,
    listingTitle: listing?.title ?? null,
    adminNotes: adminNotesRaw.map((n) => ({
      by: n.by,
      at: n.at,
      text: n.text,
      byHandle: users.get(n.by)?.handle ?? null,
    })),
    auditLog: auditRows.map((a) => ({
      id: a.id,
      actorUserId: a.actorUserId,
      actorHandle: a.actorUserId
        ? users.get(a.actorUserId)?.handle ?? null
        : null,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      before: a.before,
      after: a.after,
      requestId: a.requestId,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

router.get(
  "/admin/orders/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(AdminGetOrderParams, req.params);
    const detail = await loadAdminOrderDetail(params.id, req.userId!);
    if (!detail) throw notFound("Order");
    res.json(detail);
  }),
);

router.post(
  "/admin/orders/:id/notes",
  requireAdmin,
  mutateLimiter,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(AdminAddOrderNoteParams, req.params);
    const body = parseOrThrow(AdminAddOrderNoteBody, req.body);
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, params.id));
    if (!order) throw notFound("Order");

    const note: AdminOrderNote = {
      by: req.userId!,
      at: new Date().toISOString(),
      text: body.text.trim(),
    };
    const next = [...((order.adminNotes as AdminOrderNote[] | null) ?? []), note];
    await db
      .update(ordersTable)
      .set({ adminNotes: next, updatedAt: new Date() })
      .where(eq(ordersTable.id, params.id));

    await recordAudit({
      actorUserId: req.userId!,
      action: "admin.order.note",
      targetType: "order",
      targetId: order.id,
      after: { textLength: note.text.length },
      requestId: req.id ? String(req.id) : null,
    });

    const detail = await loadAdminOrderDetail(params.id, req.userId!);
    res.json(detail);
  }),
);

router.post(
  "/admin/orders/:id/refund",
  requireAdmin,
  mutateLimiter,
  asyncHandler(async (req, res) => {
    if (!isStripeConfigured()) {
      throw new ApiError(
        "INTERNAL",
        "Stripe is not configured on the server (STRIPE_SECRET_KEY missing).",
      );
    }
    const params = parseOrThrow(AdminRefundOrderParams, req.params);
    const body = parseOrThrow(AdminRefundOrderBody, req.body);

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, params.id));
    if (!order) throw notFound("Order");
    if (!order.stripePaymentIntentId)
      throw badRequest("Order has no Stripe payment_intent — nothing to refund.");
    if (order.paymentStatus === "pending_payment")
      throw badRequest("Order has not been paid yet.");
    if (order.paymentStatus === "refunded")
      throw badRequest("Order is already fully refunded.");

    const remaining = Number(order.totalCost) - Number(order.refundedAmount);
    const requested = body.amount ?? remaining;
    if (requested > remaining + 0.005) {
      throw badRequest(
        `Refund amount $${requested.toFixed(2)} exceeds remaining $${remaining.toFixed(2)}.`,
      );
    }

    const refund = await refundOrder({
      orderId: order.id,
      paymentIntentId: order.stripePaymentIntentId,
      amountDollars: body.amount ?? null,
      alreadyRefundedDollars: Number(order.refundedAmount),
      totalDollars: Number(order.totalCost),
      reason: body.reason,
    });

    await recordAudit({
      actorUserId: req.userId!,
      action: "admin.order.refund_initiated",
      targetType: "order",
      targetId: order.id,
      before: {
        paymentStatus: order.paymentStatus,
        refundedAmount: order.refundedAmount,
      },
      after: {
        refundId: refund.id,
        amount: requested,
        reason: body.reason ?? null,
      },
      requestId: req.id ? String(req.id) : null,
    });

    res.json({
      orderId: order.id,
      refundId: refund.id,
      amount: requested,
      status: refund.status,
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// /admin/users
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/admin/users",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const q = parseOrThrow(AdminListUsersQueryParams, req.query);
    const limit = q.limit ?? 50;
    const status = q.status ?? "all";

    // Strategy: search Clerk by email/name when `q` looks like one,
    // intersect with our profiles for status filtering. When no `q`,
    // page Clerk users by created date.
    const clerkPage = await clerkClient.users.getUserList({
      query: q.q ?? undefined,
      limit: Math.min(100, limit * 2),
      orderBy: "-created_at",
    });
    const clerkUsers = clerkPage.data;
    const profiles = await loadProfilesByIds(clerkUsers.map((u) => u.id));

    let rows = clerkUsers.map((u) => {
      const profile = profiles.get(u.id);
      const email =
        u.primaryEmailAddress?.emailAddress ??
        u.emailAddresses[0]?.emailAddress ??
        null;
      const role = (u.publicMetadata as { role?: unknown } | undefined)?.role;
      return {
        userId: u.id,
        handle: handleForUser(u.id, email, u.username ?? null, u.firstName),
        email,
        displayName: profile?.displayName ?? null,
        avatarUrl: profile?.avatarUrl ?? u.imageUrl ?? null,
        isAdmin: role === "admin",
        suspendedAt: profile?.suspendedAt?.toISOString() ?? null,
        suspensionReason: profile?.suspensionReason ?? null,
        deletedAt: profile?.deletedAt?.toISOString() ?? null,
        listingCount: 0,
        orderCount: 0,
        createdAt: u.createdAt
          ? new Date(u.createdAt).toISOString()
          : null,
      };
    });

    if (status === "active") {
      rows = rows.filter((r) => !r.suspendedAt && !r.deletedAt);
    } else if (status === "suspended") {
      rows = rows.filter((r) => !!r.suspendedAt);
    } else if (status === "deleted") {
      rows = rows.filter((r) => !!r.deletedAt);
    }
    rows = rows.slice(0, limit);

    // Counts in one shot.
    if (rows.length) {
      const ids = rows.map((r) => r.userId);
      const [listingCounts, orderCounts] = await Promise.all([
        db
          .select({
            userId: marketplaceListingsTable.userId,
            c: sql<number>`count(*)::int`,
          })
          .from(marketplaceListingsTable)
          .where(inArray(marketplaceListingsTable.userId, ids))
          .groupBy(marketplaceListingsTable.userId),
        db
          .select({
            userId: ordersTable.userId,
            c: sql<number>`count(*)::int`,
          })
          .from(ordersTable)
          .where(inArray(ordersTable.userId, ids))
          .groupBy(ordersTable.userId),
      ]);
      const listingMap = new Map(listingCounts.map((r) => [r.userId, r.c]));
      const orderMap = new Map(orderCounts.map((r) => [r.userId, r.c]));
      rows = rows.map((r) => ({
        ...r,
        listingCount: listingMap.get(r.userId) ?? 0,
        orderCount: orderMap.get(r.userId) ?? 0,
      }));
    }

    res.json(rows);
  }),
);

async function buildUserDetail(userId: string) {
  let clerkUser = null as Awaited<
    ReturnType<typeof clerkClient.users.getUser>
  > | null;
  try {
    clerkUser = await clerkClient.users.getUser(userId);
  } catch {
    /* user may exist only in our DB if hard-deleted upstream */
  }
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));

  const email = clerkUser
    ? clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      null
    : null;
  const role = clerkUser
    ? (clerkUser.publicMetadata as { role?: unknown } | undefined)?.role
    : null;

  const userRow = {
    userId,
    handle: clerkUser
      ? handleForUser(
          userId,
          email,
          clerkUser.username ?? null,
          clerkUser.firstName,
        )
      : handleForUser(userId, null, null, null),
    email,
    displayName: profile?.displayName ?? null,
    avatarUrl: profile?.avatarUrl ?? clerkUser?.imageUrl ?? null,
    isAdmin: role === "admin",
    suspendedAt: profile?.suspendedAt?.toISOString() ?? null,
    suspensionReason: profile?.suspensionReason ?? null,
    deletedAt: profile?.deletedAt?.toISOString() ?? null,
    listingCount: 0,
    orderCount: 0,
    createdAt: clerkUser?.createdAt
      ? new Date(clerkUser.createdAt).toISOString()
      : null,
  };

  const [listings, orders, reports, audit] = await Promise.all([
    db
      .select()
      .from(marketplaceListingsTable)
      .where(eq(marketplaceListingsTable.userId, userId))
      .orderBy(desc(marketplaceListingsTable.createdAt))
      .limit(20),
    db
      .select({
        order: ordersTable,
        supplier: suppliersTable,
        session: designSessionsTable,
      })
      .from(ordersTable)
      .innerJoin(suppliersTable, eq(suppliersTable.id, ordersTable.supplierId))
      .innerJoin(
        designSessionsTable,
        eq(designSessionsTable.id, ordersTable.sessionId),
      )
      .where(eq(ordersTable.userId, userId))
      .orderBy(desc(ordersTable.createdAt))
      .limit(20),
    db
      .select()
      .from(reportsTable)
      .where(eq(reportsTable.reporterUserId, userId))
      .orderBy(desc(reportsTable.createdAt))
      .limit(20),
    db
      .select()
      .from(auditLogTable)
      .where(
        or(
          eq(auditLogTable.actorUserId, userId),
          and(
            eq(auditLogTable.targetType, "user"),
            eq(auditLogTable.targetId, userId),
          ),
        ),
      )
      .orderBy(desc(auditLogTable.createdAt))
      .limit(50),
    ]);

  userRow.listingCount = listings.length;
  userRow.orderCount = orders.length;

  const auditUserIds = audit
    .map((a) => a.actorUserId)
    .filter((id): id is string => !!id);
  const auditUsers = await resolveClerkUsers(auditUserIds);

  return {
    user: userRow,
    recentListings: await Promise.all(listings.map(buildListingRow)),
    recentOrders: orders.map((r) => ({
      id: r.order.id,
      userId: r.order.userId,
      buyerHandle: userRow.handle,
      designerUserId: r.order.designerUserId,
      designerHandle: null,
      listingId: r.order.marketplaceListingId,
      listingTitle: null,
      sessionTitle: r.session.title,
      supplierName: r.supplier.name,
      status: r.order.status,
      paymentStatus: r.order.paymentStatus,
      quantity: r.order.quantity,
      totalCost: Number(r.order.totalCost),
      refundedAmount: Number(r.order.refundedAmount),
      adminNoteCount: (
        (r.order.adminNotes as AdminOrderNote[] | null) ?? []
      ).length,
      createdAt: r.order.createdAt.toISOString(),
    })),
    recentReports: reports.map((r) => ({
      id: r.id,
      reporterUserId: r.reporterUserId,
      reporterHandle: userRow.handle,
      targetType: r.targetType,
      targetId: r.targetId,
      targetTitle: null,
      reason: r.reason,
      notes: r.notes,
      status: r.status,
      resolvedBy: r.resolvedBy,
      resolvedByHandle: null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolutionNotes: r.resolutionNotes,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    auditLog: audit.map((a) => ({
      id: a.id,
      actorUserId: a.actorUserId,
      actorHandle: a.actorUserId
        ? auditUsers.get(a.actorUserId)?.handle ?? null
        : null,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      before: a.before,
      after: a.after,
      requestId: a.requestId,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

router.get(
  "/admin/users/:userId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(AdminGetUserParams, req.params);
    const detail = await buildUserDetail(params.userId);
    res.json(detail);
  }),
);

router.post(
  "/admin/users/:userId/suspend",
  requireAdmin,
  mutateLimiter,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(AdminSuspendUserParams, req.params);
    const body = parseOrThrow(AdminSuspendUserBody, req.body);
    if (params.userId === req.userId) {
      throw badRequest("You cannot suspend your own account.");
    }
    const now = new Date();

    // Upsert: ensure a profile row exists, then write the suspension cols.
    const [existing] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, params.userId));

    if (existing) {
      await db
        .update(userProfilesTable)
        .set({
          suspendedAt: now,
          suspendedBy: req.userId!,
          suspensionReason: body.reason ?? null,
          updatedAt: now,
        })
        .where(eq(userProfilesTable.userId, params.userId));
    } else {
      await db.insert(userProfilesTable).values({
        userId: params.userId,
        suspendedAt: now,
        suspendedBy: req.userId!,
        suspensionReason: body.reason ?? null,
      });
    }

    await recordAudit({
      actorUserId: req.userId!,
      action: "admin.user.suspend",
      targetType: "user",
      targetId: params.userId,
      before: { suspendedAt: existing?.suspendedAt ?? null },
      after: { suspendedAt: now.toISOString(), reason: body.reason ?? null },
      requestId: req.id ? String(req.id) : null,
    });

    res.json(await buildUserDetail(params.userId));
  }),
);

router.post(
  "/admin/users/:userId/unsuspend",
  requireAdmin,
  mutateLimiter,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(AdminUnsuspendUserParams, req.params);
    const [existing] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, params.userId));
    if (!existing) throw notFound("User profile");

    await db
      .update(userProfilesTable)
      .set({
        suspendedAt: null,
        suspendedBy: null,
        suspensionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(userProfilesTable.userId, params.userId));

    await recordAudit({
      actorUserId: req.userId!,
      action: "admin.user.unsuspend",
      targetType: "user",
      targetId: params.userId,
      before: {
        suspendedAt: existing.suspendedAt?.toISOString() ?? null,
        reason: existing.suspensionReason,
      },
      after: { suspendedAt: null },
      requestId: req.id ? String(req.id) : null,
    });

    res.json(await buildUserDetail(params.userId));
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// /admin/reports
// ─────────────────────────────────────────────────────────────────────────────

async function serializeReportRow(
  r: typeof reportsTable.$inferSelect,
  users: Map<string, ResolvedUser>,
  targetTitle: string | null,
) {
  return {
    id: r.id,
    reporterUserId: r.reporterUserId,
    reporterHandle: users.get(r.reporterUserId)?.handle ?? null,
    targetType: r.targetType,
    targetId: r.targetId,
    targetTitle,
    reason: r.reason,
    notes: r.notes,
    status: r.status,
    resolvedBy: r.resolvedBy,
    resolvedByHandle: r.resolvedBy
      ? users.get(r.resolvedBy)?.handle ?? null
      : null,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    resolutionNotes: r.resolutionNotes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function attachReportTargets(
  rows: (typeof reportsTable.$inferSelect)[],
): Promise<Map<string, string | null>> {
  // key = `${targetType}:${targetId}` → title (or null)
  const out = new Map<string, string | null>();
  const listingIds = rows
    .filter((r) => r.targetType === "listing")
    .map((r) => Number(r.targetId))
    .filter((n) => Number.isFinite(n));
  if (listingIds.length) {
    const ll = await db
      .select({
        id: marketplaceListingsTable.id,
        title: marketplaceListingsTable.title,
      })
      .from(marketplaceListingsTable)
      .where(inArray(marketplaceListingsTable.id, listingIds));
    for (const l of ll) out.set(`listing:${l.id}`, l.title);
  }
  return out;
}

router.get(
  "/admin/reports",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const q = parseOrThrow(AdminListReportsQueryParams, req.query);
    const status = q.status ?? "all";
    const limit = q.limit ?? 50;
    const where: ReturnType<typeof and>[] = [];
    if (status !== "all") where.push(eq(reportsTable.status, status)!);
    const rows = await db
      .select()
      .from(reportsTable)
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(reportsTable.status), desc(reportsTable.createdAt))
      .limit(limit);

    const userIds = [
      ...rows.map((r) => r.reporterUserId),
      ...rows.map((r) => r.resolvedBy).filter((id): id is string => !!id),
    ];
    const users = await resolveClerkUsers(userIds);
    const titles = await attachReportTargets(rows);

    res.json(
      await Promise.all(
        rows.map((r) =>
          serializeReportRow(
            r,
            users,
            titles.get(`${r.targetType}:${r.targetId}`) ?? null,
          ),
        ),
      ),
    );
  }),
);

router.patch(
  "/admin/reports/:id",
  requireAdmin,
  mutateLimiter,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(AdminUpdateReportParams, req.params);
    const body = parseOrThrow(AdminUpdateReportBody, req.body);
    const [existing] = await db
      .select()
      .from(reportsTable)
      .where(eq(reportsTable.id, params.id));
    if (!existing) throw notFound("Report");

    const isResolution =
      body.status === "resolved" || body.status === "dismissed";
    const [updated] = await db
      .update(reportsTable)
      .set({
        status: body.status,
        resolutionNotes:
          body.resolutionNotes ?? existing.resolutionNotes ?? null,
        resolvedBy: isResolution ? req.userId! : existing.resolvedBy,
        resolvedAt: isResolution
          ? existing.resolvedAt ?? new Date()
          : existing.resolvedAt,
        updatedAt: new Date(),
      })
      .where(eq(reportsTable.id, params.id))
      .returning();

    await recordAudit({
      actorUserId: req.userId!,
      action: "admin.report.update",
      targetType: "report",
      targetId: existing.id,
      before: { status: existing.status },
      after: {
        status: updated!.status,
        resolutionNotes: updated!.resolutionNotes ?? null,
      },
      requestId: req.id ? String(req.id) : null,
    });

    const users = await resolveClerkUsers([
      updated!.reporterUserId,
      ...(updated!.resolvedBy ? [updated!.resolvedBy] : []),
    ]);
    const titles = await attachReportTargets([updated!]);
    res.json(
      await serializeReportRow(
        updated!,
        users,
        titles.get(`${updated!.targetType}:${updated!.targetId}`) ?? null,
      ),
    );
  }),
);

// Silence unused-import lint warnings for symbols only used in narrowing types
void z;

export default router;
