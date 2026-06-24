import { pgTable, text, serial, timestamp, integer, boolean, numeric } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const assignmentsTable = pgTable("assignments", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  grade: text("grade"),
  dueDate: text("due_date").notNull(),
  totalMarks: integer("total_marks").notNull().default(100),
  teacherId: integer("teacher_id").references(() => usersTable.id),
  teacherName: text("teacher_name").notNull(),
  status: text("status").notNull().default("active"),
  attachmentUrl: text("attachment_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const assignmentSubmissionsTable = pgTable("assignment_submissions", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => assignmentsTable.id),
  studentId: integer("student_id").notNull().references(() => usersTable.id),
  studentName: text("student_name").notNull(),
  content: text("content"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  status: text("status").notNull().default("submitted"),
  marks: numeric("marks", { precision: 5, scale: 2 }),
  feedback: text("feedback"),
  gradedBy: integer("graded_by").references(() => usersTable.id),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  gradedAt: timestamp("graded_at", { withTimezone: true }),
});

export type Assignment = typeof assignmentsTable.$inferSelect;
export type AssignmentSubmission = typeof assignmentSubmissionsTable.$inferSelect;
