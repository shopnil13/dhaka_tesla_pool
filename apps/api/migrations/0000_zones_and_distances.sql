CREATE TABLE "zone_distances" (
	"from_zone_id" smallint NOT NULL,
	"to_zone_id" smallint NOT NULL,
	"distance_m" integer NOT NULL,
	CONSTRAINT "zone_distances_from_zone_id_to_zone_id_pk" PRIMARY KEY("from_zone_id","to_zone_id"),
	CONSTRAINT "zone_distances_distinct_zones" CHECK ("zone_distances"."from_zone_id" <> "zone_distances"."to_zone_id"),
	CONSTRAINT "zone_distances_positive" CHECK ("zone_distances"."distance_m" > 0)
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" smallint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "zones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "zones_slug_unique" UNIQUE("slug"),
	CONSTRAINT "zones_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "zone_distances" ADD CONSTRAINT "zone_distances_from_zone_id_zones_id_fk" FOREIGN KEY ("from_zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_distances" ADD CONSTRAINT "zone_distances_to_zone_id_zones_id_fk" FOREIGN KEY ("to_zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;