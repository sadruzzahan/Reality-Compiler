# Reality Compiler

Full-stack monorepo. Users describe a physical product in plain English; AI generates a concept image, BOM, manufacturing plan, and cost estimate. Sessions and refinements persist.

## Architecture

- `artifacts/reality-compiler` — React + Vite frontend at `/`. Uses generated React Query hooks from `@workspace/api-client-react`.
- `artifacts/api-server` — Express 5 API at `/api`. Routes in `src/routes/sessions.ts`, AI pipeline in `src/lib/designPipeline.ts`, seed in `src/lib/seed.ts`.
- `lib/api-spec/openapi.yaml` — single source of truth. Run `pnpm --filter @workspace/api-spec run codegen` after edits.
- `lib/db/src/schema/` — Drizzle tables: `design_sessions`, `design_messages`, `design_outputs`, `marketplace_listings`, `orders`, `quotes`, `suppliers`, `user_profiles`, `audit_log`. Soft-delete via `deleted_at` on sessions/listings/orders. Schema changes go through migrations: `pnpm --filter @workspace/db run generate` then `pnpm --filter @workspace/db run migrate`. `push` is dev-only. See `docs/db-runbook.md`.
- `lib/integrations-openai-ai-server` — slim OpenAI client (chat completions + image generation) via Replit AI Integrations proxy.

## AI pipeline

`generateDesignSpec` calls `gpt-5.4` with `response_format: json_object`, validates the result with Zod (`DesignSpecSchema`) before persisting. `generateConceptImageDataUrl` calls `gpt-image-1` and stores the result as a base64 data URL.

## Env

