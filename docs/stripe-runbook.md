# Stripe Checkout + Connect — Operator Runbook

This runbook documents how Reality Compiler accepts payments and pays
designers, how to operate it day-to-day, and how to recover when
something goes wrong.

## TL;DR

- Buyers pay via **Stripe Checkout** (hosted page). The funds land on
  the platform's Stripe balance.
- 70 % of the **licence portion** of each order is transferred to the
  designer's **Stripe Connect Express** account via
  `transfer_data[destination]` on the PaymentIntent (a destination
  charge).
- The remaining 30 % of the licence portion + 100 % of the
  manufacturing portion stays on the platform balance.
- Order state is driven by webhooks, never by the redirect URL. Orders
  start in `payment_status = pending_payment`; the
  `checkout.session.completed` webhook flips them to `paid` and seeds
  the first `queued` status event.
- Refunds are issued from `POST /api/admin/orders/:id/refund` with
  `reverse_transfer:true` + `refund_application_fee:true` so the
  designer's transfer and platform fee are clawed back proportionally.

## Required environment variables

| Var                         | Where set    | Purpose                                                    |
| --------------------------- | ------------ | ---------------------------------------------------------- |
| `STRIPE_SECRET_KEY`         | API server   | Server-side Stripe SDK auth. Use a **restricted** key in production. |
| `STRIPE_WEBHOOK_SECRET`     | API server   | Verifies signatures on `/api/webhooks/stripe`.             |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Web client | Reserved for future client-side Elements; not used today.  |
| `ADMIN_API_TOKEN`           | API server   | Bearer for `/api/admin/*`, including refunds.              |
| `APP_BASE_URL`              | API server   | Fallback origin for Connect onboarding return URLs when the request has no `Origin` header. |

If `STRIPE_SECRET_KEY` is missing, the API runs in **dev fallback**:
`POST /orders` returns a paid order immediately and Connect endpoints
return 500. This is intentional for local development and the existing
test suite.

## Money flow per order

```
buyer pays                       totalCost  =  manufacturingCost + designerLicenseTotal
                                                ↓                    ↓
platform balance receives        manufacturingCost                  30 % of designerLicenseTotal
designer Connect account gets                                       70 % of designerLicenseTotal  (= order.payoutAmount)
```

- `manufacturingCost = unitCost * quantity + setupFee`  (from the quote).
- `designerLicenseTotal = listing.listingPrice * quantity`  (0 when the
  buyer is also the designer or when there's no marketplace listing).
- `payoutAmount = round(designerLicenseTotal * 0.7, 2)` and is also the
  Stripe `application_fee_amount`-inverted destination amount on the
  PaymentIntent.

If the designer **hasn't onboarded** with Connect (no
`stripeAccountId` or `stripeAccountStatus !== 'enabled'`), no transfer
is created and 100 % of the funds stay on the platform balance to be
reconciled out-of-band.

## Endpoints

| Endpoint                              | Method | Notes                                                         |
| ------------------------------------- | ------ | ------------------------------------------------------------- |
| `POST /api/orders`                    | auth   | Creates a draft order + Checkout Session, returns `{orderId, checkoutUrl}`. |
| `POST /api/me/connect-account`        | auth   | Creates / refreshes the designer's Connect account, returns onboarding URL. |
| `GET  /api/me/connect-status`         | auth   | Live `charges_enabled / payouts_enabled / details_submitted`. |
| `POST /api/admin/orders/:id/refund`   | admin  | `{amount?, reason?}` — full or partial refund.                |
| `POST /api/webhooks/stripe`           | public | Stripe webhook receiver. **Mounted before `express.json()`.** |

## Webhook contract

Webhook URL: `https://<host>/api/webhooks/stripe`

Events we listen to:

