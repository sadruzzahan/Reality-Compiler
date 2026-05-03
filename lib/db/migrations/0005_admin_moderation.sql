CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reporter_user_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "admin_notes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "suspended_by" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "suspension_reason" text;--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_user_id");--> statement-breakpoint
CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_profiles_suspended_at_idx" ON "user_profiles" USING btree ("suspended_at");