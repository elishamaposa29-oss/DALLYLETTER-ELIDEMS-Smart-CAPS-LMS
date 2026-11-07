import { pgTable, bigserial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { paymentsTable } from "./payments";

export const paymentTransactionsTable = pgTable("payment_transactions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  paymentId: integer("payment_id").notNull().references(() => paymentsTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  reference: text("reference").notNull().unique(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  providerReference: text("provider_reference"),
  providerOrderId: text("provider_order_id"),
  providerCaptureId: text("provider_capture_id"),
  currency: text("currency").notNull().default("USD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentTransaction = typeof paymentTransactionsTable.$inferSelect;
