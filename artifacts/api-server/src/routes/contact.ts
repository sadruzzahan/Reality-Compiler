import { Router, type IRouter } from "express";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import { asyncHandler } from "../middlewares/asyncHandler";
import { ApiError } from "../lib/errors";
import { recordAudit } from "@workspace/db";
import { logger } from "../lib/logger";
import { sendSupportEmail } from "../lib/email";
import { randomUUID } from "node:crypto";

const router: IRouter = Router();

const TOPICS = ["general", "privacy", "security", "legal", "abuse"] as const;

const ContactInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  topic: z.enum(TOPICS),
  message: z.string().trim().min(10).max(5000),
});

/**
 * Public contact endpoint. Accepts a structured support message, persists it
 * to the audit log (so support can browse and respond out-of-band), and
 * returns 202 Accepted.
 *
 * Email delivery is handled by a downstream task (#21). Until that lands,
 * the audit_log row + server log are the source of truth — operators can
 * query them via the database UI.
 */
router.post(
  "/contact",
  asyncHandler(async (req, res) => {
    const parsed = ContactInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        "VALIDATION",
        "Invalid contact submission",
        parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      );
    }
    const input = parsed.data;
    const auth = getAuth(req);
    const claimedUserId =
      (auth?.sessionClaims as { userId?: unknown } | undefined)?.userId;
    const actorUserId =
      typeof claimedUserId === "string"
        ? claimedUserId
        : auth?.userId ?? null;

    const targetId = `contact:${Date.now()}-${randomUUID().slice(0, 8)}`;
    await recordAudit({
      actorUserId,
      action: "contact.submit",
      targetType: "contact_message",
      targetId,
      after: input,
      requestId: req.id != null ? String(req.id) : null,
    });

    logger.info(
      { topic: input.topic, email: input.email, targetId },
      "contact message received",
    );

    // Best-effort email delivery to the support inbox. Failure here does
    // NOT fail the request: the audit_log row above is the durable record
    // and operators can replay deliveries from it.
    const emailed = await sendSupportEmail({
      name: input.name,
      email: input.email,
      topic: input.topic,
      message: input.message,
      ref: targetId,
    });

    res.status(202).json({ ok: true, ref: targetId, emailed });
  }),
);

export default router;
