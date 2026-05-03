import { Router, type IRouter } from "express";
import { eq, desc, inArray, and, isNull } from "@workspace/db";
import { clerkClient } from "@clerk/express";
import {
  db,
  ordersTable,
  quotesTable,
  suppliersTable,
  designSessionsTable,
  designOutputsTable,
  marketplaceListingsTable,
  userProfilesTable,
  recordAudit,
  type Order,
  type Quote,
  type Supplier,
  type OrderStatus,
  type OrderStatusEvent,
} from "@workspace/db";
import {
  isStripeConfigured,
  createCheckoutSession,
  ensureCustomer,
  getAppBaseUrl,
} from "../lib/stripe";
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
    paymentStatus: order.paymentStatus,
    refundedAmount: Number(order.refundedAmount),
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
          paymentStatus: r.order.paymentStatus,
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
        paymentStatus: r.order.paymentStatus,
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
    // Manufacturing component charged by the supplier (we keep this on the
    // platform balance to forward to the supplier off-platform).
    const manufacturingCost =
      Math.round((unitCost * quantity + setupFee) * 100) / 100;

    let designerLicenseTotal = 0;
    let designerUserId: string | null = null;
    if (
      listing &&
      listing.status === "active" &&
      listing.userId !== req.userId
    ) {
      designerUserId = listing.userId;
      designerLicenseTotal =
        Math.round(Number(listing.listingPrice) * quantity * 100) / 100;
    }
    // Reality Compiler's marketplace economics: the buyer pays manufacturing
    // + the licence price. Of the licence portion, 70% goes to the designer
    // (Connect transfer) and 30% stays on the platform.
    const totalCost =
      Math.round((manufacturingCost + designerLicenseTotal) * 100) / 100;
    const payoutAmount =
      Math.round(designerLicenseTotal * 0.7 * 100) / 100;

    const stripeOn = isStripeConfigured();
    const initialPaymentStatus = stripeOn ? "pending_payment" : "paid";
    const initialOrderStatus: OrderStatus = "queued";
    // Only seed the queued status event when the order is already paid
    // (dev fallback). For Stripe-paid orders, the webhook seeds the event
    // when payment actually succeeds.
    const statusHistory: OrderStatusEvent[] = stripeOn
      ? []
      : [
          {
            status: "queued",
            note: STATUS_NOTES.queued,
            at: new Date().toISOString(),
          },
        ];

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
        status: initialOrderStatus,
        statusHistory,
        paymentStatus: initialPaymentStatus,
      })
      .returning();

    await recordAudit({
      actorUserId: req.userId!,
      action: "order.create",
      targetType: "order",
      targetId: created.id,
      after: {
        status: created.status,
        paymentStatus: created.paymentStatus,
        totalCost: created.totalCost,
        designerUserId: created.designerUserId,
        marketplaceListingId: created.marketplaceListingId,
      },
      requestId: req.id ? String(req.id) : null,
    });

    // Stripe disabled (dev fallback): return the fully-realised order so
    // existing test suites and offline development keep working.
    if (!stripeOn) {
      const full = await loadOrder(created.id);
      if (!full) throw new ApiError("INTERNAL", "Failed to load created order");
      res.status(201).json({
        orderId: created.id,
        checkoutUrl: null,
        requiresPayment: false,
        order: await serializeOrder(full),
      });
      return;
    }

    // Stripe Checkout flow. We resolve buyer email + Stripe customer +
    // designer Connect account, then create a session whose metadata
    // points back to this order. The webhook flips `payment_status`
    // to `paid` when the buyer completes checkout.
    let buyerEmail: string | null = null;
    try {
      const u = await clerkClient.users.getUser(req.userId!);
      buyerEmail =
        u.primaryEmailAddress?.emailAddress ??
        u.emailAddresses[0]?.emailAddress ??
        null;
    } catch {
      // non-fatal — Stripe Checkout will collect an email at the form.
    }

    const [buyerProfile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, req.userId!));

    let buyerStripeCustomerId: string | null =
      buyerProfile?.stripeCustomerId ?? null;
    if (!buyerStripeCustomerId && buyerEmail) {
      buyerStripeCustomerId = await ensureCustomer(
        req.userId!,
        buyerEmail,
        null,
      );
      if (buyerStripeCustomerId) {
        await db
          .insert(userProfilesTable)
          .values({
            userId: req.userId!,
            stripeCustomerId: buyerStripeCustomerId,
          })
          .onConflictDoUpdate({
            target: userProfilesTable.userId,
            set: {
              stripeCustomerId: buyerStripeCustomerId,
              updatedAt: new Date(),
            },
          });
      }
    }

    let designerStripeAccountId: string | null = null;
    if (designerUserId) {
      const [dp] = await db
        .select()
        .from(userProfilesTable)
        .where(eq(userProfilesTable.userId, designerUserId));
      if (dp?.stripeAccountId && dp.stripeAccountStatus === "enabled") {
        designerStripeAccountId = dp.stripeAccountId;
      }
      // If the designer hasn't onboarded with Stripe Connect we fall back
      // to keeping all funds on the platform balance and reconciling out
      // of band — better than blocking the sale entirely.
    }

    const origin =
      (req.headers["origin"] as string | undefined) ?? getAppBaseUrl();
    const successUrl = `${origin}/orders/${created.id}?paid=1`;
    const cancelUrl = `${origin}/orders/${created.id}?canceled=1`;

    const productLabel = listing?.title ?? row.session.title;

    const session = await createCheckoutSession({
      orderId: created.id,
      userId: req.userId!,
      totalDollars: totalCost,
      payoutDollars: payoutAmount,
      designerStripeAccountId,
      productLabel,
      customerEmail: buyerEmail,
      buyerStripeCustomerId,
      successUrl,
      cancelUrl,
    });

    await db
      .update(ordersTable)
      .set({
        stripeCheckoutSessionId: session.id,
        updatedAt: new Date(),
      })
      .where(eq(ordersTable.id, created.id));

    res.status(201).json({
      orderId: created.id,
      checkoutUrl: session.url,
      requiresPayment: true,
      order: null,
    });
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
