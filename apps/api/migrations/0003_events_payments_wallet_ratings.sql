CREATE TYPE "public"."payment_purpose" AS ENUM('FARE', 'CANCELLATION_FEE');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('DUE', 'PAID');--> statement-breakpoint
CREATE TYPE "public"."wallet_transaction_type" AS ENUM('TOPUP', 'DEBIT');--> statement-breakpoint
CREATE TABLE "ride_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ride_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"pool_id" uuid,
	"ride_request_id" uuid,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_id" uuid,
	"actor_role" "actor_role" NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_events_exactly_one_subject" CHECK (num_nonnulls("ride_events"."pool_id", "ride_events"."ride_request_id") = 1),
	CONSTRAINT "ride_events_system_has_no_actor" CHECK (("ride_events"."actor_role" = 'SYSTEM') = ("ride_events"."actor_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passenger_id" uuid NOT NULL,
	"ride_request_id" uuid NOT NULL,
	"purpose" "payment_purpose" NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount_poisha" integer NOT NULL,
	"status" "payment_status" NOT NULL,
	"settled_in_ride_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "payments_one_per_purpose" UNIQUE("ride_request_id","purpose"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_poisha" > 0),
	CONSTRAINT "payments_paid_has_time" CHECK (("payments"."status" = 'PAID') = ("payments"."paid_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "wallet_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance_poisha" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_accounts_balance_non_negative" CHECK ("wallet_accounts"."balance_poisha" >= 0)
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "wallet_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"payment_id" uuid,
	"type" "wallet_transaction_type" NOT NULL,
	"amount_poisha" integer NOT NULL,
	"balance_after_poisha" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_transactions_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "wallet_transactions_balance_after_non_negative" CHECK ("wallet_transactions"."balance_after_poisha" >= 0),
	CONSTRAINT "wallet_transactions_sign_matches_type" CHECK (("wallet_transactions"."type" = 'TOPUP' AND "wallet_transactions"."amount_poisha" > 0 AND "wallet_transactions"."payment_id" IS NULL)
        OR ("wallet_transactions"."type" = 'DEBIT' AND "wallet_transactions"."amount_poisha" < 0 AND "wallet_transactions"."payment_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"ride_request_id" uuid PRIMARY KEY NOT NULL,
	"passenger_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"stars" smallint NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_stars_range" CHECK ("ratings"."stars" BETWEEN 1 AND 5),
	CONSTRAINT "ratings_comment_length" CHECK (char_length("ratings"."comment") <= 280)
);
--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_events" ADD CONSTRAINT "ride_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_settled_in_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("settled_in_ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_wallet_accounts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."wallet_accounts"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ride_events_ride_request_idx" ON "ride_events" USING btree ("ride_request_id","created_at");--> statement-breakpoint
CREATE INDEX "ride_events_pool_idx" ON "ride_events" USING btree ("pool_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_outstanding_by_passenger_idx" ON "payments" USING btree ("passenger_id") WHERE "payments"."status" = 'DUE';--> statement-breakpoint
CREATE INDEX "wallet_transactions_user_history_idx" ON "wallet_transactions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ratings_driver_idx" ON "ratings" USING btree ("driver_id");