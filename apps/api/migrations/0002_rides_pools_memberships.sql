CREATE TYPE "public"."actor_role" AS ENUM('PASSENGER', 'DRIVER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."membership_left_reason" AS ENUM('PASSENGER_CANCELLED', 'DRIVER_CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'TESLAPAY');--> statement-breakpoint
CREATE TYPE "public"."pool_status" AS ENUM('ACCEPTED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."ride_status" AS ENUM('REQUESTED', 'MATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "pool_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pool_id" uuid NOT NULL,
	"ride_request_id" uuid NOT NULL,
	"seats" smallint NOT NULL,
	"dropoff_order" smallint,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"left_reason" "membership_left_reason",
	CONSTRAINT "pool_memberships_seats_positive" CHECK ("pool_memberships"."seats" >= 1),
	CONSTRAINT "pool_memberships_left_consistent" CHECK (("pool_memberships"."left_at" IS NULL) = ("pool_memberships"."left_reason" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"pickup_zone_id" smallint NOT NULL,
	"is_shared" boolean NOT NULL,
	"capacity" smallint NOT NULL,
	"seats_taken" smallint DEFAULT 0 NOT NULL,
	"status" "pool_status" DEFAULT 'ACCEPTED' NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"arrived_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "pools_capacity_range" CHECK ("pools"."capacity" BETWEEN 1 AND 6),
	CONSTRAINT "pools_seats_within_capacity" CHECK ("pools"."seats_taken" BETWEEN 0 AND "pools"."capacity")
);
--> statement-breakpoint
CREATE TABLE "ride_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passenger_id" uuid NOT NULL,
	"pickup_zone_id" smallint NOT NULL,
	"dropoff_zone_id" smallint NOT NULL,
	"seats" smallint NOT NULL,
	"wants_share" boolean NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"status" "ride_status" DEFAULT 'REQUESTED' NOT NULL,
	"direct_distance_m" integer NOT NULL,
	"quoted_fare_poisha" integer NOT NULL,
	"final_fare_poisha" integer,
	"fare_breakdown" jsonb,
	"cancellation_fee_poisha" integer DEFAULT 0 NOT NULL,
	"cancelled_by" "actor_role",
	"cancel_reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"matched_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "ride_requests_seats_range" CHECK ("ride_requests"."seats" BETWEEN 1 AND 6),
	CONSTRAINT "ride_requests_distinct_zones" CHECK ("ride_requests"."pickup_zone_id" <> "ride_requests"."dropoff_zone_id"),
	CONSTRAINT "ride_requests_distance_positive" CHECK ("ride_requests"."direct_distance_m" > 0),
	CONSTRAINT "ride_requests_quote_positive" CHECK ("ride_requests"."quoted_fare_poisha" > 0),
	CONSTRAINT "ride_requests_final_within_quote" CHECK ("ride_requests"."final_fare_poisha" IS NULL OR "ride_requests"."final_fare_poisha" BETWEEN 1 AND "ride_requests"."quoted_fare_poisha"),
	CONSTRAINT "ride_requests_fee_non_negative" CHECK ("ride_requests"."cancellation_fee_poisha" >= 0),
	CONSTRAINT "ride_requests_completed_has_fare" CHECK ("ride_requests"."status" <> 'COMPLETED' OR ("ride_requests"."final_fare_poisha" IS NOT NULL AND "ride_requests"."completed_at" IS NOT NULL)),
	CONSTRAINT "ride_requests_cancelled_has_actor" CHECK ("ride_requests"."status" <> 'CANCELLED' OR ("ride_requests"."cancelled_at" IS NOT NULL AND "ride_requests"."cancelled_by" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "pool_memberships" ADD CONSTRAINT "pool_memberships_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_memberships" ADD CONSTRAINT "pool_memberships_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pools" ADD CONSTRAINT "pools_pickup_zone_id_zones_id_fk" FOREIGN KEY ("pickup_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pickup_zone_id_zones_id_fk" FOREIGN KEY ("pickup_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_dropoff_zone_id_zones_id_fk" FOREIGN KEY ("dropoff_zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pool_memberships_one_active_per_request" ON "pool_memberships" USING btree ("ride_request_id") WHERE "pool_memberships"."left_at" IS NULL;--> statement-breakpoint
CREATE INDEX "pool_memberships_pool_idx" ON "pool_memberships" USING btree ("pool_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pools_one_active_per_driver" ON "pools" USING btree ("driver_id") WHERE "pools"."status" IN ('ACCEPTED', 'DRIVER_ARRIVED', 'STARTED');--> statement-breakpoint
CREATE INDEX "pools_joinable_by_pickup_idx" ON "pools" USING btree ("pickup_zone_id","accepted_at") WHERE "pools"."status" = 'ACCEPTED' AND "pools"."is_shared";--> statement-breakpoint
CREATE INDEX "pools_driver_history_idx" ON "pools" USING btree ("driver_id","accepted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "ride_requests_one_active_per_passenger" ON "ride_requests" USING btree ("passenger_id") WHERE "ride_requests"."status" IN ('REQUESTED', 'MATCHED', 'IN_PROGRESS');--> statement-breakpoint
CREATE INDEX "ride_requests_waiting_by_pickup_idx" ON "ride_requests" USING btree ("pickup_zone_id","requested_at") WHERE "ride_requests"."status" = 'REQUESTED';--> statement-breakpoint
CREATE INDEX "ride_requests_passenger_history_idx" ON "ride_requests" USING btree ("passenger_id","requested_at" DESC NULLS LAST);