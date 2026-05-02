# Reality Compiler

Full-stack monorepo. Users describe a physical product in plain English; AI generates a concept image, BOM, manufacturing plan, and cost estimate. Sessions and refinements persist.

## Architecture

- `artifacts/reality-compiler` — React + Vite frontend at `/`. Uses generated React Query hooks from `@workspace/api-client-react`.
- `artifacts/api-server` — Express 5 API at `/api`. Routes in `src/routes/sessions.ts`, AI pipeline in `src/lib/designPipeline.ts`, seed in `src/lib/seed.ts`.
- `lib/api-spec/openapi.yaml` — single source of truth. Run `pnpm --filter @workspace/api-spec run codegen` after edits.
- `lib/db/src/schema/designSessions.ts` — Drizzle tables: `design_sessions`, `design_messages`, `design_outputs`. Push with `pnpm --filter @workspace/db run push`.
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
