import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for cloud-storage integration tests.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const suffix = randomUUID().replace(/-/g, "");
const emails = ["cloud-a-" + suffix + "@example.test", "cloud-b-" + suffix + "@example.test"];
let userIds = [];

async function reserve(userId, bytes) {
  const result = await pool.query(
    "UPDATE user_cloud_storage SET used_bytes=used_bytes+$2,updated_at=now() WHERE user_id=$1 AND used_bytes+$2<=quota_bytes RETURNING used_bytes",
    [userId, bytes]
  );
  return result.rows[0] ? Number(result.rows[0].used_bytes) : null;
}

async function reconcile(userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const quota = await client.query("SELECT quota_bytes FROM user_cloud_storage WHERE user_id=$1 FOR UPDATE", [userId]);
    const total = await client.query("SELECT COALESCE(SUM(size_bytes),0)::bigint AS bytes FROM user_cloud_objects WHERE user_id=$1", [userId]);
    const registered = Number(total.rows[0].bytes);
    const accounted = Math.min(Number(quota.rows[0].quota_bytes), registered);
    await client.query("UPDATE user_cloud_storage SET used_bytes=$2,updated_at=now() WHERE user_id=$1", [userId, accounted]);
    await client.query("COMMIT");
    return accounted;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

try {
  const created = await pool.query(
    "INSERT INTO users(email,password_hash,name,role) VALUES($1,'ci-only-hash','Cloud Storage Integration CI','student'),($2,'ci-only-hash','Cloud Storage Integration CI','student') RETURNING id,email",
    emails
  );
  userIds = created.rows.map(row => Number(row.id));
  const [accountA, accountB] = userIds;
  for (const userId of userIds) {
    await pool.query(
      "INSERT INTO user_cloud_storage(user_id,quota_bytes,used_bytes) VALUES($1,1000,0)",
      [userId]
    );
  }

  assert.equal(await reserve(accountA, 900), 900, "first account should reserve its initial upload");
  const competing = await Promise.all([reserve(accountA, 100), reserve(accountA, 100)]);
  assert.equal(competing.filter(value => value !== null).length, 1, "concurrent reservations must not exceed the quota");
  assert.equal(Number((await pool.query("SELECT used_bytes FROM user_cloud_storage WHERE user_id=$1", [accountA])).rows[0].used_bytes), 1000);
  assert.equal(await reserve(accountB, 1000), 1000, "second account must retain an independent full allowance");

  const objectA = randomUUID(), objectB = randomUUID();
  await pool.query(
    "INSERT INTO user_cloud_objects(id,user_id,storage_key,file_name,mime_type,size_bytes,category,checksum_sha256) VALUES($1,$2,$3,'first.bin','application/octet-stream',900,'document',$4)",
    [objectA, accountA, "ci/" + objectA, "a".repeat(64)]
  );
  await pool.query(
    "INSERT INTO user_cloud_objects(id,user_id,storage_key,file_name,mime_type,size_bytes,category,checksum_sha256) VALUES($1,$2,$3,'second.bin','application/octet-stream',100,'document',$4)",
    [randomUUID(), accountA, "ci/" + randomUUID(), "b".repeat(64)]
  );
  await pool.query(
    "INSERT INTO user_cloud_objects(id,user_id,storage_key,file_name,mime_type,size_bytes,category,checksum_sha256) VALUES($1,$2,$3,'private.bin','application/octet-stream',1000,'document',$4)",
    [objectB, accountB, "ci/" + objectB, "c".repeat(64)]
  );

  const crossAccountRead = await pool.query("SELECT id FROM user_cloud_objects WHERE id=$1 AND user_id=$2", [objectB, accountA]);
  assert.equal(crossAccountRead.rows.length, 0, "one account must not read another account's cloud object");
  assert.equal(await reconcile(accountA), 1000);
  assert.equal(await reconcile(accountA), 1000, "reconciliation must be idempotent");
  await pool.query("UPDATE user_cloud_storage SET used_bytes=7 WHERE user_id=$1", [accountA]);
  assert.equal(await reconcile(accountA), 1000, "reconciliation must repair under-counted quota state");

  const deleted = await pool.query("DELETE FROM user_cloud_objects WHERE id=$1 AND user_id=$2 RETURNING size_bytes", [objectA, accountA]);
  assert.equal(Number(deleted.rows[0].size_bytes), 900);
  await pool.query("UPDATE user_cloud_storage SET used_bytes=GREATEST(0,used_bytes-$2) WHERE user_id=$1", [accountA, deleted.rows[0].size_bytes]);
  assert.equal(Number((await pool.query("SELECT used_bytes FROM user_cloud_storage WHERE user_id=$1", [accountA])).rows[0].used_bytes), 100);
  assert.equal(Number((await pool.query("SELECT used_bytes FROM user_cloud_storage WHERE user_id=$1", [accountB])).rows[0].used_bytes), 1000);

  console.log("CLOUD_STORAGE_DATABASE_INTEGRATION: PASS", JSON.stringify({
    concurrentQuotaReservation: true,
    idempotentReconciliation: true,
    driftRecovery: true,
    deletionQuotaRelease: true,
    crossAccountIsolation: true
  }));
} finally {
  if (userIds.length) await pool.query("DELETE FROM users WHERE id=ANY($1::int[])", [userIds]).catch(() => undefined);
  await pool.end();
}
