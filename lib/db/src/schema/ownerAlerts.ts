import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ownerAlertsTable = pgTable("owner_alerts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("general"),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  reportedBy: integer("reported_by").references(() => usersTable.id),
  reporterName: text("reporter_name").notNull(),
  reporterRole: text("reporter_role").notNull(),
  targetType: text("target_type"),
  targetId: integer("target_id"),
  targetName: text("target_name"),
  attachmentUrl: text("attachment_url"),
  isRead: boolean("is_read").notNull().default(false),
  resolvedBy: integer("resolved_by").references(() => usersTable.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolution: text("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OwnerAlert = typeof ownerAlertsTable.$inferSelect;
