# @workspace/e2e

Playwright end-to-end tests for the Reality Compiler marketplace.

## Coverage

`specs/marketplace-order-flow.spec.ts` exercises the full
sign-in → publish → cross-user order flow:

1. Signed-out browse of `/marketplace` and `/marketplace/:id` does not
   trigger any `/api/*` 401s (regression guard for the public browse).
2. The detail page hides the order CTA for signed-out users and shows
   "Sign in to order" instead.
3. Seller (Clerk user A) compiles a design session, generates
   manufacturing quotes, and publishes a marketplace listing.
4. Buyer (Clerk user B) places an order against the seller's listing
   via `POST /api/orders` (regression guard for the IDOR fix).
5. The new order appears in the buyer's `/orders` page.
6. The new order does **not** appear in the seller's `/orders` page,
   proving `GET /api/orders` is correctly scoped to `req.userId`.

## Running

Install Playwright browsers once:

```sh
pnpm --filter @workspace/e2e run install-browsers
```

Then run the suite against the running dev stack (web + api):

```sh
# defaults to https://$REPLIT_DEV_DOMAIN
pnpm --filter @workspace/e2e test

# or against a custom origin
E2E_BASE_URL=https://example.com pnpm --filter @workspace/e2e test
```

## Required env

- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — used by
  `@clerk/testing` to mint a testing token and bypass bot detection
  on the dev instance.
- `E2E_BASE_URL` _or_ `REPLIT_DEV_DOMAIN` — origin under test.

The spec uses Clerk's `+clerk_test` email convention so sign-in
codes resolve to the canonical `424242` verification code without
any real email delivery.
