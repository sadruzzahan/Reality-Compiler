import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import {
  db,
  ordersTable,
  quotesTable,
  suppliersTable,
  designSessionsTable,
  designOutputsTable,
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
    .where(eq(ordersTable.id, id));
  if (!row) return null;
  return { ...row.order, quote: row.quote, supplier: row.supplier };
}

async function getSessionTitleAndProduct(sessionId: number) {
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
    leadTimeDays: order.leadTimeDays,
    shippingAddress: order.shippingAddress,
    status: order.status as OrderStatus,
    statusHistory: order.statusHistory,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

router.get("/orders", async (_req, res): Promise<void> => {
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
        leadTimeDays: r.order.leadTimeDays,
        createdAt: r.order.createdAt.toISOString(),
        updatedAt: r.order.updatedAt.toISOString(),
      };
    }),
  );
  res.json(summaries);
});

router.post("/orders", async (req, res): Promise<void> => {
  const body = PlaceOrderBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [row] = await db
    .select({ quote: quotesTable, supplier: suppliersTable })
    .from(quotesTable)
    .innerJoin(suppliersTable, eq(suppliersTable.id, quotesTable.supplierId))
    .where(eq(quotesTable.id, body.data.quoteId));
  if (!row) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  const quantity = body.data.quantity;
  const unitCost = Number(row.quote.unitCost);
  const setupFee = Number(row.quote.setupFee);
  const totalCost = Math.round((unitCost * quantity + setupFee) * 100) / 100;
  const now = new Date();
  const initialEvent: OrderStatusEvent = {
    status: "queued",
    note: STATUS_NOTES.queued,
    at: now.toISOString(),
  };

  const [created] = await db
    .insert(ordersTable)
    .values({
      quoteId: row.quote.id,
      sessionId: row.quote.sessionId,
      supplierId: row.supplier.id,
      quantity,
      totalCost: String(totalCost),
      leadTimeDays: row.quote.leadTimeDays,
      shippingAddress: body.data.shippingAddress,
      status: "queued",
      statusHistory: [initialEvent],
    })
    .returning();

  const full = await loadOrder(created.id);
  if (!full) {
    res.status(500).json({ error: "Failed to load created order" });
    return;
  }
  res.status(201).json(await serializeOrder(full));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const order = await loadOrder(params.data.id);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(await serializeOrder(order));
});

router.post("/orders/:id/advance", async (req, res): Promise<void> => {
  const params = AdvanceOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const order = await loadOrder(params.data.id);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const currentIdx = STATUS_FLOW.indexOf(order.status as OrderStatus);
  if (currentIdx < 0 || currentIdx >= STATUS_FLOW.length - 1) {
    res
      .status(400)
      .json({ error: "Order is already at its final status." });
    return;
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
  if (!updated) {
    res.status(404).json({ error: "Order not found after update" });
    return;
  }
  res.json(await serializeOrder(updated));
});

export default router;
