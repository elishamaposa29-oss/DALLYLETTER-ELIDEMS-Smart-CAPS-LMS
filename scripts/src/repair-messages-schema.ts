import { pool } from "@workspace/db";

async function repairMessagesSchema(): Promise<void> {
  await pool.query(`
    ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS parent_message_id integer;
  `);
  console.log("Verified messages.parent_message_id exists.");
}

try {
  await repairMessagesSchema();
} finally {
  await pool.end();
}
