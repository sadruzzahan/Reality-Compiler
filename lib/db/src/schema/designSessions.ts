import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";

export const designSessionsTable = pgTable("design_sessions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("generating"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const designMessagesTable = pgTable("design_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => designSessionsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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

export const designOutputsTable = pgTable("design_outputs", {
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
});

export type DesignSession = typeof designSessionsTable.$inferSelect;
export type DesignMessage = typeof designMessagesTable.$inferSelect;
export type DesignOutput = typeof designOutputsTable.$inferSelect;
