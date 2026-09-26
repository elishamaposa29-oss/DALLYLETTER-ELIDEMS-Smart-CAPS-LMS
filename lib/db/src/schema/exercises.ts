import { pgTable, text, serial, timestamp, integer, boolean, numeric, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { lessonsTable } from "./lessons";
import { usersTable } from "./users";

export const exercisesTable = pgTable(
  "exercises",
  {
    id: serial("id").primaryKey(),
    lessonId: integer("lesson_id").notNull().references(() => lessonsTable.id, { onDelete: "cascade" }),
    createdBy: integer("created_by").notNull().references(() => usersTable.id),
    title: text("title").notNull(),
    instructions: text("instructions"),
    status: text("status").notNull().default("draft"),
    grade: text("grade"),
    stream: text("stream"),
    layout: jsonb("layout").$type<Record<string, unknown>>().notNull().default({ version: 1, page: "book" }),
    totalMarks: numeric("total_marks", { precision: 8, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [index("exercises_lesson_idx").on(table.lessonId), index("exercises_status_idx").on(table.status)],
);

export const exerciseQuestionsTable = pgTable(
  "exercise_questions",
  {
    id: serial("id").primaryKey(),
    exerciseId: integer("exercise_id").notNull().references(() => exercisesTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    prompt: text("prompt").notNull(),
    type: text("type").notNull().default("input"),
    marksAllocated: numeric("marks_allocated", { precision: 8, scale: 2 }).notNull().default("1"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("exercise_questions_exercise_idx").on(table.exerciseId)],
);

export const exerciseOptionsTable = pgTable(
  "exercise_options",
  {
    id: serial("id").primaryKey(),
    questionId: integer("question_id").notNull().references(() => exerciseQuestionsTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
    position: integer("position").notNull().default(0),
    isCorrect: boolean("is_correct").notNull().default(false),
  },
  (table) => [index("exercise_options_question_idx").on(table.questionId)],
);

export const exerciseSubmissionsTable = pgTable(
  "exercise_submissions",
  {
    id: serial("id").primaryKey(),
    exerciseId: integer("exercise_id").notNull().references(() => exercisesTable.id, { onDelete: "cascade" }),
    learnerId: integer("learner_id").notNull().references(() => usersTable.id),
    status: text("status").notNull().default("submitted"),
    totalScore: numeric("total_score", { precision: 8, scale: 2 }).notNull().default("0"),
    percentage: numeric("percentage", { precision: 6, scale: 2 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    markedAt: timestamp("marked_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("exercise_submission_once_idx").on(table.exerciseId, table.learnerId), index("exercise_submissions_exercise_idx").on(table.exerciseId)],
);

export const exerciseAnswersTable = pgTable(
  "exercise_answers",
  {
    id: serial("id").primaryKey(),
    submissionId: integer("submission_id").notNull().references(() => exerciseSubmissionsTable.id, { onDelete: "cascade" }),
    questionId: integer("question_id").notNull().references(() => exerciseQuestionsTable.id, { onDelete: "cascade" }),
    textAnswer: text("text_answer"),
    selectedValue: text("selected_value"),
    drawData: jsonb("draw_data").$type<Record<string, unknown> | null>(),
    mediaReference: text("media_reference"),
    awardedMarks: numeric("awarded_marks", { precision: 8, scale: 2 }).notNull().default("0"),
    correctionNotes: text("correction_notes"),
    markedBy: integer("marked_by").references(() => usersTable.id),
    markedAt: timestamp("marked_at", { withTimezone: true }),
  },
  (table) => [index("exercise_answers_submission_idx").on(table.submissionId), uniqueIndex("exercise_answer_question_idx").on(table.submissionId, table.questionId)],
);

export const exerciseMediaTable = pgTable(
  "exercise_media",
  {
    id: serial("id").primaryKey(),
    exerciseId: integer("exercise_id").references(() => exercisesTable.id, { onDelete: "cascade" }),
    questionId: integer("question_id").references(() => exerciseQuestionsTable.id, { onDelete: "cascade" }),
    answerId: integer("answer_id").references(() => exerciseAnswersTable.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    storageKey: text("storage_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("exercise_media_exercise_idx").on(table.exerciseId), index("exercise_media_question_idx").on(table.questionId), index("exercise_media_answer_idx").on(table.answerId)],
);

export type Exercise = typeof exercisesTable.$inferSelect;
export type ExerciseQuestion = typeof exerciseQuestionsTable.$inferSelect;
export type ExerciseOption = typeof exerciseOptionsTable.$inferSelect;
export type ExerciseSubmission = typeof exerciseSubmissionsTable.$inferSelect;
export type ExerciseAnswer = typeof exerciseAnswersTable.$inferSelect;
export type ExerciseMedia = typeof exerciseMediaTable.$inferSelect;
