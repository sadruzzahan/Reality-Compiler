# Reality Compiler

Full-stack **pnpm monorepo**: users describe a physical product in plain English; the AI stack produces a **concept image**, **BOM**, **manufacturing plan**, and **cost estimate**, with **sessions**, **chat refinements**, **marketplace listings**, and **orders** persisted in PostgreSQL.

## Monorepo layout

| Path | Role |
|------|------|
| `artifacts/reality-compiler` | React 19 + Vite SPA (`dev` / `build` / `serve`). UI uses Wouter, TanStack Query via `@workspace/api-client-react`, Radix/shadcn-style components, Tailwind v4, Clerk. |
| `artifacts/api-server` | Express 5 API (`build.mjs` → `dist/index.mjs`). Routes include sessions, marketplace, orders, contact, sitemap, GDPR-style export/delete, admin purge. |
| `artifacts/mockup-sandbox` | Ancillary UI scaffold. |
| `lib/api-spec/openapi.yaml` | OpenAPI source of truth. Regenerate clients: `pnpm --filter @workspace/api-spec run codegen`. |
| `lib/api-zod`, `lib/api-client-react` | Generated Zod types and React Query hooks (Orval). |
| `lib/db` | Drizzle schema + SQL migrations. Session/marketplace/audit models; soft-delete on key entities. |
| `lib/integrations-openai-ai-server` | OpenAI via Replit AI Integrations (chat + image). |

## Root scripts (workspace)

- **`pnpm install`** — package manager is **pnpm** only (root `preinstall` enforces this).
- **`pnpm run typecheck`** — TypeScript project references + filtered artifact/script typechecks.
- **`pnpm run build`** — typecheck, then recursive `build` where defined.
- **`pnpm run db:generate`** / **`pnpm run db:migrate`** — Drizzle migration generate / apply (`@workspace/db`).

## AI pipeline (API)

- **`generateDesignSpec`** — structured JSON from the chat model (`response_format: json_object`), validated with Zod before persistence.
- **`generateConceptImageDataUrl`** — image model output stored as a base64 data URL on the design output.

## Authentication (Clerk)

- Frontend: Clerk React + themes; sign-in/sign-up under `/sign-in/*`, `/sign-up/*`.
- API: `clerkMiddleware()` + `requireAuth`; `req.userId` from session claims. Routes are split into **public** (marketing, marketplace browse, stats) vs **protected** (sessions, orders, `/api/me`, etc.) per `replit.md` / route tables in code.

## Marketplace

- Listings tie to design sessions; REST under `/api/marketplace/*` (publish by `sessionId`, profile by user, search/sort).
- Frontend: marketplace grid/detail, designer profiles, publish dialog on the session workspace.
- Seed can publish sample sessions so the marketplace is non-empty for guests.

## Privacy, compliance, and SEO (surface area in repo)

- Static legal routes (`/terms`, `/privacy`, `/acceptable-use`, `/cookies`, `/legal/dpa`, `/contact`), cookie consent helper, `GET /api/me/export`, `DELETE /api/me` (soft-delete + anonymisation patterns), optional `POST /api/admin/purge-deleted` with `ADMIN_API_TOKEN`.
- Contact may log to `audit_log` and send mail via Resend when configured.
- Per-route document head / JSON-LD hooks, `robots.txt`, dynamic `GET /api/sitemap.xml`, favicon/OG generation scripts.

## Environment variables

Typical server/runtime:

- **`DATABASE_URL`** — PostgreSQL for Drizzle.
- **`AI_INTEGRATIONS_OPENAI_BASE_URL`**, **`AI_INTEGRATIONS_OPENAI_API_KEY`** — Replit AI Integrations proxy for OpenAI.
- Clerk keys as required by `@clerk/express` / `@clerk/react`.
- Optional: `ADMIN_API_TOKEN`, Resend (`RESEND_API_KEY`, `SUPPORT_*`), storage buckets, `SITE_BASE_PATH` / `BASE_PATH` for sitemap, Stripe (root `package.json` lists `stripe`), etc. — align with your deployment and `artifacts/api-server` usage.

## Local development

```bash
pnpm install
# Configure DATABASE_URL and AI/Clerk env for api-server and reality-compiler
pnpm run db:migrate   # after DATABASE_URL is set
pnpm --filter @workspace/api-server run dev   # API (see package for port/proxy)
pnpm --filter @workspace/reality-compiler run dev   # Vite frontend
```

End-to-end tests live under `tests/e2e` (Playwright).

## License

MIT (`package.json`).
