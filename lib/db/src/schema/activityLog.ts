import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Activity log — tracks platform-wide activity for dashboard feed
export const activityLogTable = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  // Type: lesson_added, class_scheduled, payment_recorded, user_joined, message_sent, hand_raised
  type: text("type").notNull(),
  description: text("description").notNull(),
  actorName: text("actor_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogTable).omit({
  id: true,
  createdAt: true,
});
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogTable.$inferSelect;
