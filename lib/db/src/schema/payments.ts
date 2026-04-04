import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Payments table — tracks school fees per student per month
export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => usersTable.id),
  studentName: text("student_name").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  month: text("month").notNull(),
  year: integer("year").notNull(),
  // Status: paid, pending, overdue
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  recordedBy: integer("recorded_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
