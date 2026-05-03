import { Router, type IRouter } from "express";
import { eq, desc, inArray, and, isNull } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import {
  db,
  ordersTable,
  quotesTable,
  suppliersTable,
  designSessionsTable,
  designOutputsTable,
  marketplaceListingsTable,
  recordAudit,
  type Order,
  type Quote,
  type Supplier,
  type OrderStatus,
  type OrderStatusEvent,
} from "@workspace/db";
import {
  AdvanceOrderParams,
  GetOrderParams,
  PlaceOrderBody,
} from "@workspace/api-zod";
import { serializeSupplier } from "./suppliers";
import { requireAuth } from "../middlewares/auth";
import { handleForUser } from "../lib/handles";
import { asyncHandler } from "../middlewares/asyncHandler";
import { parseOrThrow } from "../middlewares/validate";
import { mutateLimiter } from "../middlewares/rateLimits";
import { ApiError, badRequest, notFound } from "../lib/errors";

const router: IRouter = Router();

const STATUS_FLOW: OrderStatus[] = [
  "queued",
  "in_production",
  "quality_check",
  "shipped",
  "delivered",
];

const STATUS_NOTES: Record<OrderStatus, string> = {
  queued: "Order received — supplier reviewing the design package.",
  in_production: "Manufacturing run started on the supplier floor.",
  quality_check: "Parts are being inspected against the spec.",
  shipped: "Shipment handed to the carrier.",
  delivered: "Delivered to the shipping address.",
};

type OrderRow = Order & { quote: Quote; supplier: Supplier };

async function loadOrder(id: number): Promise<OrderRow | null> {
  const [row] = await db
    .select({
      order: ordersTable,
      quote: quotesTable,
      supplier: suppliersTable,
    })
    .from(ordersTable)
    .innerJoin(quotesTable, eq(quotesTable.id, ordersTable.quoteId))
    .innerJoin(suppliersTable, eq(suppliersTable.id, ordersTable.supplierId))
    .where(and(eq(ordersTable.id, id), isNull(ordersTable.deletedAt)));
  if (!row) return null;
  return { ...row.order, quote: row.quote, supplier: row.supplier };
}

async function getSessionTitleAndProduct(sessionId: number) {
  // Include soft-deleted sessions so existing orders can still render their
  // historical title even after the underlying session was removed.
  const [session] = await db
    .select({ title: designSessionsTable.title })
    .from(designSessionsTable)
    .where(eq(designSessionsTable.id, sessionId));
  const [output] = await db
    .select({ productName: designOutputsTable.productName })
    .from(designOutputsTable)
    .where(eq(designOutputsTable.sessionId, sessionId))
    .orderBy(desc(designOutputsTable.createdAt))
    .limit(1);
  return {
    sessionTitle: session?.title ?? `Session #${sessionId}`,
    productName: output?.productName ?? null,
  };
}

function serializeQuoteEmbed(quote: Quote, supplier: Supplier) {
  return {
    id: quote.id,
    sessionId: quote.sessionId,
    supplier: serializeSupplier(supplier),
    unitCost: Number(quote.unitCost),
    setupFee: Number(quote.setupFee),
    totalCost: Number(quote.totalCost),
    leadTimeDays: quote.leadTimeDays,
    processBreakdown: quote.processBreakdown,
    scoreFactors: quote.scoreFactors,
    rank: quote.rank,
    notes: quote.notes,
    createdAt: quote.createdAt.toISOString(),
  };
}

async function serializeOrder(order: OrderRow) {
  const meta = await getSessionTitleAndProduct(order.sessionId);
  return {
    id: order.id,
    sessionId: order.sessionId,
    sessionTitle: meta.sessionTitle,
    productName: meta.productName,
    quote: serializeQuoteEmbed(order.quote, order.supplier),
    supplier: serializeSupplier(order.supplier),
    quantity: order.quantity,
    totalCost: Number(order.totalCost),
    payoutAmount: Number(order.payoutAmount),
    designerUserId: order.designerUserId,
    leadTimeDays: order.leadTimeDays,
    shippingAddress: order.shippingAddress,
    status: order.status as OrderStatus,
    statusHistory: order.statusHistory,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

router.get(
  "/orders",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await db
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
      .where(
        and(
          eq(ordersTable.userId, req.userId!),
          isNull(ordersTable.deletedAt),
        ),
      )
      .orderBy(desc(ordersTable.createdAt));

    const summaries = await Promise.all(
      rows.map(async (r) => {
        const [output] = await db
          .select({ productName: designOutputsTable.productName })
          .from(designOutputsTable)
          .where(eq(designOutputsTable.sessionId, r.session.id))
          .orderBy(desc(designOutputsTable.createdAt))
          .limit(1);
        return {
          id: r.order.id,
          sessionId: r.order.sessionId,
          sessionTitle: r.session.title,
          productName: output?.productName ?? null,
          supplierName: r.supplier.name,
          status: r.order.status as OrderStatus,
          quantity: r.order.quantity,
          totalCost: Number(r.order.totalCost),
          payoutAmount: Number(r.order.payoutAmount),
          designerUserId: r.order.designerUserId,
          leadTimeDays: r.order.leadTimeDays,
          createdAt: r.order.createdAt.toISOString(),
          updatedAt: r.order.updatedAt.toISOString(),
        };
      }),
    );
    res.json(summaries);
  }),
);

