import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import {
  db,
  designSessionsTable,
  designMessagesTable,
  designOutputsTable,
} from "@workspace/db";
import {
  CreateSessionBody,
  GetSessionParams,
  DeleteSessionParams,
  ListMessagesParams,
  SendMessageParams,
  SendMessageBody,
} from "@workspace/api-zod";
import {
  generateDesignSpec,
  generateConceptImageDataUrl,
} from "../lib/designPipeline";

const router: IRouter = Router();

type Status = "generating" | "ready" | "error";

async function getLatestOutput(sessionId: number) {
  const [out] = await db
    .select()
    .from(designOutputsTable)
    .where(eq(designOutputsTable.sessionId, sessionId))
    .orderBy(desc(designOutputsTable.createdAt))
    .limit(1);
  return out ?? null;
}

function serializeOutput(out: Awaited<ReturnType<typeof getLatestOutput>>) {
  if (!out) return null;
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

function serializeMessage(m: typeof designMessagesTable.$inferSelect) {
  return {
    id: m.id,
    sessionId: m.sessionId,
    role: m.role as "user" | "assistant",
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  };
}

async function buildSessionResponse(sessionId: number) {
  const [session] = await db
    .select()
    .from(designSessionsTable)
    .where(eq(designSessionsTable.id, sessionId));
  if (!session) return null;

  const messages = await db
    .select()
    .from(designMessagesTable)
    .where(eq(designMessagesTable.sessionId, sessionId))
    .orderBy(designMessagesTable.createdAt);

  const latest = await getLatestOutput(sessionId);

  return {
    id: session.id,
    title: session.title,
    status: session.status as Status,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messages: messages.map(serializeMessage),
    latestOutput: serializeOutput(latest),
  };
}

async function buildSummaries() {
  const rows = await db
    .select({
      id: designSessionsTable.id,
      title: designSessionsTable.title,
      status: designSessionsTable.status,
      createdAt: designSessionsTable.createdAt,
      updatedAt: designSessionsTable.updatedAt,
    })
    .from(designSessionsTable)
    .orderBy(desc(designSessionsTable.updatedAt));

  const summaries = await Promise.all(
    rows.map(async (s) => {
      const out = await getLatestOutput(s.id);
      const msgCountRow = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(designMessagesTable)
        .where(eq(designMessagesTable.sessionId, s.id));
      return {
        id: s.id,
        title: s.title,
        status: s.status as Status,
        productName: out?.productName ?? null,
        category: out?.category ?? null,
        primaryMaterial: out?.primaryMaterial ?? null,
        thumbnailUrl: out?.imageUrl ?? null,
        estimatedCostLow: out?.costEstimate?.low ?? null,
        estimatedCostHigh: out?.costEstimate?.high ?? null,
        messageCount: msgCountRow[0]?.c ?? 0,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      };
    }),
  );
  return summaries;
}

async function runPipeline(sessionId: number) {
  try {
    const messages = await db
      .select()
      .from(designMessagesTable)
      .where(eq(designMessagesTable.sessionId, sessionId))
      .orderBy(designMessagesTable.createdAt);

    const history = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const spec = await generateDesignSpec(history);
    const imageUrl = await generateConceptImageDataUrl(spec.imagePrompt);

    await db.insert(designOutputsTable).values({
      sessionId,
      productName: spec.productName,
      category: spec.category,
      summary: spec.summary,
      primaryMaterial: spec.primaryMaterial,
      materials: spec.materials,
      dimensions: spec.dimensions,
      weightGrams: spec.weightGrams === null ? null : String(spec.weightGrams),
      processes: spec.processes,
      bom: spec.bom,
      costEstimate: spec.costEstimate,
      imageUrl,
      manufacturingNotes: spec.manufacturingNotes,
    });

    await db.insert(designMessagesTable).values({
      sessionId,
      role: "assistant",
      content: `${spec.productName} — ${spec.summary}`,
    });

    await db
      .update(designSessionsTable)
      .set({ status: "ready", title: spec.sessionTitle, updatedAt: new Date() })
      .where(eq(designSessionsTable.id, sessionId));
  } catch (err) {
    await db
      .update(designSessionsTable)
      .set({ status: "error", updatedAt: new Date() })
      .where(eq(designSessionsTable.id, sessionId));
    throw err;
  }
}

router.get("/sessions", async (_req, res): Promise<void> => {
  const summaries = await buildSummaries();
  res.json(summaries);
});

router.get("/sessions/stats", async (_req, res): Promise<void> => {
  const summaries = await buildSummaries();
  const outputs = await db.select().from(designOutputsTable);

  const materialCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  let lowSum = 0;
  let highSum = 0;
  for (const o of outputs) {
    categoryCounts.set(o.category, (categoryCounts.get(o.category) ?? 0) + 1);
    for (const m of o.materials) {
      materialCounts.set(m, (materialCounts.get(m) ?? 0) + 1);
    }
    lowSum += o.costEstimate.low;
    highSum += o.costEstimate.high;
  }

  const totalDesigns = outputs.length;
  const avgCostLow = totalDesigns ? lowSum / totalDesigns : 0;
  const avgCostHigh = totalDesigns ? highSum / totalDesigns : 0;
  const totalEstimatedValue = (lowSum + highSum) / 2;

  const topMaterials = [...materialCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([material, count]) => ({ material, count }));

  const topCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, count]) => ({ category, count }));

  res.json({
    totalSessions: summaries.length,
    totalDesigns,
    avgCostLow: Math.round(avgCostLow * 100) / 100,
    avgCostHigh: Math.round(avgCostHigh * 100) / 100,
    totalEstimatedValue: Math.round(totalEstimatedValue * 100) / 100,
    topMaterials,
    topCategories,
    recentSessions: summaries.slice(0, 5),
  });
});

