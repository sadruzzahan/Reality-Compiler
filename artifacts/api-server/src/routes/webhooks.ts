import express, { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  eq,
  and,
  ordersTable,
  recordAudit,
  type OrderStatusEvent,
} from "@workspace/db";
import { getStripe, getWebhookSecret, type Stripe } from "../lib/stripe";
import { logger } from "../lib/logger";

/**
 * Stripe webhook router. MUST be mounted with `express.raw()` BEFORE the
 * global `express.json()` middleware so we can verify the signature
 * against the raw bytes — see app.ts for the wiring.
 *
 * All handlers are idempotent: Stripe retries failed webhooks, and we
 * may also receive duplicates due to platform retries. We rely on
 * column-level state checks (e.g. "skip if already paid") rather than a
 * dedicated idempotency table to keep things simple.
 *
 * Events handled:
 *   checkout.session.completed       — buyer finished checkout, mark paid
 *   payment_intent.payment_failed    — record failure, leave order in pending
 *   charge.refunded                  — bump refunded amount + status
 */

const router: IRouter = Router();

router.post(
  "/webhooks/stripe",
  // Express 5: a per-route raw body parser. The global JSON parser is
  // mounted AFTER this route in app.ts so this one wins.
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"];
    if (!signature || Array.isArray(signature)) {
      logger.warn("stripe webhook missing signature header");
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(
        req.body as Buffer,
        signature,
        getWebhookSecret(),
      );
    } catch (err) {
      logger.warn({ err }, "stripe webhook signature verification failed");
      res.status(400).json({ error: "Invalid signature" });
      return;
    }

    // ALWAYS return 200 quickly so Stripe doesn't retry on a transient
    // DB blip. We log + alert internally instead.
    try {
      await dispatch(event);
    } catch (err) {
      logger.error(
        { err, eventId: event.id, type: event.type },
        "stripe webhook handler threw",
      );
    }
    res.json({ received: true, type: event.type });
  },
);

async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case "payment_intent.payment_failed":
      await onPaymentFailed(event.data.object as Stripe.PaymentIntent);
      return;
    case "charge.refunded":
      await onChargeRefunded(event.data.object as Stripe.Charge);
      return;
    default:
      // Many events fire that we don't care about — that's fine, we
      // accepted them at the signature step.
      logger.debug({ type: event.type, id: event.id }, "stripe webhook ignored");
  }
}

function orderIdFromMetadata(meta: Stripe.Metadata | null): number | null {
  const raw = meta?.["orderId"];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function onCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const orderId =
    orderIdFromMetadata(session.metadata) ??
    (session.client_reference_id ? Number(session.client_reference_id) : null);
  if (!orderId) {
    logger.warn(
      { sessionId: session.id },
      "checkout.session.completed without orderId metadata",
    );
    return;
  }

  // Pull the existing order so we can guard against double-application
  // and capture the previous status for audit.
  const [existing] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  if (!existing) {
    logger.warn({ orderId, sessionId: session.id }, "order not found for checkout webhook");
    return;
  }
  // Idempotent + monotonic: only `pending_payment` and `failed` may transition
  // to `paid`. Once an order is `paid`, `refunded`, or `partially_refunded`,
  // a replayed/out-of-order completion event must not regress its state.
  if (
    existing.paymentStatus !== "pending_payment" &&
    existing.paymentStatus !== "failed"
  ) {
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // Resolve the charge ID via the PaymentIntent's latest_charge so refunds
  // and reconciliation can address the charge directly without an extra
  // round trip later. Best-effort — a missing charge isn't fatal here.
  let chargeId: string | null = null;
  if (paymentIntentId) {
    try {
      const pi = await getStripe().paymentIntents.retrieve(paymentIntentId);
      chargeId =
        typeof pi.latest_charge === "string"
          ? pi.latest_charge
          : pi.latest_charge?.id ?? null;
    } catch (err) {
      logger.warn(
        { err, paymentIntentId },
        "could not retrieve PaymentIntent for charge ID",
      );
    }
  }

  const event: OrderStatusEvent = {
    status: "queued",
    note: "Payment received — supplier reviewing the design package.",
    at: new Date().toISOString(),
  };

  await db
    .update(ordersTable)
    .set({
      paymentStatus: "paid",
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: chargeId,
      // Promote to active fulfilment now that the buyer has actually paid.
      status: "queued",
      statusHistory: [...existing.statusHistory, event],
      updatedAt: new Date(),
    })
    .where(eq(ordersTable.id, orderId));

  await recordAudit({
    actorUserId: "stripe-webhook",
    action: "order.payment_succeeded",
    targetType: "order",
    targetId: orderId,
    before: { paymentStatus: existing.paymentStatus },
    after: {
      paymentStatus: "paid",
      stripePaymentIntentId: paymentIntentId,
      stripeChargeId: chargeId,
    },
    requestId: null,
  });
}

async function onPaymentFailed(intent: Stripe.PaymentIntent): Promise<void> {
  const orderId = orderIdFromMetadata(intent.metadata);
  if (!orderId) return;
  const [existing] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));
  if (!existing) return;
  // Idempotent + monotonic: only `pending_payment` may transition to
  // `failed`. Don't regress a `paid`, `refunded`, or `partially_refunded`
  // order if a stale failure event arrives late or out of order.
  if (existing.paymentStatus !== "pending_payment") return;

  await db
    .update(ordersTable)
    .set({
      paymentStatus: "failed",
      stripePaymentIntentId: intent.id,
      updatedAt: new Date(),
    })
    .where(eq(ordersTable.id, orderId));

  await recordAudit({
    actorUserId: "stripe-webhook",
    action: "order.payment_failed",
    targetType: "order",
    targetId: orderId,
    before: { paymentStatus: existing.paymentStatus },
    after: { paymentStatus: "failed" },
    requestId: null,
  });
}

async function onChargeRefunded(charge: Stripe.Charge): Promise<void> {
  // The refund event fires for both partial and full refunds; the canonical
  // amounts live on `charge.amount_refunded` (cumulative cents).
  const piId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;
  if (!piId) return;

  const [existing] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.stripePaymentIntentId, piId),
      ),
    );
  if (!existing) {
    logger.warn(
      { paymentIntentId: piId, chargeId: charge.id },
      "charge.refunded for unknown order",
    );
    return;
  }

  const refundedDollars =
    Math.round((charge.amount_refunded ?? 0) / 100 * 100) / 100;
  const totalDollars = Number(existing.totalCost);
  const fullyRefunded = refundedDollars >= totalDollars - 0.005;
  const nextStatus = fullyRefunded ? "refunded" : "partially_refunded";

  if (
    Number(existing.refundedAmount) === refundedDollars &&
    existing.paymentStatus === nextStatus
  ) {
    return; // already applied
  }

  await db
    .update(ordersTable)
    .set({
      paymentStatus: nextStatus,
      refundedAmount: String(refundedDollars),
      stripeChargeId: charge.id,
      updatedAt: new Date(),
    })
    .where(eq(ordersTable.id, existing.id));

  await recordAudit({
    actorUserId: "stripe-webhook",
    action: "order.refunded",
    targetType: "order",
    targetId: existing.id,
    before: {
      paymentStatus: existing.paymentStatus,
      refundedAmount: existing.refundedAmount,
    },
    after: { paymentStatus: nextStatus, refundedAmount: refundedDollars },
    requestId: null,
  });
}

export default router;
