-- Marketplace search & pagination support.
--
-- 1. Enable pg_trgm so we can do typo-tolerant matching on short queries
--    (e.g. "speker" -> "speaker") via a GIN trigram index on title.
-- 2. Add a `search_vector` GENERATED ALWAYS column that combines the
--    listing's title (weight A) and description (weight B). Postgres keeps
--    it in sync on INSERT/UPDATE — no triggers needed.
-- 3. GIN index on the tsvector for full-text @@ matching.
-- 4. GIN trigram index on title for ILIKE / similarity fallback.
-- 5. B-tree on listing_price so the price-sort cursor pages stay cheap.

CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint

ALTER TABLE "marketplace_listings"
  ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "marketplace_listings_search_idx"
  ON "marketplace_listings" USING gin ("search_vector");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "marketplace_listings_title_trgm_idx"
  ON "marketplace_listings" USING gin ("title" gin_trgm_ops);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "marketplace_listings_listing_price_idx"
  ON "marketplace_listings" USING btree ("listing_price");