- `DATABASE_URL` (and PG*) — managed Postgres
- `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit AI Integrations

## Auth (Clerk)

Clerk Auth (Replit-managed) wraps the React app. Sign-in/sign-up at `/sign-in/*?` and `/sign-up/*?` use the `shadcn` theme. The Express API mounts `clerkMiddleware()` and a `requireAuth` middleware reads `getAuth(req).sessionClaims.userId || userId` and writes `req.userId`. Sessions and orders are scoped by `userId`. Public routes: `/`, `/marketplace`, `/marketplace/:id`, `/designers/:userId`, `/suppliers`, `/about`, `/sign-in`, `/sign-up`, `GET /api/sessions/stats`, marketplace routes. Protected: `/sessions*`, `/orders*`, `/api/sessions*`, `/api/orders*`, `/api/me`.

## Marketplace

- Tables: `marketplace_listings (id, sessionId UNIQUE, userId, creatorHandle, title, category, description, listingPrice, status)`. Orders gain optional `marketplaceListingId`.
- Routes: `GET /api/marketplace/listings?sort=`, `POST /api/marketplace/listings` (publish, upserts by sessionId), `GET /api/marketplace/listings/{id}`, `DELETE /api/marketplace/listings/{id}`, `GET /api/marketplace/profile/{userId}`.
- Seed publishes any `system-seed` user sessions on startup so the marketplace is never empty for guests.
- Frontend pages: `marketplace.tsx`, `marketplace-detail.tsx` (with order dialog), `designer-profile.tsx`. Publish action via `components/publish-dialog.tsx` on session-workspace.

## Privacy & data rights (Task #10)

- **Static legal pages** at `/terms`, `/privacy`, `/acceptable-use`, `/cookies`, `/legal/dpa`, `/contact`. Layout in `components/legal-page.tsx` (sticky TOC + last-updated). Linked from `components/footer.tsx` (mounted in `AppShell`) and from the sign-up page legal notice.
- **Cookie banner**: `components/cookie-banner.tsx` + `lib/cookie-consent.ts` (`useCookieConsent`). Choices persist in localStorage under `rc_cookie_consent_v1`; reset from `/cookies`. No third-party tags.
- **GET `/api/me/export`** — auth-only. Streams a JSON archive (profile, sessions, messages, outputs, listings, orders, derived payouts) with `Content-Disposition: attachment`. Built in `lib/dataExport.ts`.
- **DELETE `/api/me`** — auth-only. Soft-deletes sessions & listings, anonymises buyer info on past orders (shipping fields scrubbed, `userId` → `deleted-user:<sha256-prefix>`), remaps `designerUserId` to the same anon id so payouts stay aggregable, scrubs `user_profiles` row + sets `deletedAt`, and revokes active Clerk sessions. Frontend (`components/privacy-data-card.tsx`) signs the user out with `useClerk().signOut()`.
- **POST `/api/admin/purge-deleted`** — gated by `x-admin-token` header matching `ADMIN_API_TOKEN` env var. Hard-deletes profiles soft-deleted >30d ago, drops their sessions/listings/objects, and `clerkClient.users.deleteUser`s them. Anonymised orders are retained for tax. Set `ADMIN_API_TOKEN` and call from a cron / scheduled deployment.
- **Schema**: `user_profiles.deletedAt` added (indexed) as the soft-delete grace marker for accounts.

## Privacy & data rights — addendum

- **Sign-up consent gate**: `/sign-up` shows a required 18+ / Terms / AUP / Privacy checkbox before Clerk's `<SignUp/>` is rendered. Acceptance is stored in `localStorage[rc_signup_consent_v1]`.
- **Marketplace legal**: Terms section 6 spells out 70/30 revenue split, payout conditions (delivered + 14-day dispute window, $50 threshold), refund policy, and IP/licence language. AUP enumerates prohibited product categories (weapons, drugs, surveillance/stalkerware, hate/extremism, CSAM, counterfeits/IP infringement, uncertified regulated goods, hazmat, CITES wildlife).
- **Contact form**: `/contact` posts to `POST /api/contact` (zod-validated, returns 202). Submissions are written to `audit_log` (`action: "contact.submit"`) and best-effort emailed to `SUPPORT_INBOX_EMAIL` from `SUPPORT_FROM_EMAIL` via Resend (`RESEND_API_KEY`). When secrets are unset the audit log is the durable record. Code in `artifacts/api-server/src/lib/email.ts`.
- **Downloadable DPA PDF**: `/legal/reality-compiler-dpa.pdf` is generated from `scripts/generate-dpa-pdf.mjs` (pdfkit) into `artifacts/reality-compiler/public/legal/`. Re-run the script after edits. The DPA page (`/legal/dpa`) links to it with a download button.
- **Object purge fix**: `purgeDeletedAccounts()` now lists and deletes every key under `avatars/<userId>/` and `sessions/<userId>/` via `deleteObjectsByPrefix()` regardless of whether the user had DB sessions. `softDeleteAccount()` no longer nulls `avatarUrl` so the purge has a precise reference.

## SEO, metadata & marketing polish (Task #11)

- **Document head hook**: `artifacts/reality-compiler/src/hooks/use-document-head.ts` is a tiny no-library hook that mutates `<title>`, `meta[name=description]`, canonical, OG/Twitter (`title`/`description`/`image`/`type`), `noIndex`, and an optional inline JSON-LD `<script>`. Cleans up on unmount so per-route values revert to the defaults baked into `index.html`. Wrapped by `src/lib/seo-defaults.ts` (`usePublicPageHead` / `usePrivatePageHead`) for routes that just need title + description.
- **Per-route metadata**: every page calls one of the hooks. Marketplace listing detail emits Product JSON-LD with `offers.price` (USD) and `image` from `designOutput.imageUrl`; designer profile sets `og:type=profile` and uses the avatar as OG image. Auth-walled routes (`/sessions`, `/orders`, `/payouts`, `/my-profile`, `/session/*`, `/order/*`) set `noIndex`.
- **Static SEO assets**: `scripts/generate-favicons.mjs` (sharp) outputs the full icon set + `opengraph.jpg` + `manifest.webmanifest` into `artifacts/reality-compiler/public/icons/` (and root favicon.ico). `index.html` references them and sets default OG/Twitter cards, theme-color, and a Website JSON-LD.
- **robots.txt**: `artifacts/reality-compiler/public/robots.txt` allows the marketing surface, disallows authenticated paths and `/api/`, and points to the sitemap.
- **Dynamic sitemap**: `artifacts/api-server/src/routes/sitemap.ts` serves `GET /api/sitemap.xml` (XML, `Cache-Control: public, max-age=600`). Includes static marketing pages plus active marketplace listings (status=active, deletedAt is null) and all designer profiles, using `marketplaceListingsTable` / `userProfilesTable` aliased imports. Origin is taken from `x-forwarded-{proto,host}` and an optional `SITE_BASE_PATH`/`BASE_PATH` prefix.
- **/pricing**: new public route at `artifacts/reality-compiler/src/pages/pricing.tsx` — tier cards (Compiler free, Designer 70%), 4-step flow, earnings table (70/30), payout terms ($50 threshold, 14-day dispute window), supported categories. Linked from navbar (`CircleDollarSign`) and footer.
- **Home & About marketing copy**: home now leads with free + 70/30 badging, three prompt suggestions, a "How it works" strip, and three testimonials (clearly fictional placeholders — replace before launch). About page declares `og:type=article`.
