import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Notifications table — platform notifications
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  // recipientId = null means broadcast to all
  recipientId: integer("recipient_id"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  // Type: payment_overdue, new_lesson, class_starting, system, general
  type: text("type").notNull().default("general"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
