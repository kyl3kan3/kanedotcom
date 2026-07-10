import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const families = pgTable("families", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const familyMembers = pgTable(
  "family_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    authUserId: text("auth_user_id"),
    invitedEmail: text("invited_email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["owner", "adult", "child"] })
      .default("adult")
      .notNull(),
    isActive: integer("is_active").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("family_members_auth_user_id_unique").on(table.authUserId),
    uniqueIndex("family_members_invited_email_unique").on(table.invitedEmail),
    index("family_members_family_id_idx").on(table.familyId),
  ],
);
export const trips = pgTable(
  "trips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    source: text("source", { enum: ["manual", "ai"] })
      .default("manual")
      .notNull(),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("trips_family_slug_unique").on(table.familyId, table.slug),
    index("trips_family_sort_idx").on(table.familyId, table.sortOrder),
  ],
);

export const tripStamps = pgTable(
  "trip_stamps",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    attempts: integer("attempts").default(0).notNull(),
    lastAnswer: integer("last_answer"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.memberId, table.tripId] })],
);

export const tripVotes = pgTable(
  "trip_votes",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    roundSlug: text("round_slug").default("next-adventure").notNull(),
    optionSlug: text("option_slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.memberId, table.roundSlug] })],
);

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "set null" }),
    uploadedByMemberId: uuid("uploaded_by_member_id").references(
      () => familyMembers.id,
      { onDelete: "set null" },
    ),
    kind: text("kind", { enum: ["image", "video"] }).notNull(),
    source: text("source", { enum: ["device", "google_photos", "demo"] })
      .default("device")
      .notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sourceMediaId: text("source_media_id"),
    storageKey: text("storage_key"),
    caption: text("caption"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    captureTimeSource: text("capture_time_source", {
      enum: ["google", "exif", "file", "import"],
    }),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    cameraMake: text("camera_make"),
    cameraModel: text("camera_model"),
    sourceMetadata: jsonb("source_metadata").$type<Record<string, unknown>>(),
    metadataStatus: text("metadata_status", {
      enum: ["pending", "ready", "unavailable", "failed"],
    })
      .default("pending")
      .notNull(),
    status: text("status", { enum: ["selected", "uploading", "ready", "failed"] })
      .default("selected")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("memories_family_created_idx").on(table.familyId, table.createdAt),
    index("memories_family_captured_idx").on(table.familyId, table.capturedAt),
    index("memories_trip_id_idx").on(table.tripId),
    uniqueIndex("memories_family_source_media_unique")
      .on(table.familyId, table.source, table.sourceMediaId)
      .where(sql`${table.sourceMediaId} is not null and ${table.deletedAt} is null`),
  ],
);

export const tripDrafts = pgTable(
  "trip_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id").notNull(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    createdByMemberId: uuid("created_by_member_id").references(
      () => familyMembers.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    status: text("status", { enum: ["draft", "approved", "rejected"] })
      .default("draft")
      .notNull(),
    aiModel: text("ai_model").notNull(),
    approvedTripId: uuid("approved_trip_id").references(() => trips.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("trip_drafts_family_status_created_idx").on(
      table.familyId,
      table.status,
      table.createdAt,
    ),
    index("trip_drafts_run_id_idx").on(table.runId),
  ],
);

export const tripDraftMemories = pgTable(
  "trip_draft_memories",
  {
    draftId: uuid("draft_id")
      .notNull()
      .references(() => tripDrafts.id, { onDelete: "cascade" }),
    memoryId: uuid("memory_id")
      .notNull()
      .references(() => memories.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    caption: text("caption").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.memoryId] }),
    index("trip_draft_memories_memory_id_idx").on(table.memoryId),
  ],
);
