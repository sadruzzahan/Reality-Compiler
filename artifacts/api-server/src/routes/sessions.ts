import { Router, type IRouter } from "express";
import { eq, desc, sql, and, isNull } from "drizzle-orm";
import {
  db,
  designSessionsTable,
  designMessagesTable,
  designOutputsTable,
  marketplaceListingsTable,
  recordAudit,
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
  generateAndStoreConceptImage,
} from "../lib/designPipeline";
import { deleteObjectByUrl } from "../lib/objectStorage";
import { requireAuth, attachUserId } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { parseOrThrow } from "../middlewares/validate";
import { aiLimiter } from "../middlewares/rateLimits";
import { badRequest, forbidden, notFound } from "../lib/errors";

const router: IRouter = Router();

async function userCanReadSession(
  sessionId: number,
  userId: string,
): Promise<boolean> {
  const [s] = await db
    .select({ userId: designSessionsTable.userId })
    .from(designSessionsTable)
    .where(
      and(
        eq(designSessionsTable.id, sessionId),
        isNull(designSessionsTable.deletedAt),
      ),
    );
  if (!s) return false;
  return s.userId === userId;
}

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
    .where(
      and(
        eq(designSessionsTable.id, sessionId),
        isNull(designSessionsTable.deletedAt),
      ),
    );
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

async function buildSummaries(userId?: string) {
  const rows = await db
    .select({
      id: designSessionsTable.id,
      title: designSessionsTable.title,
      status: designSessionsTable.status,
      createdAt: designSessionsTable.createdAt,
      updatedAt: designSessionsTable.updatedAt,
    })
    .from(designSessionsTable)
    .where(
      and(
        isNull(designSessionsTable.deletedAt),
        userId ? eq(designSessionsTable.userId, userId) : sql`true`,
      ),
    )
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

async function runPipeline(sessionId: number, userId: string) {
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
    const imageUrl = await generateAndStoreConceptImage(
      spec.imagePrompt,
      userId,
      sessionId,
    );

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

router.get(
  "/sessions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const summaries = await buildSummaries(req.userId);
    res.json(summaries);
  }),
);

router.get(
  "/sessions/stats",
  attachUserId,
  asyncHandler(async (req, res) => {
    const summaries = req.userId ? await buildSummaries(req.userId) : [];
    // Exclude outputs whose parent session is soft-deleted so stats stay
    // consistent with the (filtered) sessions list.
    const outputRows = await db
      .select({ output: designOutputsTable })
      .from(designOutputsTable)
      .innerJoin(
        designSessionsTable,
        eq(designSessionsTable.id, designOutputsTable.sessionId),
      )
      .where(isNull(designSessionsTable.deletedAt));
    const outputs = outputRows.map((r) => r.output);

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

    const [{ totalCount }] = await db
      .select({ totalCount: sql<number>`count(*)::int` })
      .from(designSessionsTable)
      .where(isNull(designSessionsTable.deletedAt));
    res.json({
      totalSessions: totalCount ?? 0,
      totalDesigns,
      avgCostLow: Math.round(avgCostLow * 100) / 100,
      avgCostHigh: Math.round(avgCostHigh * 100) / 100,
      totalEstimatedValue: Math.round(totalEstimatedValue * 100) / 100,
      topMaterials,
      topCategories,
      recentSessions: summaries.slice(0, 5),
    });
  }),
);

router.post(
  "/sessions",
  requireAuth,
  aiLimiter,
  asyncHandler(async (req, res) => {
    const parsed = parseOrThrow(CreateSessionBody, req.body);
    const prompt = parsed.prompt.trim();
    if (!prompt) throw badRequest("Prompt is required");

    const [session] = await db
      .insert(designSessionsTable)
      .values({
        userId: req.userId!,
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
      await runPipeline(session.id, req.userId!);
    } catch (err) {
      req.log.error({ err }, "Design pipeline failed");
    }

    const result = await buildSessionResponse(session.id);
    res.status(result?.status === "error" ? 502 : 201).json(result);
  }),
);

router.get(
  "/sessions/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(GetSessionParams, req.params);
    if (!(await userCanReadSession(params.id, req.userId!))) {
      throw notFound("Session");
    }
    const result = await buildSessionResponse(params.id);
    if (!result) throw notFound("Session");
    res.json(result);
  }),
);

