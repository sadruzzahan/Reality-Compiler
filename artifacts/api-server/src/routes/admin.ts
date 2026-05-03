import { Router, type IRouter } from "express";
import { eq } from "@workspace/db";
import { z } from "zod";
import { db, ordersTable, recordAudit } from "@workspace/db";
import { asyncHandler } from "../middlewares/asyncHandler";
import { mutateLimiter } from "../middlewares/rateLimits";
import { parseOrThrow } from "../middlewares/validate";
import { ApiError, badRequest, notFound } from "../lib/errors";
import { purgeDeletedAccounts } from "../lib/accountDeletion";
import { isStripeConfigured, refundOrder } from "../lib/stripe";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function requireAdminToken(req: { headers: Record<string, unknown> }) {
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

const RefundOrderParams = z.object({
  id: z.coerce.number().int().positive(),
});

const RefundOrderBody = z.object({
  /** Amount in dollars to refund. Omit / null for a full refund. */
  amount: z.number().positive().nullable().optional(),
  reason: z
    .enum(["duplicate", "fraudulent", "requested_by_customer"])
    .optional(),
});

/**
 * Admin endpoint that hard-deletes user data soft-deleted >30 days ago.
 * Authenticated via `x-admin-token` header matching `ADMIN_API_TOKEN`.
 *
 * Schedule it via your platform's cron (e.g. Replit Scheduled Deployment)
 * with a request like:
 *   curl -X POST -H "x-admin-token: $ADMIN_API_TOKEN" \
 *     https://<host>/api/admin/purge-deleted
 */
router.post(
  "/admin/purge-deleted",
  asyncHandler(async (req, res) => {
    requireAdminToken(req);
    const summary = await purgeDeletedAccounts();
    logger.info({ summary }, "admin purge completed");
    res.json(summary);
  }),
);

/**
 * Refund (full or partial) a paid order. Triggers a Stripe Refund with
 * `reverse_transfer:true` + `refund_application_fee:true` so the
 * designer's Connect transfer + the platform fee are both clawed back
 * proportionally to the refunded amount. The actual `payment_status`
 * and `refunded_amount` columns are updated by the `charge.refunded`
 * webhook (so this endpoint is safe to retry).
 *
 * Authenticated via `x-admin-token` matching `ADMIN_API_TOKEN`.
 *
 *   curl -X POST -H "x-admin-token: $ADMIN_API_TOKEN" \
 *     -H 'content-type: application/json' \
 *     -d '{"amount": 50.00, "reason": "requested_by_customer"}' \
 *     https://<host>/api/admin/orders/123/refund
 */
router.post(
  "/admin/orders/:id/refund",
  mutateLimiter,
  asyncHandler(async (req, res) => {
    requireAdminToken(req);
    if (!isStripeConfigured()) {
      throw new ApiError(
        "INTERNAL",
        "Stripe is not configured on the server (STRIPE_SECRET_KEY missing).",
      );
    }
    const params = parseOrThrow(RefundOrderParams, req.params);
    const body = parseOrThrow(RefundOrderBody, req.body);

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, params.id));
    if (!order) throw notFound("Order");
    if (!order.stripePaymentIntentId) {
      throw badRequest(
        "Order has no Stripe payment_intent — nothing to refund.",
      );
    }
    if (order.paymentStatus === "pending_payment") {
      throw badRequest("Order has not been paid yet.");
    }
    if (order.paymentStatus === "refunded") {
      throw badRequest("Order is already fully refunded.");
    }
    const remaining =
      Number(order.totalCost) - Number(order.refundedAmount);
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
      reason: body.reason,
    });

    await recordAudit({
      actorUserId: "admin",
      action: "order.refund_initiated",
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

export default router;