router.post("/sessions", async (req, res): Promise<void> => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const prompt = parsed.data.prompt.trim();
  if (!prompt) {
    res.status(400).json({ error: "Prompt is required" });
    return;
  }

  const [session] = await db
    .insert(designSessionsTable)
    .values({
      title: prompt.slice(0, 60),
      status: "generating",
    })
    .returning();

  await db.insert(designMessagesTable).values({
    sessionId: session.id,
    role: "user",
    content: prompt,
  });

  try {
    await runPipeline(session.id);
  } catch (err) {
    req.log.error({ err }, "Design pipeline failed");
  }

  const result = await buildSessionResponse(session.id);
  res.status(result?.status === "error" ? 502 : 201).json(result);
});

router.get("/sessions/:id", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await buildSessionResponse(params.data.id);
  if (!result) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(result);
});

router.delete("/sessions/:id", async (req, res): Promise<void> => {
  const params = DeleteSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db
    .delete(designSessionsTable)
    .where(eq(designSessionsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/sessions/:id/messages", async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const messages = await db
    .select()
    .from(designMessagesTable)
    .where(eq(designMessagesTable.sessionId, params.data.id))
    .orderBy(designMessagesTable.createdAt);
  res.json(messages.map(serializeMessage));
});

router.post("/sessions/:id/messages", async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const content = body.data.content.trim();
  if (!content) {
    res.status(400).json({ error: "Content is required" });
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

  await db.insert(designMessagesTable).values({
    sessionId: session.id,
    role: "user",
    content,
  });

  await db
    .update(designSessionsTable)
    .set({ status: "generating", updatedAt: new Date() })
    .where(eq(designSessionsTable.id, session.id));

  try {
    await runPipeline(session.id);
  } catch (err) {
    req.log.error({ err }, "Design pipeline failed");
  }

  const result = await buildSessionResponse(session.id);
  res.status(result?.status === "error" ? 502 : 200).json(result);
});

export default router;
