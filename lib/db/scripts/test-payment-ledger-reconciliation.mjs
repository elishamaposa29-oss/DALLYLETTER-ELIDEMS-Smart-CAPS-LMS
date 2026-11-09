import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for payment-ledger reconciliation tests.");
const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(here, "../migrations/0005_payment_ledger_reconciliation.sql"), "utf8");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const suffix = randomUUID().replace(/-/g, "");
let userId;

try {
  const user = await pool.query(
    "INSERT INTO users(email,password_hash,name,role) VALUES($1,'ci-only-hash','Ledger Reconciliation CI','student') RETURNING id",
    ["ledger-reconciliation-" + suffix + "@example.test"]
  );
  userId = Number(user.rows[0].id);

  const legacy = await pool.query(
    "INSERT INTO payments(student_id,student_name,amount,amount_paid,month,year,status,notes,recorded_by) VALUES($1,'Ledger Reconciliation CI',100,25,'January',2026,'partially_paid','legacy verified receipt before transaction ledger',$1) RETURNING id",
    [userId]
  );
  const drifted = await pool.query(
    "INSERT INTO payments(student_id,student_name,amount,amount_paid,month,year,status,notes,recorded_by) VALUES($1,'Ledger Reconciliation CI',100,10,'February',2026,'partially_paid','settled transaction summary drift',$1) RETURNING id",
    [userId]
  );
  const legacyId = Number(legacy.rows[0].id);
  const driftedId = Number(drifted.rows[0].id);

  await pool.query(
    "INSERT INTO payment_transactions(payment_id,provider,reference,amount,status,currency) VALUES($1,'manual:bank_transfer',$2,12,'paid','USD')",
    [driftedId, "LEDGER-CI-" + suffix]
  );

  await pool.query(migration);
  await pool.query(migration);

  const result = await pool.query(`
    SELECT p.id,p.amount_paid,p.status,
      COALESCE(SUM(t.amount) FILTER (WHERE t.status='paid'),0)::numeric(10,2) AS settled_total
    FROM payments p
    LEFT JOIN payment_transactions t ON t.payment_id=p.id
    WHERE p.id = ANY($1::int[])
    GROUP BY p.id,p.amount_paid,p.status
    ORDER BY p.id
  `, [[legacyId, driftedId]]);
  const byId = new Map(result.rows.map(row => [Number(row.id), row]));

  const legacyRow = byId.get(legacyId);
  assert.equal(Number(legacyRow.amount_paid), 25);
  assert.equal(Number(legacyRow.settled_total), 25);
  assert.equal(legacyRow.status, "partially_paid");

  const opening = await pool.query(
    "SELECT amount,status,provider FROM payment_transactions WHERE payment_id=$1 AND provider='opening_balance'",
    [legacyId]
  );
  assert.equal(opening.rows.length, 1, "legacy credited balance must be represented by exactly one opening-balance transaction");
  assert.equal(Number(opening.rows[0].amount), 25);
  assert.equal(opening.rows[0].status, "paid");

  const driftedRow = byId.get(driftedId);
  assert.equal(Number(driftedRow.amount_paid), 12, "settled transactions must restore a stale summary column");
  assert.equal(Number(driftedRow.settled_total), 12);
  assert.equal(driftedRow.status, "partially_paid");

  const audit = await pool.query(
    "SELECT action FROM payment_ledger_reconciliation_audit WHERE payment_id = ANY($1::int[])",
    [[legacyId, driftedId]]
  );
  assert(audit.rows.some(row => row.action === "preserve_legacy_opening_balance"));
  assert(audit.rows.some(row => row.action === "restore_transaction_ledger_total"));

  console.log("PAYMENT_LEDGER_RECONCILIATION_TEST: PASS", JSON.stringify({
    legacyOpeningBalance: Number(legacyRow.amount_paid),
    restoredSettledTransactions: Number(driftedRow.amount_paid),
    idempotentRerun: true,
    auditRows: audit.rows.length
  }));
} finally {
  if (userId) {
    await pool.query("DELETE FROM users WHERE id=$1", [userId]).catch(() => undefined);
  }
  await pool.end();
}
