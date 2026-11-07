import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the payment transaction migration.");
const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(here, "../migrations/0004_payment_transactions.sql"), "utf8");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(migration);
  const result = await pool.query(`
    SELECT
      (SELECT count(*) FROM information_schema.columns
       WHERE table_schema='public' AND table_name='payments' AND column_name='amount_paid') AS amount_paid_column,
      (SELECT count(*) FROM information_schema.tables
       WHERE table_schema='public' AND table_name='payment_transactions') AS transaction_table,
      (SELECT count(*) FROM pg_indexes
       WHERE schemaname='public' AND tablename='payment_transactions'
         AND indexname='payment_transactions_manual_receipt_global_unique') AS receipt_index
  `);
  const row = result.rows[0];
  if (Number(row.amount_paid_column) !== 1 || Number(row.transaction_table) !== 1 || Number(row.receipt_index) !== 1) {
    throw new Error("Payment transaction schema verification failed.");
  }
  console.log("PAYMENT_TRANSACTION_MIGRATION: PASS (idempotent schema and receipt uniqueness verified)");
} finally {
  await pool.end();
}
