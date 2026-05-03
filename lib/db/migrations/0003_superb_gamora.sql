ALTER TABLE "orders" ADD COLUMN "stripe_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_charge_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_status" text DEFAULT 'pending_payment' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "stripe_account_status" text;--> statement-breakpoint
CREATE INDEX "orders_payment_status_idx" ON "orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "orders_stripe_checkout_session_id_idx" ON "orders" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX "orders_stripe_payment_intent_id_idx" ON "orders" USING btree ("stripe_payment_intent_id");