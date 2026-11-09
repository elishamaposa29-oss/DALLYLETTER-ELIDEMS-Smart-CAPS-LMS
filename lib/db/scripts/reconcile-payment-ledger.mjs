import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for payment-ledger reconciliation.");

const apply = process.argv.includes("--apply");
if (apply && process.env.PAYMENT_LEDGER_RECONCILIATION_CONFIRM !== "YES") {
  throw new Error("Refusing to apply reconciliation without PAYMENT_LEDGER_RECONCILIATION_CONFIRM=YES.");
}

const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(here, "../migrations/0005_payment_ledger_reconciliation.sql"), "utf8");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const report = await pool.query(`
    WITH totals AS (
      SELECT
        p.id,
        ROUND(COALESCE(p.amount_paid, 0)::numeric, 2) AS recorded_amount_paid,
        ROUND(COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'paid'), 0)::numeric, 2) AS settled_transaction_total
      FROM payments p
      LEFT JOIN payment_transactions t ON t.payment_id = p.id
      GROUP BY p.id, p.amount_paid
    )
    SELECT
      COUNT(*) FILTER (WHERE recorded_amount_paid > settled_transaction_total)::int AS legacy_opening_balance_rows,
      COUNT(*) FILTER (WHERE recorded_amount_paid < settled_transaction_total)::int AS transaction_total_exceeds_summary_rows,
      COALESCE(SUM(recorded_amount_paid - settled_transaction_total) FILTER (WHERE recorded_amount_paid > settled_transaction_total), 0)::numeric(12,2) AS legacy_opening_balance_total,
      COALESCE(SUM(settled_transaction_total - recorded_amount_paid) FILTER (WHERE recorded_amount_paid < settled_transaction_total), 0)::numeric(12,2) AS missing_summary_credit_total
    FROM totals
  `);
  const before = report.rows[0];
  console.log("PAYMENT_LEDGER_RECONCILIATION_BEFORE:", JSON.stringify(before));

  if (!apply) {
    console.log("DRY_RUN_ONLY: no database rows were changed. Re-run with --apply and PAYMENT_LEDGER_RECONCILIATION_CONFIRM=YES only after reviewing the report and backup.");
    process.exitCode = 0;
  } else {
    await pool.query(migration);
    const verify = await pool.query(`
      SELECT COUNT(*)::int AS mismatched_invoice_count
      FROM (
        SELECT p.id
        FROM payments p
        LEFT JOIN payment_transactions t ON t.payment_id = p.id AND t.status = 'paid'
        WHERE lower(COALESCE(p.status, '')) IN ('pending', 'overdue', 'partially_paid', 'paid')
        GROUP BY p.id, p.amount_paid
        HAVING ROUND(COALESCE(p.amount_paid, 0)::numeric, 2) <> ROUND(COALESCE(SUM(t.amount), 0)::numeric, 2)
      ) mismatches
    `);
    const mismatches = Number(verify.rows[0]?.mismatched_invoice_count ?? -1);
    if (mismatches !== 0) throw new Error("Reconciliation verification failed; mismatched invoice count: " + mismatches);
    const audit = await pool.query("SELECT COUNT(*)::int AS audit_rows FROM payment_ledger_reconciliation_audit");
    const openings = await pool.query("SELECT COUNT(*)::int AS opening_balance_rows FROM payment_transactions WHERE provider='opening_balance' AND status='paid'");
    console.log("PAYMENT_LEDGER_RECONCILIATION_AFTER:", JSON.stringify({
      mismatchedInvoiceCount: mismatches,
      auditRows: Number(audit.rows[0]?.audit_rows ?? 0),
      openingBalanceRows: Number(openings.rows[0]?.opening_balance_rows ?? 0),
      result: "PASS"
    }));
  }
} finally {
  await pool.end();
}
