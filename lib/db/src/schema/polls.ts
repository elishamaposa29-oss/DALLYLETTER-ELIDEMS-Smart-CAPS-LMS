import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const pollsTable = pgTable("polls", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  topic: text("topic"),
  type: text("type").notNull().default("manual"),
  grade: text("grade"),
  subject: text("subject"),
  mode: text("mode").notNull().default("practice"),
  timerSeconds: integer("timer_seconds"),
  status: text("status").notNull().default("draft"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pollQuestionsTable = pgTable("poll_questions", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").references(() => pollsTable.id, { onDelete: "cascade" }).notNull(),
  question: text("question").notNull(),
  difficulty: text("difficulty").default("medium"),
  explanation: text("explanation"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pollOptionsTable = pgTable("poll_options", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").references(() => pollQuestionsTable.id, { onDelete: "cascade" }).notNull(),
  text: text("text").notNull(),
  isCorrect: boolean("is_correct").notNull().default(false),
});

export const pollSubmissionsTable = pgTable("poll_submissions", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").references(() => pollsTable.id, { onDelete: "cascade" }).notNull(),
  studentId: integer("student_id").references(() => usersTable.id, { onDelete: "cascade" }).notNull(),
  answers: text("answers").notNull().default("[]"),
  score: integer("score").notNull().default(0),
  totalQuestions: integer("total_questions").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Poll = typeof pollsTable.$inferSelect;
export type PollQuestion = typeof pollQuestionsTable.$inferSelect;
export type PollOption = typeof pollOptionsTable.$inferSelect;
export type PollSubmission = typeof pollSubmissionsTable.$inferSelect;
