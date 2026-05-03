import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

export const userProfilesTable = pgTable(
  "user_profiles",
  {
    userId: text("user_id").primaryKey(),
    displayName: text("display_name"),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
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
