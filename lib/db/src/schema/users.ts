import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("student"),
  isPrefect: boolean("is_prefect").notNull().default(false),
  isManager: boolean("is_manager").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  phone: text("phone"),
  grade: text("grade"),
  subject: text("subject"),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  lastPaymentDate: text("last_payment_date"),
  paymentInfo: text("payment_info"),
  performanceScore: integer("performance_score").notNull().default(0),
  badgeCount: integer("badge_count").notNull().default(0),
  streakDays: integer("streak_days").notNull().default(0),
  lastActiveDate: text("last_active_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
