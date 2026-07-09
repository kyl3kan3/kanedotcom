CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"auth_user_id" text,
	"invited_email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'adult' NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"trip_id" uuid,
	"uploaded_by_member_id" uuid,
	"kind" text NOT NULL,
	"source" text DEFAULT 'device' NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"storage_key" text,
	"caption" text,
	"status" text DEFAULT 'selected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trip_stamps" (
	"member_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_answer" integer,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_stamps_member_id_trip_id_pk" PRIMARY KEY("member_id","trip_id")
);
--> statement-breakpoint
CREATE TABLE "trip_votes" (
	"member_id" uuid NOT NULL,
	"round_slug" text DEFAULT 'next-adventure' NOT NULL,
	"option_slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_votes_member_id_round_slug_pk" PRIMARY KEY("member_id","round_slug")
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_uploaded_by_member_id_family_members_id_fk" FOREIGN KEY ("uploaded_by_member_id") REFERENCES "public"."family_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stamps" ADD CONSTRAINT "trip_stamps_member_id_family_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."family_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stamps" ADD CONSTRAINT "trip_stamps_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_votes" ADD CONSTRAINT "trip_votes_member_id_family_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."family_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "family_members_auth_user_id_unique" ON "family_members" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_members_invited_email_unique" ON "family_members" USING btree ("invited_email");--> statement-breakpoint
CREATE INDEX "family_members_family_id_idx" ON "family_members" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "memories_family_created_idx" ON "memories" USING btree ("family_id","created_at");--> statement-breakpoint
CREATE INDEX "memories_trip_id_idx" ON "memories" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trips_family_slug_unique" ON "trips" USING btree ("family_id","slug");--> statement-breakpoint
CREATE INDEX "trips_family_sort_idx" ON "trips" USING btree ("family_id","sort_order");