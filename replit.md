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

## Downstream tasks

- Task #2: Supplier network / sourcing
- Task #3: Marketplace + auth
