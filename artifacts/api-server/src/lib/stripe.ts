import Stripe from "stripe";
import { logger } from "./logger";

/**
 * Stripe client + helpers for Reality Compiler's marketplace.
 *
 * Architectural notes / deviations from the default Stripe skill:
 *
 * 1. We do NOT use `stripe-replit-sync`. That package is built for
 *    catalog/subscription apps that want a local mirror of every
 *    product/price/customer/subscription. Reality Compiler is a
 *    marketplace with one-off, dynamically-priced orders and Stripe
 *    Connect Express payouts; the order row is the source of truth and
 *    we only need a handful of webhook events.
 *
 * 2. We use Checkout `price_data` (not pre-created Stripe prices). Each
 *    order is uniquely priced (unit_cost × quantity + setup_fee for the
 *    supplier portion, plus the listing license price × quantity for
 *    the designer share), so creating a Stripe Product/Price per order
 *    would be wasteful. The `metadata.orderId` carried on the Checkout
 *    session and PaymentIntent is what reconciles the webhook back to
 *    our DB row.
 *
 * 3. Connect Express accounts are created lazily via `account_links` —
 *    no embedded onboarding. The designer is redirected into Stripe's
 *    hosted onboarding and back to /payouts on completion.
 *
 * Required env:
 *   STRIPE_SECRET_KEY        — sk_test_... in dev, sk_live_... in prod
 *   STRIPE_WEBHOOK_SECRET    — whsec_... from the webhook endpoint
 *   APP_BASE_URL             — used to build success/cancel/return URLs
 *                              (defaults to first REPLIT_DOMAINS entry)
 */

let _client: Stripe | null = null;

export function getStripe(): Stripe {
  if (_client) return _client;
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured. Add it via Replit Secrets " +
        "or connect the Stripe integration before using Stripe features.",
    );
  }
  _client = new Stripe(key, {
    apiVersion: "2026-04-22.dahlia",
    appInfo: {
      name: "reality-compiler",
      version: "0.1.0",
    },
    // Built-in retries for idempotent ops; we always pass an idempotency
    // key on creates so this is safe.
    maxNetworkRetries: 2,
  });
  return _client;
}

/**
 * True iff the server has the credentials needed to actually talk to
 * Stripe. Used by health/feature-flag checks; does not throw.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env["STRIPE_SECRET_KEY"]);
}

export function getWebhookSecret(): string {
  const s = process.env["STRIPE_WEBHOOK_SECRET"];
  if (!s) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not configured — webhook verification " +
        "will fail. Set it from the Stripe dashboard endpoint.",
    );
  }
  return s;
}

export function getAppBaseUrl(): string {
  const explicit = process.env["APP_BASE_URL"];
  if (explicit) return explicit.replace(/\/$/, "");
  const domain = process.env["REPLIT_DOMAINS"]?.split(",")[0];
  if (domain) return `https://${domain}`;
  return "http://localhost:5000";
}

/**
 * Idempotency key derived from a stable per-order tuple. Re-issuing the
 * same Checkout session creation under the same key returns the original
 * Stripe object instead of charging twice.
 */
export function checkoutIdempotencyKey(
  orderId: number,
  attempt: number,
): string {
  return `order:${orderId}:checkout:v1:${attempt}`;
}

/**
 * Refund idempotency keys must be unique per refund attempt but stable
 * across retries of the same attempt. We derive the key from the order id,
 * the refunded-amount baseline before this refund (in cents) and the
 * requested amount (in cents). That way:
 *   - Retrying the exact same partial refund returns the original Refund.
 *   - A second, distinct partial refund on the same order gets a fresh
 *     key (the baseline has shifted) so Stripe processes it normally.
 *   - A "full refund of the remaining balance" call still dedupes per
 *     baseline so accidental double-clicks don't double-refund.
 */
export function refundIdempotencyKey(
  orderId: number,
  previouslyRefundedCents: number,
  requestedCents: number,
): string {
  return `order:${orderId}:refund:v2:base${previouslyRefundedCents}:amt${requestedCents}`;
}

export function connectAccountIdempotencyKey(userId: string): string {
  return `connect:${userId}:account:v1`;
}

export interface CreateCheckoutSessionInput {
  orderId: number;
  userId: string;
  /** Total the buyer pays in dollars (we convert to cents). */
  totalDollars: number;
  /** Designer payout in dollars (the 70% share). 0 if no marketplace listing. */
  payoutDollars: number;
  /** Designer's Stripe Connect account; null if no marketplace listing. */
  designerStripeAccountId: string | null;
  productLabel: string;
  customerEmail: string | null;
  buyerStripeCustomerId: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Used to dedupe retries from the same user click. */
  attempt?: number;
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const totalCents = Math.round(input.totalDollars * 100);
  const payoutCents = Math.round(input.payoutDollars * 100);
  const platformFeeCents = Math.max(0, totalCents - payoutCents);

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    payment_method_types: ["card"],
    customer_email: input.buyerStripeCustomerId ? undefined : input.customerEmail ?? undefined,
    customer: input.buyerStripeCustomerId ?? undefined,
    client_reference_id: String(input.orderId),
    metadata: {
      orderId: String(input.orderId),
      userId: input.userId,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: totalCents,
          product_data: {
            name: input.productLabel,
            metadata: { orderId: String(input.orderId) },
          },
        },
      },
    ],
    payment_intent_data: {
      metadata: {
        orderId: String(input.orderId),
        userId: input.userId,
      },
    },
  };

  // Connect: only attach transfer_data + application_fee when there is a
  // designer to pay out to (i.e. marketplace order with a connected
  // designer). For a buyer ordering their own design we keep 100% of the
  // funds on the platform account — there's no second party to route to.
  if (
    input.designerStripeAccountId &&
    payoutCents > 0 &&
    platformFeeCents >= 0 &&
    params.payment_intent_data
  ) {
    params.payment_intent_data.application_fee_amount = platformFeeCents;
    params.payment_intent_data.transfer_data = {
      destination: input.designerStripeAccountId,
    };
  }

  return stripe.checkout.sessions.create(params, {
    idempotencyKey: checkoutIdempotencyKey(input.orderId, input.attempt ?? 1),
  });
}

