/**
 * End-to-end coverage of the marketplace sign-in -> publish -> order flow.
 *
 * Verifies:
 * 1. A signed-out visitor can browse `/marketplace` and `/marketplace/:id`
 *    without any `/api/*` request returning HTTP 401 (gating regression).
 * 2. The marketplace detail page hides the "Order this design" CTA for
 *    signed-out users and shows "Sign in to order" instead.
 * 3. User A can compile a design session, generate quotes and publish a
 *    listing.
 * 4. User B (a different Clerk user) can place an order against user A's
 *    published listing — exercising the IDOR fix on `POST /api/orders`.
 * 5. The placed order appears in user B's `/orders` page.
 * 6. The placed order does NOT appear in user A's `/orders` page (the
 *    list is correctly scoped to `req.userId`).
 *
 * Auth uses Clerk's "+clerk_test" email convention with the fixed
 * verification code `424242`. `setupClerkTestingToken` bypasses bot
 * detection on the dev instance so the sign-in UI works headlessly.
 *
 * Required env vars:
 *   - CLERK_PUBLISHABLE_KEY
 *   - CLERK_SECRET_KEY
 *   - E2E_BASE_URL (or REPLIT_DEV_DOMAIN) — origin serving the app
 */
import { test, expect, type Page, type Request, type Response } from "@playwright/test";
import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";

const STAMP = Date.now();
const SELLER_EMAIL = `seller_${STAMP}+clerk_test@example.com`;
const BUYER_EMAIL = `buyer_${STAMP}+clerk_test@example.com`;

test.beforeAll(async () => {
  await clerkSetup();
});

function trackApi401s(page: Page): { hits: { url: string; status: number }[] } {
  const hits: { url: string; status: number }[] = [];
  page.on("response", (resp: Response) => {
    const url = resp.url();
    if (!/\/api\//.test(url)) return;
    if (resp.status() === 401) hits.push({ url, status: 401 });
  });
  // Also watch for failed requests to /api (network errors)
  page.on("requestfailed", (req: Request) => {
    if (/\/api\//.test(req.url())) {
      hits.push({ url: req.url(), status: -1 });
    }
  });
  return { hits };
}

async function signIn(page: Page, email: string): Promise<void> {
  await setupClerkTestingToken({ page });
  await page.goto("/sign-in");
  // Clerk's Playwright helper handles the +clerk_test email-code flow
  // and auto-submits the canonical 424242 verification code.
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "email_code",
      identifier: email,
    },
  });
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), {
    timeout: 60_000,
  });
}

async function signOut(page: Page): Promise<void> {
  await clerk.signOut({ page });
}

test("sign-in -> publish -> cross-user order with scoped /orders", async ({ browser }) => {
  // ---------- Context A: signed-out browse of /marketplace ---------------
  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  const apiA = trackApi401s(pageA);
  await pageA.goto("/marketplace");
  await expect(
    pageA.getByRole("heading", { name: /Buy ready-to-manufacture designs/i }),
  ).toBeVisible();
  expect(apiA.hits, "no /api/* 401s on signed-out /marketplace").toEqual([]);
  await ctxA.close();

  // ---------- Context B: SELLER -----------------------------------------
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signIn(pageB, SELLER_EMAIL);

  await pageB.goto("/");
  const promptBox = pageB.getByPlaceholder(/Describe your product/i);
  await promptBox.fill(
    "A minimalist matte-black aluminum desk lamp with walnut accents and USB-C base.",
  );
  await pageB.getByRole("button", { name: /Compile/i }).click();

  await pageB.waitForURL(/\/sessions\/\d+/, { timeout: 60_000 });
  const sessionUrl = new URL(pageB.url());
  const sessionId = Number(sessionUrl.pathname.split("/").pop());
  expect(sessionId).toBeGreaterThan(0);

  // Wait for the session to become "ready" — the publish button only
  // mounts once status === "ready".
  await expect(pageB.getByTestId("button-publish-marketplace")).toBeVisible({
    timeout: 180_000,
  });

  // Generate quotes if the empty-state button is showing. We wait for
  // the quotes panel to settle into either the empty state (button) or
  // the populated state (cards) before deciding which path to take.
  const generateQuotesBtn = pageB.getByTestId("button-generate-quotes");
  const firstQuoteCard = pageB.locator('[data-testid^="card-quote-"]').first();
  await expect(generateQuotesBtn.or(firstQuoteCard)).toBeVisible({
    timeout: 60_000,
  });
  if (await generateQuotesBtn.isVisible()) {
    await generateQuotesBtn.click();
    await expect(firstQuoteCard).toBeVisible({ timeout: 90_000 });
  }

  await pageB.getByTestId("button-publish-marketplace").click();
  const priceInput = pageB.getByTestId("input-listing-price");
  await priceInput.fill("100");
  await pageB.getByTestId("button-confirm-publish").click();

  await pageB.waitForURL(/\/marketplace\/\d+/, { timeout: 30_000 });
  const listingId = Number(new URL(pageB.url()).pathname.split("/").pop());
  expect(listingId).toBeGreaterThan(0);

  await signOut(pageB);
  await ctxB.close();

  // ---------- Context C: BUYER (signed-out detail-page gating + order) ---
  const ctxC = await browser.newContext();
  const pageC = await ctxC.newPage();
  const apiC = trackApi401s(pageC);

  await pageC.goto("/marketplace");
  await expect(pageC.getByTestId(`card-listing-${listingId}`)).toBeVisible({
    timeout: 30_000,
  });
  expect(apiC.hits, "no /api/* 401s on signed-out /marketplace browse").toEqual([]);

  await pageC.goto(`/marketplace/${listingId}`);
  await expect(pageC.getByTestId("button-sign-in-to-order")).toBeVisible();
  await expect(pageC.getByTestId("button-order-design")).toHaveCount(0);
  expect(apiC.hits, "no /api/* 401s on signed-out /marketplace/:id").toEqual([]);

  await signIn(pageC, BUYER_EMAIL);

  await pageC.goto(`/marketplace/${listingId}`);
  await expect(pageC.getByTestId("button-order-design")).toBeVisible();
  await pageC.getByTestId("button-order-design").click();

  await pageC.getByTestId("input-quantity").fill("5");
  await pageC.getByTestId("input-recipient").fill("Buyer User");
  await pageC.getByTestId("input-line1").fill("123 Test St");
  await pageC.getByTestId("input-city").fill("Austin");
  await pageC.getByTestId("input-region").fill("TX");
  await pageC.getByTestId("input-postal").fill("78701");
  await pageC.getByTestId("input-country").fill("US");
  await pageC.getByTestId("button-place-order").click();

  await pageC.waitForURL(/\/orders\/\d+/, { timeout: 60_000 });
  const orderId = Number(new URL(pageC.url()).pathname.split("/").pop());
  expect(orderId).toBeGreaterThan(0);

  await pageC.goto("/orders");
  await expect(pageC.getByTestId(`row-order-${orderId}`)).toBeVisible();

  await signOut(pageC);
  await ctxC.close();

  // ---------- Context D: SELLER again — order MUST NOT appear -----------
  const ctxD = await browser.newContext();
  const pageD = await ctxD.newPage();
  await signIn(pageD, SELLER_EMAIL);
  await pageD.goto("/orders");
  // Either the empty state renders or other rows render; in neither case
  // should the buyer's order id appear in the seller's scoped list.
  await pageD.waitForLoadState("networkidle");
  await expect(pageD.getByTestId(`row-order-${orderId}`)).toHaveCount(0);
  await ctxD.close();
});
