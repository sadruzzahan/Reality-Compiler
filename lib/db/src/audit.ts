import { db } from "./index";
import { auditLogTable } from "./schema/auditLog";

export type AuditAction =
  | "listing.publish"
  | "listing.update"
  | "listing.unpublish"
  | "order.create"
  | "order.advance"
  | "order.cancel"
  | "session.delete"
  | "admin.action"
  // Admin moderation actions (task #15). All admin.* actions carry the
  // acting admin's Clerk userId in `actorUserId`.
  | "admin.listing.hide"
  | "admin.listing.restore"
  | "admin.listing.remove"
  | "admin.order.note"
  | "admin.order.refund_initiated"
  | "admin.user.suspend"
  | "admin.user.unsuspend"
  | "admin.report.create"
  | "admin.report.update";

export type AuditTargetType =
  | "marketplace_listing"
  | "order"
  | "design_session"
  | "user"
  | "report";

export interface RecordAuditInput {
  actorUserId: string | null;
  action: AuditAction | string;
  targetType: AuditTargetType | string;
  targetId: string | number;
  before?: unknown;
  after?: unknown;
  requestId?: string | null;
}

/**
 * Append a row to the audit log. Best-effort — failures are swallowed and
 * logged via `console.error` so an audit-write failure never breaks the
 * underlying business operation. Callers should still pass in clean,
 * non-secret payloads.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    await db.insert(auditLogTable).values({
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: String(input.targetId),
      before: (input.before as object | null) ?? null,
      after: (input.after as object | null) ?? null,
      requestId: input.requestId ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to record audit row", {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      err,
    });
  }
}
