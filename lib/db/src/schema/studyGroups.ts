import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Study groups table
export const studyGroupsTable = pgTable("study_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  creatorId: integer("creator_id").notNull().references(() => usersTable.id),
  creatorName: text("creator_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Study group members junction table
export const studyGroupMembersTable = pgTable("study_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => studyGroupsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStudyGroupSchema = createInsertSchema(studyGroupsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStudyGroup = z.infer<typeof insertStudyGroupSchema>;
export type StudyGroup = typeof studyGroupsTable.$inferSelect;
