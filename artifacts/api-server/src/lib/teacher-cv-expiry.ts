import { pool } from "@workspace/db";
import { sendEmail } from "./email-service";
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;
async function ensure(){
 await pool.query(`CREATE TABLE IF NOT EXISTS teacher_cv_workflow_settings(id integer PRIMARY KEY DEFAULT 1 CHECK(id=1),review_duration_days integer CHECK(review_duration_days BETWEEN 1 AND 365 OR review_duration_days IS NULL),updated_by integer REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now())`);
 await pool.query("INSERT INTO teacher_cv_workflow_settings(id,review_duration_days) VALUES(1,NULL) ON CONFLICT(id) DO NOTHING");
    await pool.query("ALTER TABLE teacher_cv_workflow_settings ALTER COLUMN review_duration_days DROP NOT NULL");
    await pool.query("ALTER TABLE teacher_cv_workflow_settings ALTER COLUMN review_duration_days DROP DEFAULT");
    await pool.query("UPDATE teacher_cv_workflow_settings SET review_duration_days=NULL WHERE updated_by IS NULL");
 await pool.query(`CREATE TABLE IF NOT EXISTS teacher_cv_review_history(id bigserial PRIMARY KEY,teacher_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,reviewer_id integer REFERENCES users(id),action text NOT NULL,previous_status text,new_status text NOT NULL,note text,created_at timestamptz NOT NULL DEFAULT now())`);
}
export async function processExpiredTeacherApplications():Promise<void>{
 if(running)return;running=true;
 try{
  await ensure();
  const settings=await pool.query("SELECT review_duration_days FROM teacher_cv_workflow_settings WHERE id=1");
  const configuredDays=Number(settings.rows[0]?.review_duration_days||0);if(!Number.isInteger(configuredDays)||configuredDays<1||configuredDays>365)return;const days=configuredDays;
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const due=await client.query(`SELECT id,name,email,teacher_application_status FROM users WHERE lower(role)='teacher' AND COALESCE(teacher_application_status,'pending_review')='pending_review' AND created_at+($1::text||' days')::interval<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20`,[days]);
   for(const teacher of due.rows){
    try{
     await sendEmail({to:[String(teacher.email)],subject:"Dallyletter Elidems teacher application review period ended",text:"Hello "+(teacher.name||"applicant")+", your teacher CV was not approved within the review duration configured by the Owner. Your login details remain valid. Your teacher account has now been converted to a learner account. On your next login you will enter as a normal learner."});
     await client.query("UPDATE users SET role='student',teacher_application_status='auto_converted',teacher_review_deadline=NULL,subject=NULL,is_manager=false,is_prefect=false WHERE id=$1",[teacher.id]);
     await client.query("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1",[teacher.id]);
     await client.query("INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) VALUES($1,NULL,'expired',$2,'student','Owner-configured review duration elapsed; notification email accepted before conversion.')",[teacher.id,teacher.teacher_application_status||"pending_review"]);
    }catch(error){console.error("[teacher-cv-expiry] Notification/conversion failed; applicant remains a teacher until email is accepted.",error instanceof Error?error.message:"unknown");}
   }
   await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
 }catch(error){console.error("[teacher-cv-expiry] Scheduler pass failed",error instanceof Error?error.message:"unknown");}
 finally{running=false;}
}
export function startTeacherCvExpiryScheduler():void{
 if(timer)return;
 void processExpiredTeacherApplications();
 timer=setInterval(()=>void processExpiredTeacherApplications(),5*60*1000);
 timer.unref?.();
}
