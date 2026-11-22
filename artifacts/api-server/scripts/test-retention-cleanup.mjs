import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// Load pg directly for the test harness. Importing @workspace/db from a plain
// Node ESM script loads its TypeScript entrypoint, whose extensionless
// directory import (./schema) is not supported by Node without a TS loader.
const dbPackageUrl = new URL("../../../lib/db/package.json", import.meta.url).href;
const requireDb = createRequire(dbPackageUrl);
const { Pool } = requireDb("pg");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for retention integration tests.");
const testPool = new Pool({ connectionString: process.env.DATABASE_URL });
const suffix = randomUUID();
const email = `retention-integration-${suffix}@example.test`;
const titlePrefix = `retention-integration-${suffix}`;
const tempDir = await mkdtemp(join(process.cwd(), ".retention-cleanup-tests-"));
let ownerId = null;
let runIds = [];
let stopScheduler = () => {};
try {
  const owner = await testPool.query(
    "INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,'owner') RETURNING id",
    [email,"test-only-not-a-login-hash","Retention Integration Owner"],
  );
  ownerId = Number(owner.rows[0].id);

  // The production module imports @workspace/db. For this isolated integration
  // run, alias that package to a tiny adapter backed by the same test database,
  // avoiding execution of the package TS entrypoint under native Node ESM.
  const dbAdapterPath = join(tempDir, "db-adapter.mjs");
  await writeFile(dbAdapterPath, `import { createRequire } from "node:module";\nconst require = createRequire(${JSON.stringify(dbPackageUrl)});\nconst { Pool } = require("pg");\nexport const pool = new Pool({ connectionString: process.env.DATABASE_URL, allowExitOnIdle: true });\n`);
  await build({
    entryPoints: ["src/lib/retention-cleanup.ts"],
    outfile: join(tempDir,"retention-cleanup.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    alias: { "@workspace/db": dbAdapterPath },
    sourcemap: "inline",
  });
  const retention = await import(pathToFileURL(join(tempDir,"retention-cleanup.mjs")).href);
  const { ensureRetentionSchema, previewRetention, runRetentionCleanup, startRetentionCleanupScheduler, stopRetentionCleanupScheduler } = retention;
  stopScheduler = stopRetentionCleanupScheduler;
  await ensureRetentionSchema();

  await testPool.query(
    "INSERT INTO notifications(title,message,type,is_read,created_at) VALUES ($1,$2,'general',TRUE,now()-interval '40 days'),($3,$4,'general',FALSE,now()-interval '40 days'),($5,$6,'payment_overdue',TRUE,now()-interval '40 days')",
    [titlePrefix+"-read","old read notification",titlePrefix+"-unread","old unread notification",titlePrefix+"-payment","financial notification"],
  );
  const preview = await previewRetention(30,["notifications"]);
  assert.equal(preview.counts.notifications.eligible,1,"preview must include only old read non-financial notifications");

  const manual = await runRetentionCleanup({triggerType:"manual",triggeredBy:ownerId,categories:["notifications"],retentionDays:30});
  runIds.push(manual.runId);
  assert.equal(manual.status,"completed","manual cleanup should complete without category errors");
  assert.equal(manual.deleted.notifications,1,"manual cleanup should delete the one eligible notification");
  const protectedRows = await testPool.query("SELECT title FROM notifications WHERE title LIKE $1 ORDER BY title",[titlePrefix+"-%"]);
  assert.deepEqual(protectedRows.rows.map(row=>row.title).sort(),[titlePrefix+"-payment",titlePrefix+"-unread"].sort(),"unread and payment notifications must remain protected");
  const manualAudit = await testPool.query("SELECT action FROM audit_logs WHERE target_type='retention_run' AND target_id=$1",[manual.runId]);
  assert.ok(manualAudit.rows.some(row=>row.action==="retention.cleanup.started"),"manual cleanup must write a start audit event");
  assert.ok(manualAudit.rows.some(row=>row.action==="retention.cleanup.completed"),"manual cleanup must write a completion audit event");

  await testPool.query("INSERT INTO notifications(title,message,type,is_read,created_at) VALUES ($1,$2,'general',TRUE,now()-interval '40 days')",[titlePrefix+"-scheduled","scheduled cleanup notification"]);
  await testPool.query(
    "UPDATE owner_retention_policies SET enabled=TRUE,categories='[\"notifications\"]'::jsonb,retention_days=30,interval_hours=24,next_run_at=now()-interval '1 minute',updated_by=$1 WHERE id=1",
    [ownerId],
  );
  const scheduledSince = new Date();
  await startRetentionCleanupScheduler();
  let scheduled = null;
  for (let attempt=0; attempt<60; attempt++) {
    const found = await testPool.query(
      "SELECT id,status,category_counts FROM owner_retention_runs WHERE trigger_type='scheduled' AND triggered_by=$1 AND started_at >= $2 ORDER BY id DESC LIMIT 1",
      [ownerId,scheduledSince],
    );
    if (found.rows[0]) { scheduled=found.rows[0]; break; }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(scheduled,"server scheduler must automatically execute a due enabled retention policy");
  runIds.push(Number(scheduled.id));
  assert.equal(scheduled.status,"completed","scheduled retention run should complete");
  const scheduledRow = await testPool.query("SELECT count(*)::int AS count FROM notifications WHERE title=$1",[titlePrefix+"-scheduled"]);
  assert.equal(scheduledRow.rows[0].count,0,"scheduled cleanup must remove eligible content after its configured age");
  console.log("RETENTION_CLEANUP_INTEGRATION: PASS — safe preview, protected unread/payment notifications, manual deletion, audit trail and scheduled execution.");
} finally {
  stopScheduler();
  if (ownerId != null) {
    await testPool.query("UPDATE owner_retention_policies SET enabled=FALSE,categories='[]'::jsonb,next_run_at=NULL,updated_by=NULL WHERE id=1").catch(()=>undefined);
    if (runIds.length) {
      await testPool.query("DELETE FROM audit_logs WHERE target_type='retention_run' AND target_id=ANY($1::int[])",[runIds]).catch(()=>undefined);
      await testPool.query("DELETE FROM owner_retention_runs WHERE id=ANY($1::bigint[])",[runIds]).catch(()=>undefined);
    }
    await testPool.query("DELETE FROM notifications WHERE title LIKE $1",[titlePrefix+"-%"]).catch(()=>undefined);
    await testPool.query("DELETE FROM owner_retention_previews WHERE created_by=$1",[ownerId]).catch(()=>undefined);
    await testPool.query("DELETE FROM users WHERE id=$1",[ownerId]).catch(()=>undefined);
  }
  await testPool.end();
  await rm(tempDir,{recursive:true,force:true});
}
