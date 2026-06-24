import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const staffPaymentsTable = pgTable("staff_payments", {
  id: serial("id").primaryKey(),
  recipientId: integer("recipient_id").notNull().references(() => usersTable.id),
  recipientName: text("recipient_name").notNull(),
  recipientRole: text("recipient_role").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  reason: text("reason").notNull().default("salary"),
  description: text("description"),
  paymentMethod: text("payment_method").notNull().default("bank_transfer"),
  referenceNumber: text("reference_number"),
  status: text("status").notNull().default("paid"),
  period: text("period"),
  paidBy: integer("paid_by").references(() => usersTable.id),
  paidByName: text("paid_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StaffPayment = typeof staffPaymentsTable.$inferSelect;