router.get(
  "/designer/orders",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.userId!;

    const rows = await db
      .select({
        order: ordersTable,
        supplier: suppliersTable,
        session: designSessionsTable,
      })
      .from(ordersTable)
      .innerJoin(
        suppliersTable,
        eq(suppliersTable.id, ordersTable.supplierId),
      )
      .innerJoin(
        designSessionsTable,
        eq(designSessionsTable.id, ordersTable.sessionId),
      )
      .where(
        and(
          eq(ordersTable.designerUserId, userId),
          isNull(ordersTable.deletedAt),
        ),
      )
      .orderBy(desc(ordersTable.createdAt));

    if (rows.length === 0) {
      res.json([]);
      return;
    }

    const listingIds = Array.from(
      new Set(
        rows
          .map((r) => r.order.marketplaceListingId)
          .filter((id): id is number => id != null),
      ),
    );
    const listingById = new Map<
      number,
      typeof marketplaceListingsTable.$inferSelect
    >();
    if (listingIds.length > 0) {
      // Intentionally include soft-deleted listings so designers still see
      // the title/etc. for orders placed before unpublish; we surface the
      // tombstone via `listingDeleted` below.
      const listings = await db
        .select()
        .from(marketplaceListingsTable)
        .where(inArray(marketplaceListingsTable.id, listingIds));
      for (const l of listings) listingById.set(l.id, l);
    }

    const sessionIds = Array.from(new Set(rows.map((r) => r.session.id)));
    const outputs = await db
      .select({
        sessionId: designOutputsTable.sessionId,
        productName: designOutputsTable.productName,
        createdAt: designOutputsTable.createdAt,
      })
      .from(designOutputsTable)
      .where(inArray(designOutputsTable.sessionId, sessionIds))
      .orderBy(desc(designOutputsTable.createdAt));
    const productNameBySession = new Map<number, string>();
    for (const o of outputs) {
      if (!productNameBySession.has(o.sessionId)) {
        productNameBySession.set(o.sessionId, o.productName);
      }
    }

    const buyerIds = Array.from(new Set(rows.map((r) => r.order.userId)));
    const buyerHandleById = new Map<string, string | null>();
    await Promise.all(
      buyerIds.map(async (id) => {
        if (id === "system-seed" || id === userId) {
          buyerHandleById.set(id, null);
          return;
        }
        try {
          const u = await clerkClient.users.getUser(id);
          const email =
            u.primaryEmailAddress?.emailAddress ??
            u.emailAddresses[0]?.emailAddress ??
            null;
          buyerHandleById.set(
            id,
            handleForUser(id, email, u.username ?? null, u.firstName),
          );
        } catch {
          buyerHandleById.set(id, handleForUser(id, null, null, null));
        }
      }),
    );

    const summaries = rows.map((r) => {
      const listing =
        r.order.marketplaceListingId != null
          ? listingById.get(r.order.marketplaceListingId) ?? null
          : null;
      const listingDeleted =
        r.order.marketplaceListingId != null &&
        (listing == null || listing.deletedAt != null);
      return {
        id: r.order.id,
        sessionId: r.order.sessionId,
        sessionTitle: r.session.title,
        productName: productNameBySession.get(r.session.id) ?? null,
        listingId: r.order.marketplaceListingId ?? 0,
        listingTitle: listing?.title ?? r.session.title,
        listingDeleted,
        buyerHandle: buyerHandleById.get(r.order.userId) ?? null,
        supplierName: r.supplier.name,
        status: r.order.status as OrderStatus,
        quantity: r.order.quantity,
        totalCost: Number(r.order.totalCost),
        payoutAmount: Number(r.order.payoutAmount),
        leadTimeDays: r.order.leadTimeDays,
        createdAt: r.order.createdAt.toISOString(),
        updatedAt: r.order.updatedAt.toISOString(),
      };
    });
    res.json(summaries);
  }),
);

