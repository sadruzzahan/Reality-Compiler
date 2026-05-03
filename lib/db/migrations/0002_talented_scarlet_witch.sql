ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_profiles_deleted_at_idx" ON "user_profiles" USING btree ("deleted_at");
