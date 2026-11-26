import { pgTable, text, serial, timestamp, integer, boolean, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const followsTable = pgTable("follows", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull().references(() => usersTable.id),
  targetType: text("target_type").notNull(), // teacher | prefect | manager | event | subject
  targetUserId: integer("target_user_id").references(() => usersTable.id),
  targetKey: text("target_key"),
  targetName: text("target_name").notNull(),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  followerTarget: unique("follows_follower_target_unique").on(table.followerId, table.targetType, table.targetUserId, table.targetKey),
}));

export const notificationPreferencesTable = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id),
  pushEnabled: boolean("push_enabled").notNull().default(true),
  soundEnabled: boolean("sound_enabled").notNull().default(true),
  followNotificationsEnabled: boolean("follow_notifications_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const contentCommentsTable = pgTable("content_comments", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull().references(() => usersTable.id),
  contentType: text("content_type").notNull(), // lesson | exercise | assignment | activity
  contentId: integer("content_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const moderationActionsTable = pgTable("moderation_actions", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").notNull().references(() => usersTable.id),
  targetUserId: integer("target_user_id").notNull().references(() => usersTable.id),
  action: text("action").notNull(), // block | suspend | promote_prefect | warn | comment
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
