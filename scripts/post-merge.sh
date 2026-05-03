#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Apply any pending Drizzle migrations against $DATABASE_URL. This replaces
# the previous `drizzle-kit push`, which could silently DROP columns. The
# initial migration is idempotent so it is safe to run against a database
# that was originally bootstrapped with push.
pnpm --filter @workspace/db run migrate
