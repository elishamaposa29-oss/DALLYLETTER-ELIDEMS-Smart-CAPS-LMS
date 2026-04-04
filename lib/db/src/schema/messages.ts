import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Messages table — stores group and private messages including voice notes
export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  senderName: text("sender_name").notNull(),
  senderRole: text("sender_role").notNull(),
  content: text("content").notNull(),
  // Type: text or voice
  type: text("type").notNull().default("text"),
  mediaUrl: text("media_url"),
  // groupId = null means private message
  groupId: integer("group_id"),
  // recipientId = null means group message
  recipientId: integer("recipient_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
