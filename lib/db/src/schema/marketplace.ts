import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { designSessionsTable } from "./designSessions";

export const marketplaceListingsTable = pgTable(
  "marketplace_listings",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .unique()
      .references(() => designSessionsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    creatorHandle: text("creator_handle").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    listingPrice: numeric("listing_price", { precision: 12, scale: 2 }).notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("marketplace_listings_user_id_idx").on(t.userId),
    index("marketplace_listings_status_idx").on(t.status),
    index("marketplace_listings_category_idx").on(t.category),
    index("marketplace_listings_deleted_at_idx").on(t.deletedAt),
    index("marketplace_listings_created_at_idx").on(t.createdAt),
    // Keyset pagination indexes used by the marketplace search query.
    index("marketplace_listings_listing_price_idx").on(t.listingPrice),
    // Search support: tsvector generated column + GIN index, plus a
    // pg_trgm index on title for typo-tolerant short-query matching.
    // The actual generated column / extension creation is in migration
    // 0004 because Drizzle's pgTable doesn't model GENERATED ALWAYS AS
    // tsvector columns; these index annotations exist primarily so
    // future readers know the columns are intentionally there.
    index("marketplace_listings_search_idx")
      .using("gin", sql`"search_vector"`),
    index("marketplace_listings_title_trgm_idx")
      .using("gin", sql`"title" gin_trgm_ops`),
  ],
);

export type MarketplaceListing =
  typeof marketplaceListingsTable.$inferSelect;
