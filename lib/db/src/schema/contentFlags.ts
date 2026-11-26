import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const contentFlagsTable = pgTable("content_flags", {
  id: serial("id").primaryKey(),
  contentType: text("content_type").notNull(),
  contentId: integer("content_id").notNull(),
  contentText: text("content_text"),
  reason: text("reason").notNull(),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  detectedBy: text("detected_by").notNull().default("ai"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContentFlag = typeof contentFlagsTable.$inferSelect;
