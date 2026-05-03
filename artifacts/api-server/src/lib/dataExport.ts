import { eq, and, inArray } from "@workspace/db";
import {
  db,
  designSessionsTable,
  designMessagesTable,
  designOutputsTable,
  marketplaceListingsTable,
  ordersTable,
  userProfilesTable,
} from "@workspace/db";

export interface DataExport {
  exportedAt: string;
  schemaVersion: 1;
  userId: string;
  profile: unknown;
  sessions: unknown[];
  messages: unknown[];
  outputs: unknown[];
  listings: unknown[];
  orders: unknown[];
  payouts: unknown[];
}

const REDACTED_SHIPPING = "[redacted - third-party PII]";

/**
 * Designer-side orders contain *another* user's shipping address and
 * (anonymised) buyer userId. We must not return those fields in the
 * exporting user's archive — they belong to the buyer. Redact aggressively
 * but keep the row so the designer can still reconcile the payout.
 */
function redactBuyerPii<T extends { id: number; userId: string }>(
  row: T,
): Omit<T, "shippingAddress" | "userId"> & {
  shippingAddress: typeof REDACTED_SHIPPING;
  userId: typeof REDACTED_SHIPPING;
} {
  const { shippingAddress: _ship, userId: _uid, ...rest } = row as T & {
    shippingAddress?: unknown;
  };
  return {
    ...rest,
    shippingAddress: REDACTED_SHIPPING,
    userId: REDACTED_SHIPPING,
  };
}

export async function buildUserDataExport(userId: string): Promise<DataExport> {
  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId));

  const sessions = await db
    .select()
    .from(designSessionsTable)
    .where(eq(designSessionsTable.userId, userId));

  const sessionIds = sessions.map((s) => s.id);

  const messages = sessionIds.length
    ? await db
        .select()
        .from(designMessagesTable)
        .where(inArray(designMessagesTable.sessionId, sessionIds))
    : [];

  const outputs = sessionIds.length
    ? await db
        .select()
        .from(designOutputsTable)
        .where(inArray(designOutputsTable.sessionId, sessionIds))
    : [];

  const listings = await db
    .select()
    .from(marketplaceListingsTable)
    .where(eq(marketplaceListingsTable.userId, userId));

  const buyerOrders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.userId, userId));

  // Designer-side orders are returned with buyer PII redacted — they belong
  // to the buyer, not the requesting user.
  const designerOrders = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.designerUserId, userId))!);

  const buyerIds = new Set(buyerOrders.map((o) => o.id));
  const orders: unknown[] = [
    ...buyerOrders,
    ...designerOrders
      .filter((o) => !buyerIds.has(o.id))
      .map((o) => redactBuyerPii(o)),
  ];

  // Payouts are derived from designer orders' `payoutAmount`. We keep this
  // separate so the export is self-explanatory even before the dedicated
  // payouts ledger lands in a future task.
  const payouts = designerOrders.map((o) => ({
    orderId: o.id,
    amount: Number(o.payoutAmount),
    status: o.status,
    createdAt: o.createdAt,
  }));

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    userId,
    profile: profile ?? null,
    sessions,
    messages,
    outputs,
    listings,
    orders,
    payouts,
  };
}
