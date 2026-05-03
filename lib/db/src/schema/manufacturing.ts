import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { designSessionsTable } from "./designSessions";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  country: text("country").notNull(),
  capabilities: text("capabilities").array().notNull(),
  materials: text("materials").array().notNull(),
  certifications: text("certifications").array().notNull(),
  leadTimeMinDays: integer("lead_time_min_days").notNull(),
  leadTimeMaxDays: integer("lead_time_max_days").notNull(),
  pricingMultiplier: numeric("pricing_multiplier", {
    precision: 4,
    scale: 2,
  }).notNull(),
  setupFee: numeric("setup_fee", { precision: 10, scale: 2 }).notNull(),
  rating: numeric("rating", { precision: 3, scale: 2 }).notNull(),
  capacityLevel: text("capacity_level").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ProcessBreakdownItem = {
  process: string;
  description: string;
  cost: number;
};

export type QuoteScoreFactors = {
  processMatch: number;
  materialMatch: number;
  leadTime: number;
  rating: number;
  total: number;
};

export const quotesTable = pgTable(
  "quotes",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => designSessionsTable.id, { onDelete: "cascade" }),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliersTable.id, { onDelete: "cascade" }),
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
    setupFee: numeric("setup_fee", { precision: 12, scale: 2 }).notNull(),
    totalCost: numeric("total_cost", { precision: 12, scale: 2 }).notNull(),
    leadTimeDays: integer("lead_time_days").notNull(),
    processBreakdown: jsonb("process_breakdown")
      .$type<ProcessBreakdownItem[]>()
      .notNull(),
    scoreFactors: jsonb("score_factors").$type<QuoteScoreFactors>().notNull(),
    rank: integer("rank").notNull(),
    notes: text("notes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("quotes_session_id_idx").on(t.sessionId),
    index("quotes_supplier_id_idx").on(t.supplierId),
  ],
);

// `orders.quote_id` FK index is declared in the orders table below.

export type ShippingAddress = {
  recipient: string;
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type OrderStatus =
  | "queued"
  | "in_production"
  | "quality_check"
  | "shipped"
  | "delivered";

export type OrderStatusEvent = {
  status: OrderStatus;
  note: string;
  at: string;
};

export type AdminOrderNote = {
  /** Clerk userId of the admin who left the note. */
  by: string;
  /** ISO-8601 timestamp. */
  at: string;
  /** Free-form note text (max 2000 chars enforced at the API layer). */
  text: string;
};

export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().default("system-seed"),
    marketplaceListingId: integer("marketplace_listing_id"),
    quoteId: integer("quote_id")
      .notNull()
      .references(() => quotesTable.id, { onDelete: "restrict" }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => designSessionsTable.id, { onDelete: "cascade" }),
    supplierId: integer("supplier_id")
      .notNull()
      .references(() => suppliersTable.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    totalCost: numeric("total_cost", { precision: 12, scale: 2 }).notNull(),
    designerUserId: text("designer_user_id"),
    payoutAmount: numeric("payout_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    leadTimeDays: integer("lead_time_days").notNull(),
    shippingAddress: jsonb("shipping_address").$type<ShippingAddress>().notNull(),
    status: text("status").notNull().default("queued"),
    statusHistory: jsonb("status_history")
      .$type<OrderStatusEvent[]>()
      .notNull()
      .default([]),
    // Stripe Checkout / Payment lifecycle. `paymentStatus` is the source of
    // truth for whether the buyer has paid; `status` (queued/in_production/...)
    // only advances after payment_status === 'paid'. `refundedAmount` is in
    // dollars and is incremented by the charge.refunded webhook.
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeChargeId: text("stripe_charge_id"),
    paymentStatus: text("payment_status").notNull().default("pending_payment"),
    refundedAmount: numeric("refunded_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    /**
     * Free-form notes left by admins on the order (refund context, support
     * conversation summaries, etc). Append-only from the UI but technically
     * a JSONB array so future shape tweaks don't need a migration.
     */
    adminNotes: jsonb("admin_notes")
      .$type<AdminOrderNote[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
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
    index("orders_user_id_idx").on(t.userId),
    index("orders_designer_user_id_idx").on(t.designerUserId),
    index("orders_marketplace_listing_id_idx").on(t.marketplaceListingId),
    index("orders_session_id_idx").on(t.sessionId),
    index("orders_supplier_id_idx").on(t.supplierId),
    index("orders_quote_id_idx").on(t.quoteId),
    index("orders_status_idx").on(t.status),
    index("orders_payment_status_idx").on(t.paymentStatus),
    index("orders_stripe_checkout_session_id_idx").on(
      t.stripeCheckoutSessionId,
    ),
    index("orders_stripe_payment_intent_id_idx").on(t.stripePaymentIntentId),
    index("orders_deleted_at_idx").on(t.deletedAt),
    index("orders_created_at_idx").on(t.createdAt),
  ],
);

export type PaymentStatus =
  | "pending_payment"
  | "paid"
  | "failed"
  | "refunded"
  | "partially_refunded";

export type Supplier = typeof suppliersTable.$inferSelect;
export type Quote = typeof quotesTable.$inferSelect;
export type Order = typeof ordersTable.$inferSelect;
