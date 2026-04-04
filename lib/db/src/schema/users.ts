import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Users table — stores students, teachers, and owner
export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  // Role: student, teacher, or owner
  role: text("role").notNull().default("student"),
  isPrefect: boolean("is_prefect").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(false),
  phone: text("phone"),
  grade: text("grade"),
  subject: text("subject"),
  avatarUrl: text("avatar_url"),
  lastPaymentDate: text("last_payment_date"),
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
