import { customType, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// These four tables already exist in production and are used by legacy/raw-SQL API
// paths. Keep the declarations aligned with the live PostgreSQL types, nullability,
// defaults, foreign keys, and index names. Do not rename/drop these tables in a push.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const contentPermissionRequestsTable = pgTable(
  "content_permission_requests",
  {
    id: serial("id").primaryKey(),
    requesterId: integer("requester_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    contentId: integer("content_id").notNull(),
    requestedAction: text("requested_action").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (table) => ({
    ownerStatusIdx: index("content_permission_requests_owner_idx").on(table.ownerId, table.status),
    requesterStatusIdx: index("content_permission_requests_requester_idx").on(table.requesterId, table.status),
  }),
);

export const messageMediaTable = pgTable(
  "message_media",
  {
    storageKey: text("storage_key").primaryKey(),
    // Nullable and intentionally not declared as an FK: that matches production.
    messageId: integer("message_id"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    messageIdx: index("message_media_message_id_idx").on(table.messageId),
  }),
);

export const pushSubscriptionsTable = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    endpointUnique: uniqueIndex("push_subscriptions_endpoint_key").on(table.endpoint),
    userIdx: index("push_subscriptions_user_idx").on(table.userId),
  }),
);

export const teacherDocumentsTable = pgTable(
  "teacher_documents",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("teacher_documents_user_idx").on(table.userId),
  }),
);

export type ContentPermissionRequest = typeof contentPermissionRequestsTable.$inferSelect;
export type InsertContentPermissionRequest = typeof contentPermissionRequestsTable.$inferInsert;
export type MessageMedia = typeof messageMediaTable.$inferSelect;
export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
export type TeacherDocument = typeof teacherDocumentsTable.$inferSelect;
