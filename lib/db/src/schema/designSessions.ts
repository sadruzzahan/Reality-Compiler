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

export const designSessionsTable = pgTable(
  "design_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().default("system-seed"),
    title: text("title").notNull(),
    status: text("status").notNull().default("generating"),
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
    index("design_sessions_user_id_idx").on(t.userId),
    index("design_sessions_updated_at_idx").on(t.updatedAt),
    index("design_sessions_deleted_at_idx").on(t.deletedAt),
  ],
);

export const designMessagesTable = pgTable(
  "design_messages",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => designSessionsTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("design_messages_session_id_idx").on(t.sessionId)],
);

export type BomItem = {
  component: string;
  material: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
};

export type CostEstimate = {
  low: number;
  high: number;
  currency: string;
  leadTimeDays: number;
};

export const designOutputsTable = pgTable(
  "design_outputs",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => designSessionsTable.id, { onDelete: "cascade" }),
    productName: text("product_name").notNull(),
    category: text("category").notNull(),
    summary: text("summary").notNull(),
    primaryMaterial: text("primary_material").notNull(),
    materials: text("materials").array().notNull(),
    dimensions: text("dimensions").notNull(),
    weightGrams: numeric("weight_grams", { precision: 10, scale: 2 }),
    processes: text("processes").array().notNull(),
    bom: jsonb("bom").$type<BomItem[]>().notNull(),
    costEstimate: jsonb("cost_estimate").$type<CostEstimate>().notNull(),
    imageUrl: text("image_url"),
    manufacturingNotes: text("manufacturing_notes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("design_outputs_session_id_idx").on(t.sessionId)],
);

export type DesignSession = typeof designSessionsTable.$inferSelect;
export type DesignMessage = typeof designMessagesTable.$inferSelect;
export type DesignOutput = typeof designOutputsTable.$inferSelect;
