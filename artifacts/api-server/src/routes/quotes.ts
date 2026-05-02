import { Router, type IRouter } from "express";
import { eq, desc, asc, and, notInArray, sql } from "drizzle-orm";
import {
  db,
  designSessionsTable,
  designOutputsTable,
  suppliersTable,
  quotesTable,
  ordersTable,
  type Quote,
  type Supplier,
} from "@workspace/db";
import { GenerateQuotesParams, ListQuotesParams } from "@workspace/api-zod";
import { rankSuppliers } from "../lib/routing";
import { serializeSupplier } from "./suppliers";

const router: IRouter = Router();

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

router.get("/sessions/:id/quotes", async (req, res): Promise<void> => {
  const params = ListQuotesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const quotes = await loadQuotesForSession(params.data.id);
  res.json(quotes.map(serializeQuote));
});

router.post("/sessions/:id/quotes", async (req, res): Promise<void> => {
  const params = GenerateQuotesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db
    .select()
    .from(designSessionsTable)
    .where(eq(designSessionsTable.id, params.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (session.status !== "ready") {
    res.status(400).json({
      error: "Design session is not ready — wait for the compiler to finish.",
    });
    return;
  }

  const [output] = await db
    .select()
    .from(designOutputsTable)
    .where(eq(designOutputsTable.sessionId, session.id))
    .orderBy(desc(designOutputsTable.createdAt))
    .limit(1);
  if (!output) {
    res.status(400).json({ error: "Design has no output to quote." });
    return;
  }

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

  await db.transaction(async (tx) => {
    const referencedQuoteIds = await tx
      .select({ id: ordersTable.quoteId })
      .from(ordersTable)
      .where(eq(ordersTable.sessionId, session.id));
    const keepIds = referencedQuoteIds.map((r) => r.id);

    if (keepIds.length === 0) {
      await tx.delete(quotesTable).where(eq(quotesTable.sessionId, session.id));
    } else {
      await tx
        .delete(quotesTable)
        .where(
          and(
            eq(quotesTable.sessionId, session.id),
            notInArray(quotesTable.id, keepIds),
          ),
        );
      await tx
        .update(quotesTable)
        .set({ rank: sql`${quotesTable.rank} + 1000` })
        .where(eq(quotesTable.sessionId, session.id));
    }

    if (ranked.length > 0) {
      await tx.insert(quotesTable).values(
        ranked.map((r, idx) => ({
          sessionId: session.id,
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
    }
  });

  const persisted = await loadQuotesForSession(session.id);
  res.status(201).json(persisted.map(serializeQuote));
});

export default router;
