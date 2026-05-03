import {
  pgTable,
  serial,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * User-submitted abuse / IP / fraud reports. Filed against a listing or
 * designer (extensible to orders later) and triaged via the admin
 * console. Resolution always lands in the audit log.
 */
export const reportsTable = pgTable(
  "reports",
  {
    id: serial("id").primaryKey(),
    reporterUserId: text("reporter_user_id").notNull(),
    // 'listing' | 'designer' | 'order'
    targetType: text("target_type").notNull(),
    /** String form of the target id so we can point at numeric or text ids. */
    targetId: text("target_id").notNull(),
    /**
     * Coarse category — kept loosely-typed at the DB layer so we can grow
     * the list without a migration. Validated against the API zod enum
     * at the edge.
     */
    reason: text("reason").notNull(),
    /** Free-form context from the reporter. */
    notes: text("notes"),
    /** 'open' | 'reviewing' | 'resolved' | 'dismissed' */
    status: text("status").notNull().default("open"),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** Admin's note on how the report was resolved. */
    resolutionNotes: text("resolution_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("reports_status_idx").on(t.status),
    index("reports_target_idx").on(t.targetType, t.targetId),
    index("reports_reporter_idx").on(t.reporterUserId),
    index("reports_created_at_idx").on(t.createdAt),
  ],
);

export type Report = typeof reportsTable.$inferSelect;