router.post(
  "/orders",
  requireAuth,
  mutateLimiter,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(PlaceOrderBody, req.body);

    const [row] = await db
      .select({
        quote: quotesTable,
        supplier: suppliersTable,
        session: designSessionsTable,
      })
      .from(quotesTable)
      .innerJoin(suppliersTable, eq(suppliersTable.id, quotesTable.supplierId))
      .innerJoin(
        designSessionsTable,
        eq(designSessionsTable.id, quotesTable.sessionId),
      )
      .where(
        and(
          eq(quotesTable.id, body.quoteId),
          isNull(designSessionsTable.deletedAt),
        ),
      );
    if (!row) throw notFound("Quote");

    let listing: typeof marketplaceListingsTable.$inferSelect | null = null;
    if (body.marketplaceListingId != null) {
      const [found] = await db
        .select()
        .from(marketplaceListingsTable)
        .where(
          and(
            eq(marketplaceListingsTable.id, body.marketplaceListingId),
            isNull(marketplaceListingsTable.deletedAt),
          ),
        );
      if (
        !found ||
        found.sessionId !== row.quote.sessionId ||
        found.status !== "active"
      ) {
        throw notFound("Listing");
      }
      listing = found;
    }

    const authorized = row.session.userId === req.userId || listing !== null;
    if (!authorized) throw notFound("Quote");

    const quantity = body.quantity;
    const unitCost = Number(row.quote.unitCost);
    const setupFee = Number(row.quote.setupFee);
    const totalCost = Math.round((unitCost * quantity + setupFee) * 100) / 100;

    let payoutAmount = 0;
    let designerUserId: string | null = null;
    if (
      listing &&
      listing.status === "active" &&
      listing.userId !== req.userId
    ) {
      designerUserId = listing.userId;
      payoutAmount =
        Math.round(Number(listing.listingPrice) * quantity * 100) / 100;
    }
    const now = new Date();
    const initialEvent: OrderStatusEvent = {
      status: "queued",
      note: STATUS_NOTES.queued,
      at: now.toISOString(),
    };

    const [created] = await db
      .insert(ordersTable)
      .values({
        userId: req.userId!,
        marketplaceListingId: body.marketplaceListingId ?? null,
        quoteId: row.quote.id,
        sessionId: row.quote.sessionId,
        supplierId: row.supplier.id,
        quantity,
        totalCost: String(totalCost),
        designerUserId,
        payoutAmount: String(payoutAmount),
        leadTimeDays: row.quote.leadTimeDays,
        shippingAddress: body.shippingAddress,
        status: "queued",
        statusHistory: [initialEvent],
      })
      .returning();

    const full = await loadOrder(created.id);
    if (!full) throw new ApiError("INTERNAL", "Failed to load created order");
    await recordAudit({
      actorUserId: req.userId!,
      action: "order.create",
      targetType: "order",
      targetId: created.id,
      after: {
        status: created.status,
        totalCost: created.totalCost,
        designerUserId: created.designerUserId,
        marketplaceListingId: created.marketplaceListingId,
      },
      requestId: req.id ? String(req.id) : null,
    });
    res.status(201).json(await serializeOrder(full));
  }),
);

router.get(
  "/orders/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(GetOrderParams, req.params);
    const order = await loadOrder(params.id);
    if (!order || order.userId !== req.userId) throw notFound("Order");
    res.json(await serializeOrder(order));
  }),
);

router.post(
  "/orders/:id/advance",
  requireAuth,
  mutateLimiter,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(AdvanceOrderParams, req.params);
    const order = await loadOrder(params.id);
    if (!order || order.userId !== req.userId) throw notFound("Order");
    const currentIdx = STATUS_FLOW.indexOf(order.status as OrderStatus);
    if (currentIdx < 0 || currentIdx >= STATUS_FLOW.length - 1) {
      throw badRequest("Order is already at its final status.");
    }
    const next = STATUS_FLOW[currentIdx + 1]!;
    const event: OrderStatusEvent = {
      status: next,
      note: STATUS_NOTES[next],
      at: new Date().toISOString(),
    };
    await db
      .update(ordersTable)
      .set({
        status: next,
        statusHistory: [...order.statusHistory, event],
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, order.id));

    const updated = await loadOrder(order.id);
    if (!updated) throw notFound("Order");
    await recordAudit({
      actorUserId: req.userId!,
      action: "order.advance",
      targetType: "order",
      targetId: order.id,
      before: { status: order.status },
      after: { status: next },
      requestId: req.id ? String(req.id) : null,
    });
    res.json(await serializeOrder(updated));
  }),
);

export default router;
