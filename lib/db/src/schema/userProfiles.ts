import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

export const userProfilesTable = pgTable(
  "user_profiles",
  {
    userId: text("user_id").primaryKey(),
    displayName: text("display_name"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    // Stripe Customer (buyer side). Created lazily on first checkout so we
    // can attach receipts and reuse saved payment methods on Stripe's side.
    stripeCustomerId: text("stripe_customer_id"),
    // Stripe Connect Express (seller side). Created when the designer
    // clicks "Connect payouts" in My Profile and onboards via Stripe.
    stripeAccountId: text("stripe_account_id"),
    // Mirror of Stripe's onboarding state: 'pending' (link emitted but the
    // designer hasn't finished onboarding), 'restricted' (account exists but
    // payouts/charges aren't fully enabled — e.g. waiting on docs), or
    // 'enabled' (charges_enabled && payouts_enabled). NULL means we have
    // never created a Connect account for this user.
    stripeAccountStatus: text("stripe_account_status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // Soft-delete marker for GDPR/CCPA "delete my account" requests. A
    // background job purges objects and hard-deletes affected rows after a
    // 30-day grace window.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("user_profiles_deleted_at_idx").on(t.deletedAt)],
);

export type UserProfile = typeof userProfilesTable.$inferSelect;
