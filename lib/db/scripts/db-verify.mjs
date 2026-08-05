import { Client } from "pg";

function print(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function extractPgError(err) {
  if (!err) return null;
  const out = {
    message: err.message ?? null,
    code: err.code ?? null,
    detail: err.detail ?? null,
    hint: err.hint ?? null,
    schema: err.schema ?? null,
    table: err.table ?? null,
    column: err.column ?? null,
    constraint: err.constraint ?? null,
    routine: err.routine ?? null,
    severity: err.severity ?? null,
  };
  if (err.driverError && typeof err.driverError === "object") {
    out.driverError = extractPgError(err.driverError);
  }
  if (err.cause && typeof err.cause === "object") {
    out.cause = extractPgError(err.cause);
  }
  return out;
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set in the environment. The script cannot connect to the production database.");
    process.exitCode = 2;
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
  } catch (err) {
    console.error("ERROR: Failed to connect to the database. Full error:");
    print(extractPgError(err) ?? err);
    process.exitCode = 2;
    return;
  }

  const queries = [
    { label: "SELECT version()", sql: "SELECT version();" },
    { label: "SELECT current_database()", sql: "SELECT current_database();" },
    { label: "SELECT current_schema()", sql: "SELECT current_schema();" },
    { label: "SHOW search_path", sql: "SHOW search_path;" },
    { label: "SELECT to_regclass('public.users')", sql: "SELECT to_regclass('public.users');" },
    { label: "SELECT columns for users", sql: "SELECT * FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position;" },
  ];

  for (const q of queries) {
    console.log(`\n--- ${q.label} ---`);
    try {
      const res = await client.query(q.sql);
      if (res.rows && res.rows.length > 0) {
        print(res.rows);
      } else if (res.rows && res.rows.length === 0) {
        console.log("(no rows returned)");
      } else {
        print(res);
      }
    } catch (err) {
      console.error(`Query failed: ${q.label}`);
      const pgErr = extractPgError(err) ?? err;
      print(pgErr);
    }
  }

  try { await client.end(); } catch {}
}

run().catch(e => {
  console.error("Unhandled error:");
  print(extractPgError(e) ?? e);
  process.exitCode = 2;
});
