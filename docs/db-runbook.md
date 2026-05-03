# Database Runbook

The Reality Compiler database is a Replit-managed PostgreSQL instance.
This document covers the day-to-day operational tasks: schema changes,
backups, and recovery.

## Schema changes

We use **Drizzle migrations** as the source of truth for schema changes.
`drizzle-kit push` is allowed for local prototyping only; production never
runs `push`.

### Workflow for changing a table

1. Edit the relevant file in `lib/db/src/schema/`.
2. Generate a migration:
   ```bash
   pnpm --filter @workspace/db run generate
   ```
   This writes a new SQL file under `lib/db/migrations/`. Review it
   carefully — destructive ops (`DROP COLUMN`, `ALTER COLUMN ... TYPE`) need
   a backfill plan and should usually be split into multiple migrations
   (add new column → backfill → switch reads → drop old column).
3. Commit the schema change *and* the generated migration in the same PR.
4. CI / `scripts/post-merge.sh` will run `pnpm --filter @workspace/db run migrate`
   on deploy. Migrations are tracked in the `__drizzle_migrations` table.

### Idempotency

The initial migration (`0000_*.sql`) is hand-edited to use
`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and DO-block
guards on foreign keys. This lets it baseline a database that was
originally bootstrapped with `drizzle-kit push`. **Future migrations should
be left exactly as drizzle-kit emits them** — they always run against a
database that is guaranteed to be at the previous migration's state.

### Indexes

Every foreign key and every column that appears in a `WHERE` clause from
`artifacts/api-server/src/routes/**` is indexed. When adding a new query
path, add the matching index in the same PR. See
`lib/db/src/schema/manufacturing.ts` and `marketplace.ts` for examples.

## Soft delete

`design_sessions`, `marketplace_listings`, and `orders` carry a nullable
`deleted_at timestamptz` column. All default queries filter
`deleted_at IS NULL`. Admin tools and recovery scripts may opt back in by
omitting that filter.

To soft-delete a row in a route handler, prefer:

```ts
await db.update(table)
  .set({ deletedAt: new Date(), updatedAt: new Date() })
  .where(and(eq(table.id, id), isNull(table.deletedAt)));
```

Hard deletes are reserved for the GDPR/data-rights cron job (separate task).

## Audit log

Sensitive mutations are appended to `audit_log`:

- Listing publish / update / unpublish
- Order create and status advance
- Session delete
- Future admin actions

Use the helper:

```ts
import { recordAudit } from "@workspace/db";
await recordAudit({
  actorUserId: req.userId,
  action: "listing.unpublish",
  targetType: "marketplace_listing",
  targetId: listing.id,
  before: { status: listing.status },
  requestId: req.id,
});
```

The helper swallows write failures so an audit problem never breaks the
underlying business operation. Never put secrets or large blobs in the
`before` / `after` payloads.

## Backups & recovery

Replit Postgres provides **point-in-time recovery (PITR)** out of the box.
Daily snapshots are managed by Replit; no extra cron is required.

### Verify backups (weekly)

1. Open the database tab in the Replit workspace.
2. Confirm the most recent snapshot timestamp is < 24 hours old.
3. If a snapshot is missing for more than 48 hours, file a Replit support
   ticket immediately and pause non-essential write traffic.

### Take a manual snapshot before a risky migration

Before any migration that touches more than one table, drops a column, or
rewrites a large amount of data:

1. From the Replit Database tab, click **Create snapshot** and wait for it
   to finish.
2. Run the migration (`pnpm --filter @workspace/db run migrate`) against
   staging first if available.
3. Smoke-test the deployed app against `/readyz`, then a representative
   read path.
4. If anything is wrong, restore from the snapshot via the Replit Database
   tab → **Restore**.

### Restore from snapshot

1. Stop the API workflow to halt new writes.
2. From the Replit Database tab, choose the snapshot to restore to.
3. After the restore completes, re-run `pnpm --filter @workspace/db run migrate`
   to ensure the schema matches the deployed code.
4. Restart the API workflow and verify `/readyz` returns `ready`.
