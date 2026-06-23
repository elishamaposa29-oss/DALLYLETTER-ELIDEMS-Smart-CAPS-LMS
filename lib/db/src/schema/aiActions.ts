import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const aiActionsTable = pgTable("ai_actions", {
  id: serial("id").primaryKey(),
  command: text("command").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: integer("target_id"),
  performedBy: integer("performed_by").references(() => usersTable.id).notNull(),
  result: text("result"),
  isReversed: boolean("is_reversed").notNull().default(false),
  reversedBy: integer("reversed_by").references(() => usersTable.id),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AIAction = typeof aiActionsTable.$inferSelect;
