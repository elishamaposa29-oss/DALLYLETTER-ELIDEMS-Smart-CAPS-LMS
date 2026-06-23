import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  category: text("category").notNull().default("system"),
  performedBy: integer("performed_by").references(() => usersTable.id).notNull(),
  targetType: text("target_type"),
  targetId: integer("target_id"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
