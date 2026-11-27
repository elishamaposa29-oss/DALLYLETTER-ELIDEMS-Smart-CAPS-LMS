import { pool } from "@workspace/db";
export async function ensureCloudStorageSchema(): Promise<void> {
 const client=await pool.connect();
 try {
  await client.query("BEGIN");
  await client.query(`CREATE TABLE IF NOT EXISTS user_cloud_storage (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, quota_bytes bigint NOT NULL DEFAULT 10737418240 CHECK(quota_bytes>=0), used_bytes bigint NOT NULL DEFAULT 0 CHECK(used_bytes>=0 AND used_bytes<=quota_bytes), updated_at timestamptz NOT NULL DEFAULT now())`);
  await client.query(`CREATE TABLE IF NOT EXISTS user_cloud_objects (id uuid PRIMARY KEY,user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,storage_key text NOT NULL UNIQUE,file_name text NOT NULL,mime_type text NOT NULL,size_bytes bigint NOT NULL CHECK(size_bytes>0),category text NOT NULL CHECK(category IN ('video','lesson','assignment','exercise','study_group','message','document','other')),checksum_sha256 text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`);
  await client.query("CREATE INDEX IF NOT EXISTS user_cloud_objects_user_created_idx ON user_cloud_objects(user_id,created_at DESC)");
  await client.query("CREATE INDEX IF NOT EXISTS user_cloud_objects_user_category_idx ON user_cloud_objects(user_id,category,created_at DESC)");
  await client.query("COMMIT");
 } catch(e){await client.query("ROLLBACK");throw e;} finally{client.release();}
}
