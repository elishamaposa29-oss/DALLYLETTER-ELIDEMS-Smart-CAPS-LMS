import { pgTable, serial, integer, text, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { studyGroupsTable } from "./studyGroups";

export const lessonRequestsTable = pgTable("lesson_requests", {
  id: serial("id").primaryKey(),
  prefectId: integer("prefect_id").notNull().references(() => usersTable.id),
  teacherId: integer("teacher_id").notNull().references(() => usersTable.id),
  topic: text("topic").notNull(),
  notes: text("notes"),
  preferredDate: text("preferred_date"),
  status: text("status").notNull().default("pending"),
  teacherReply: text("teacher_reply"),
  responseAt: timestamp("response_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const groupMemberControlsTable = pgTable("group_member_controls", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => studyGroupsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  blocked: boolean("blocked").notNull().default(false),
  mediaBlocked: boolean("media_blocked").notNull().default(false),
  suspended: boolean("suspended").notNull().default(false),
  muted: boolean("muted").notNull().default(false),
  reason: text("reason"),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({ groupUserUnique: unique().on(t.groupId, t.userId) }));

export const groupSettingsTable = pgTable("group_settings", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => studyGroupsTable.id),
  rules: text("rules"),
  announcementsOnly: boolean("announcements_only").notNull().default(false),
  allowPolls: boolean("allow_polls").notNull().default(true),
  allowMedia: boolean("allow_media").notNull().default(true),
  maxMembers: integer("max_members").notNull().default(1024),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({ groupUnique: unique().on(t.groupId) }));

export const chatPollsTable = pgTable("chat_polls", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => studyGroupsTable.id),
  creatorId: integer("creator_id").notNull().references(() => usersTable.id),
  question: text("question").notNull(),
  allowMultiple: boolean("allow_multiple").notNull().default(false),
  anonymous: boolean("anonymous").notNull().default(false),
  closed: boolean("closed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatPollOptionsTable = pgTable("chat_poll_options", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => chatPollsTable.id),
  label: text("label").notNull(),
});

export const chatPollVotesTable = pgTable("chat_poll_votes", {
  id: serial("id").primaryKey(),
  pollId: integer("poll_id").notNull().references(() => chatPollsTable.id),
  optionId: integer("option_id").notNull().references(() => chatPollOptionsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ voteUnique: unique().on(t.pollId, t.optionId, t.userId) }));

export const broadcastsTable = pgTable("chat_broadcasts", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const broadcastRecipientsTable = pgTable("chat_broadcast_recipients", {
  id: serial("id").primaryKey(),
  broadcastId: integer("broadcast_id").notNull().references(() => broadcastsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
}, (t) => ({ recipientUnique: unique().on(t.broadcastId, t.userId) }));

export const communitiesTable = pgTable("chat_communities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const communityGroupsTable = pgTable("chat_community_groups", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").notNull().references(() => communitiesTable.id),
  groupId: integer("group_id").notNull().references(() => studyGroupsTable.id),
}, (t) => ({ communityGroupUnique: unique().on(t.communityId, t.groupId) }));

export const lessonRequestStatus = ["pending", "accepted", "declined", "completed", "cancelled"] as const;
