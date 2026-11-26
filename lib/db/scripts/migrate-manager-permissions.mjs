import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";

const { Pool } = pg;
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(here, "../migrations/0003_manager_permission_grants.sql"), "utf8");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(migration);
  console.log("MANAGER_PERMISSION_MIGRATION: applied successfully");
} finally {
  await pool.end();
}
