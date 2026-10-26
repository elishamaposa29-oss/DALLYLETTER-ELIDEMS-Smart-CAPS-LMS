import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required; point it at an explicitly designated staging database.");

const apply = process.argv.includes("--apply");
if (apply && process.env.ALLOW_ENROLLMENT_BACKFILL !== "true") {
  throw new Error("Refusing writes: set ALLOW_ENROLLMENT_BACKFILL=true only after reviewing the staging dry-run.");
}
if (process.env.NODE_ENV === "production" && apply) {
  throw new Error("Refusing enrollment backfill with NODE_ENV=production.");
}

const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined });

try {
  const identity = await pool.query("SELECT current_database() AS database_name, current_setting('transaction_read_only') AS read_only");
  console.log("Database target:", identity.rows[0].database_name, "read_only:", identity.rows[0].read_only);
  if (identity.rows[0].read_only === "on") throw new Error("Database connection is read-only.");

  const schema = await pool.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name, ordinal_position",
    [["enrollments", "user_courses", "course_enrollments", "class_students"]],
  );
  const columns = new Map();
  for (const row of schema.rows) {
    if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
    columns.get(row.table_name).add(row.column_name);
  }

  const target = columns.get("enrollments");
  if (!target || !["learner_id", "class_id", "enrolled_at"].every((column) => target.has(column))) {
    throw new Error("Target public.enrollments is missing expected learner_id, class_id, or enrolled_at columns. Apply the reviewed staging schema first.");
  }

  // Source must already identify a class. A course_id is NOT assumed to be a class_id.
  const candidates = ["class_students", "course_enrollments", "user_courses"];
  const sourceName = candidates.find((name) => {
    const cols = columns.get(name);
    return cols && cols.has("user_id") && cols.has("class_id");
  });
  if (!sourceName) {
    const found = [...columns.entries()].map(([name, cols]) => name + "(" + [...cols].join(",") + ")").join("; ");
    throw new Error("No verified legacy source with user_id + class_id was found. No rows were changed. Inspect the staging schema and implement an explicit course-to-class mapping first. Discovered: " + (found || "none of the candidate tables exist"));
  }

  const source = columns.get(sourceName);
  const dateColumn = source.has("created_at") ? "created_at" : source.has("enrolled_at") ? "enrolled_at" : null;
  const enrolledAtExpr = dateColumn ? `COALESCE(${dateColumn}, now())` : "now()";
  const count = await pool.query(`SELECT count(*)::int AS rows, count(DISTINCT user_id)::int AS learners, count(DISTINCT class_id)::int AS classes FROM public.${sourceName}`);
  console.log("Verified source:", sourceName, "columns:", [...source].join(", "));
  console.log("Candidate source rows:", JSON.stringify(count.rows[0]));
  if (!apply) {
    console.log("DRY RUN ONLY. No rows changed. Review the source mapping, then rerun with --apply and ALLOW_ENROLLMENT_BACKFILL=true against staging.");
  } else {
    const result = await pool.query(
      `INSERT INTO public.enrollments (learner_id, class_id, enrolled_at)
       SELECT source.user_id, source.class_id, ${enrolledAtExpr}
       FROM public.${sourceName} AS source
       JOIN public.users AS learner ON learner.id = source.user_id
       JOIN public.classes AS live_class ON live_class.id = source.class_id
       ON CONFLICT (learner_id, class_id) DO NOTHING`,
    );
    console.log("Backfill complete; inserted rows:", result.rowCount ?? 0);
  }
} finally {
  await pool.end();
}
