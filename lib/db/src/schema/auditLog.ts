import {
  pgTable,
  bigserial,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

/**
 * Append-only audit log for sensitive mutations: listing publish/unpublish,
 * order status transitions, admin actions, and any future write triggered
 * by a privileged operator.
 *
 * `before` / `after` are optional JSON blobs of the relevant entity state;
 * keep them small and never include secrets or PII beyond what is already in
 * the row being audited.
 */
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_target_idx").on(t.targetType, t.targetId),
    index("audit_log_actor_idx").on(t.actorUserId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);

export type AuditLogRow = typeof auditLogTable.$inferSelect;