| Event                              | Effect                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed`       | `paymentStatus = paid`, store `stripePaymentIntentId` + `stripeChargeId`, seed `queued` status event, audit `order.payment_succeeded`.    |
| `payment_intent.payment_failed`    | `paymentStatus = failed`, audit `order.payment_failed`.                                                                                    |
| `charge.refunded`                  | Recompute `refundedAmount` from `charge.amount_refunded`, set `paymentStatus = refunded` or `partially_refunded`, audit `order.refunded`. |

The handler is idempotent: every update keys off the order's
`stripeCheckoutSessionId` / `stripePaymentIntentId` and short-circuits
when state already matches the event.

### Local webhook forwarding (Stripe CLI)

```sh
stripe login
stripe listen --forward-to localhost:$PORT/api/webhooks/stripe
# copy the printed `whsec_...` into STRIPE_WEBHOOK_SECRET
```

## Designer onboarding

1. Designer visits **/payouts** → "Connect with Stripe".
2. Frontend calls `POST /me/connect-account`; the server
   `account.create({ type:'express' })` (or reuses the existing one)
   and returns a one-shot onboarding URL.
3. Browser redirects to Stripe-hosted onboarding.
4. Stripe redirects back to `/payouts?stripe=connected`.
5. Frontend re-fetches `/me/connect-status`; once
   `chargesEnabled && payoutsEnabled` the badge flips to "Connected".

If onboarding is incomplete the UI shows "Resume onboarding" which
hits the same endpoint to mint a fresh link.

## Refund procedure

1. Identify the order. Confirm `paymentStatus = paid` or
   `partially_refunded` and `refundedAmount` < `totalCost`.
2. Run:
   ```sh
   curl -X POST \
     -H "x-admin-token: $ADMIN_API_TOKEN" \
     -H 'content-type: application/json' \
     -d '{"amount": 25.00, "reason": "requested_by_customer"}' \
     "$API_HOST/api/admin/orders/123/refund"
   ```
   Omit `amount` for a full refund of the remaining balance.
3. The endpoint returns `{refundId, amount, status}` synchronously.
   Stripe processes the refund in the background.
4. The `charge.refunded` webhook updates `paymentStatus` and
   `refundedAmount`. Re-load the order to confirm.

`reverse_transfer:true` + `refund_application_fee:true` mean the
designer's transfer and the platform fee are reversed proportionally
to the refunded amount — no additional manual reconciliation needed.

## Operating notes & gotchas

- **Webhook ordering matters.** `webhookRoutes` must be mounted
  *before* `express.json()` so the raw body is available for
  signature verification. See `app.ts`.
- **One Checkout per order.** We don't reuse Sessions. If the buyer
  abandons checkout the order remains `pending_payment`; the
  `cancel_url` returns them to `/orders/:id?canceled=1` where they
  can re-place the order.
- **Idempotency keys.** `lib/stripe.ts` generates per-order
  idempotency keys for `checkout.sessions.create`, `accounts.create`,
  `accountLinks.create`, and `refunds.create`. Safe to retry on
  network failures.
- **price_data vs Prices.** We use ad-hoc `price_data` because every
  order has a unique total. We do **not** maintain a Stripe Product
  catalogue.
- **Connect not enabled for the designer.** Funds stay on the
  platform balance. Operators can manually send a transfer via the
  Stripe Dashboard once the designer onboards.
- **Disputes.** Not yet automated. Treat any
  `charge.dispute.created` event as a manual ops task; refund or
  defend in the Stripe Dashboard.

## Deviations from the original task spec

1. **No `stripe-replit-sync` blueprint.** That blueprint targets
   subscription / catalogue products with fixed Prices; Reality
   Compiler is a marketplace with per-order pricing + Connect
   destination charges, so the Stripe Node SDK is used directly.
2. **`price_data` in Checkout.** Required because every order has a
   unique total — no fixed Stripe Price exists.
3. **Webhook path is `/api/webhooks/stripe`** (not `/webhooks/stripe`)
   so it sits behind the same proxy prefix as the rest of the API.