/**
 * Idempotently get-or-create a Connect Express account for the designer,
 * then return a one-shot onboarding link. Callers persist
 * `account.id` and the resulting status on the user_profile row.
 */
export interface CreateConnectLinkInput {
  userId: string;
  email: string | null;
  /** Existing Stripe account id, if we've previously created one. */
  existingAccountId: string | null;
  refreshUrl: string;
  returnUrl: string;
}

export interface CreateConnectLinkResult {
  account: Stripe.Account;
  link: Stripe.AccountLink;
}

export async function createConnectAccountLink(
  input: CreateConnectLinkInput,
): Promise<CreateConnectLinkResult> {
  const stripe = getStripe();
  let account: Stripe.Account;
  if (input.existingAccountId) {
    account = await stripe.accounts.retrieve(input.existingAccountId);
  } else {
    account = await stripe.accounts.create(
      {
        type: "express",
        email: input.email ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { userId: input.userId },
      },
      {
        idempotencyKey: connectAccountIdempotencyKey(input.userId),
      },
    );
  }
  // Bucket the idempotency key by minute so a rapid double-click returns
  // the same single-use link, but a deliberate "resume onboarding" click
  // a few minutes later (after the first link expired) gets a fresh one.
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const link = await stripe.accountLinks.create(
    {
      account: account.id,
      type: "account_onboarding",
      refresh_url: input.refreshUrl,
      return_url: input.returnUrl,
    },
    {
      idempotencyKey: `connect:${input.userId}:link:v1:${minuteBucket}`,
    },
  );
  return { account, link };
}

export type ConnectAccountStatus = "pending" | "restricted" | "enabled";

export function summarizeAccountStatus(
  account: Stripe.Account,
): ConnectAccountStatus {
  if (account.charges_enabled && account.payouts_enabled) return "enabled";
  if (account.details_submitted) return "restricted";
  return "pending";
}

export async function getAccountStatus(
  accountId: string,
): Promise<{ account: Stripe.Account; status: ConnectAccountStatus }> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(accountId);
  return { account, status: summarizeAccountStatus(account) };
}

export interface RefundOrderInput {
  orderId: number;
  paymentIntentId: string;
  /** Amount in dollars to refund; null for full refund of the remainder. */
  amountDollars: number | null;
  /** How much has already been refunded for this order, in dollars. */
  alreadyRefundedDollars: number;
  /** Total order amount in dollars (used to size a "remainder" refund). */
  totalDollars: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
}

export async function refundOrder(
  input: RefundOrderInput,
): Promise<Stripe.Refund> {
  const stripe = getStripe();
  const baselineCents = Math.round(input.alreadyRefundedDollars * 100);
  // For a "remainder" refund we let Stripe compute the actual amount, but
  // size the idempotency key off the remaining balance so distinct
  // sequential remainder calls (which shouldn't normally happen) still get
  // distinct keys.
  const requestedCents =
    input.amountDollars != null
      ? Math.round(input.amountDollars * 100)
      : Math.max(
          0,
          Math.round(input.totalDollars * 100) - baselineCents,
        );

  const params: Stripe.RefundCreateParams = {
    payment_intent: input.paymentIntentId,
    // Reverse the platform's transfer to the connected account so the
    // designer's portion comes back to the platform balance proportionally.
    // No-op for non-Connect orders.
    reverse_transfer: true,
    refund_application_fee: true,
    metadata: { orderId: String(input.orderId) },
  };
  if (input.amountDollars != null) {
    params.amount = requestedCents;
  }
  if (input.reason) params.reason = input.reason;

  try {
    return await stripe.refunds.create(params, {
      idempotencyKey: refundIdempotencyKey(
        input.orderId,
        baselineCents,
        requestedCents,
      ),
    });
  } catch (err) {
    logger.warn(
      { err, orderId: input.orderId, paymentIntentId: input.paymentIntentId },
      "stripe refund failed",
    );
    throw err;
  }
}

/**
 * Lazily create + persist a Stripe Customer for buyers who have an email.
 * Allows checkout sessions to skip re-collecting the email and gives us a
 * stable id to power future receipts / saved cards.
 */
export async function ensureCustomer(
  userId: string,
  email: string | null,
  existingId: string | null,
): Promise<string | null> {
  if (existingId) return existingId;
  if (!email) return null;
  const stripe = getStripe();
  const customer = await stripe.customers.create(
    {
      email,
      metadata: { userId },
    },
    { idempotencyKey: `customer:${userId}:v1` },
  );
  return customer.id;
}

export { Stripe };
