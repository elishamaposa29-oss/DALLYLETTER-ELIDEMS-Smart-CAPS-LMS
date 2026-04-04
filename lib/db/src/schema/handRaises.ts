import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { classesTable } from "./classes";

// Hand raises — students raise hands during live classes
export const handRaisesTable = pgTable("hand_raises", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id),
  studentName: text("student_name").notNull(),
  classId: integer("class_id").notNull().references(() => classesTable.id),
  question: text("question"),
  isResolved: boolean("is_resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertHandRaiseSchema = createInsertSchema(handRaisesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertHandRaise = z.infer<typeof insertHandRaiseSchema>;
export type HandRaise = typeof handRaisesTable.$inferSelect;
