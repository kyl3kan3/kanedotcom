ALTER TABLE "memories" ADD COLUMN "source_media_id" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "capture_time_source" text;--> statement-breakpoint
ALTER TABLE "memories" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "memories_family_source_media_unique" ON "memories" USING btree ("family_id","source","source_media_id") WHERE "memories"."source_media_id" is not null and "memories"."deleted_at" is null;