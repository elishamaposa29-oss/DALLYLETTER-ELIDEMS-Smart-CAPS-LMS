import { pool } from "@workspace/db";
export async function hasContentPermission(requesterId:number,contentType:"lesson"|"exercise",contentId:number,requestedAction:"edit"|"create_exercise"|"delete"|"notify"):Promise<boolean>{
 const r=await pool.query("SELECT 1 FROM content_permission_requests WHERE requester_id=$1 AND content_type=$2 AND content_id=$3 AND requested_action=$4 AND status='approved' LIMIT 1",[requesterId,contentType,contentId,requestedAction]);
 return Boolean(r.rows[0]);
}
