import { pool } from "@workspace/db";
import { migrateExerciseSchema } from "./exercise-schema.js";

try {
  await migrateExerciseSchema();
} finally {
  await pool.end();
}
