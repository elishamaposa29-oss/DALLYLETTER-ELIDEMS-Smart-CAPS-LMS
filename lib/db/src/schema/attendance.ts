import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { classesTable } from "./classes";

export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  classId: integer("class_id").notNull().references(() => classesTable.id),
  studentId: integer("student_id").notNull().references(() => usersTable.id),
  studentName: text("student_name").notNull(),
  status: text("status").notNull().default("present"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  leftAt: timestamp("left_at", { withTimezone: true }),
  durationMinutes: integer("duration_minutes"),
  isLate: boolean("is_late").notNull().default(false),
  notes: text("notes"),
});

export type Attendance = typeof attendanceTable.$inferSelect;
