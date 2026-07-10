CREATE TABLE "trip_draft_memories" (
	"draft_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"caption" text NOT NULL,
	CONSTRAINT "trip_draft_memories_draft_id_memory_id_pk" PRIMARY KEY("draft_id","memory_id")
);
--> statement-breakpoint
CREATE TABLE "trip_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"created_by_member_id" uuid,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"ai_model" text NOT NULL,
	"approved_trip_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "camera_make" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "camera_model" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "source_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "metadata_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trip_draft_memories" ADD CONSTRAINT "trip_draft_memories_draft_id_trip_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."trip_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_draft_memories" ADD CONSTRAINT "trip_draft_memories_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_drafts" ADD CONSTRAINT "trip_drafts_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_drafts" ADD CONSTRAINT "trip_drafts_created_by_member_id_family_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."family_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_drafts" ADD CONSTRAINT "trip_drafts_approved_trip_id_trips_id_fk" FOREIGN KEY ("approved_trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_draft_memories_memory_id_idx" ON "trip_draft_memories" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "trip_drafts_family_status_created_idx" ON "trip_drafts" USING btree ("family_id","status","created_at");--> statement-breakpoint
CREATE INDEX "trip_drafts_run_id_idx" ON "trip_drafts" USING btree ("run_id");