router.delete(
  "/sessions/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(DeleteSessionParams, req.params);
    // Soft-delete the session AND any marketplace listing tied to it in one
    // transaction. Previously the hard delete relied on FK CASCADE; with
    // soft-deletes we must propagate explicitly so deleted sessions don't
    // leave dangling public listings.
    const result = await db.transaction(async (tx) => {
      const [deletedSession] = await tx
        .update(designSessionsTable)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(designSessionsTable.id, params.id),
            eq(designSessionsTable.userId, req.userId!),
            isNull(designSessionsTable.deletedAt),
          ),
        )
        .returning();
      if (!deletedSession) return { deletedSession: null, deletedListing: null };
      const [deletedListing] = await tx
        .update(marketplaceListingsTable)
        .set({
          deletedAt: new Date(),
          status: "removed",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(marketplaceListingsTable.sessionId, deletedSession.id),
            isNull(marketplaceListingsTable.deletedAt),
          ),
        )
        .returning();
      return { deletedSession, deletedListing: deletedListing ?? null };
    });
    if (result.deletedSession) {
      // Best-effort: drop the stored concept images for this session.
      // Failures are logged inside deleteObjectByUrl and never block the API.
      try {
        const outs = await db
          .select({ imageUrl: designOutputsTable.imageUrl })
          .from(designOutputsTable)
          .where(eq(designOutputsTable.sessionId, result.deletedSession.id));
        await Promise.all(outs.map((o) => deleteObjectByUrl(o.imageUrl)));
      } catch (err) {
        req.log.warn(
          { err, sessionId: result.deletedSession.id },
          "Failed to enqueue object deletion for session",
        );
      }
      await recordAudit({
        actorUserId: req.userId!,
        action: "session.delete",
        targetType: "design_session",
        targetId: result.deletedSession.id,
        before: {
          status: result.deletedSession.status,
          title: result.deletedSession.title,
        },
        requestId: req.id ? String(req.id) : null,
      });
      if (result.deletedListing) {
        await recordAudit({
          actorUserId: req.userId!,
          action: "listing.unpublish",
          targetType: "marketplace_listing",
          targetId: result.deletedListing.id,
          before: {
            status: result.deletedListing.status,
            title: result.deletedListing.title,
            reason: "session.delete cascade",
          },
          requestId: req.id ? String(req.id) : null,
        });
      }
    }
    res.sendStatus(204);
  }),
);

router.get(
  "/sessions/:id/messages",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(ListMessagesParams, req.params);
    if (!(await userCanReadSession(params.id, req.userId!))) {
      throw notFound("Session");
    }
    const messages = await db
      .select()
      .from(designMessagesTable)
      .where(eq(designMessagesTable.sessionId, params.id))
      .orderBy(designMessagesTable.createdAt);
    res.json(messages.map(serializeMessage));
  }),
);

router.post(
  "/sessions/:id/messages",
  requireAuth,
  aiLimiter,
  asyncHandler(async (req, res) => {
    const params = parseOrThrow(SendMessageParams, req.params);
    const body = parseOrThrow(SendMessageBody, req.body);

    const content = body.content.trim();
    if (!content) throw badRequest("Content is required");

    const [session] = await db
      .select()
      .from(designSessionsTable)
      .where(
        and(
          eq(designSessionsTable.id, params.id),
          isNull(designSessionsTable.deletedAt),
        ),
      );
    if (!session) throw notFound("Session");
    if (session.userId !== req.userId) throw forbidden("Not session owner");

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
      await runPipeline(session.id, req.userId!);
    } catch (err) {
      req.log.error({ err }, "Design pipeline failed");
    }

    const result = await buildSessionResponse(session.id);
    res.status(result?.status === "error" ? 502 : 200).json(result);
  }),
);

export default router;
