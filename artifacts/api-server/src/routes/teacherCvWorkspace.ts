import { Router } from "express";
import { requireManagerPermission, requireManagerPermissionForRequest, requireManagerPermissionIfManager } from "../lib/manager-permission-policy";
import { db, notificationsTable, pool } from "@workspace/db";
import { requireAuth, canAccessManager } from "../lib/auth-middleware";
import { enqueueEmailNotification } from "../lib/email-notification-queue";
import { normalizeRole, isSeniorManager, canModerateUser } from "../lib/role-access";
import { revokeUserSessions } from "../lib/auth-session-store";
import { processExpiredTeacherApplications } from "../lib/teacher-cv-expiry";
const router=Router(); let ready:Promise<void>|null=null;
async function ensure(){if(!ready)ready=(async()=>{await pool.query(`CREATE TABLE IF NOT EXISTS teacher_cv_workflow_settings(id integer PRIMARY KEY DEFAULT 1 CHECK(id=1),review_duration_days integer CHECK(review_duration_days BETWEEN 1 AND 365 OR review_duration_days IS NULL),updated_by integer REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now())`);await pool.query("INSERT INTO teacher_cv_workflow_settings(id,review_duration_days) VALUES(1,NULL) ON CONFLICT(id) DO NOTHING");
    await pool.query("ALTER TABLE teacher_cv_workflow_settings ALTER COLUMN review_duration_days DROP NOT NULL");
    await pool.query("ALTER TABLE teacher_cv_workflow_settings ALTER COLUMN review_duration_days DROP DEFAULT");
    await pool.query("UPDATE teacher_cv_workflow_settings SET review_duration_days=NULL WHERE updated_by IS NULL");await pool.query(`CREATE TABLE IF NOT EXISTS teacher_cv_review_history(id bigserial PRIMARY KEY,teacher_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,reviewer_id integer REFERENCES users(id),action text NOT NULL,previous_status text,new_status text NOT NULL,note text,created_at timestamptz NOT NULL DEFAULT now())`);await pool.query(`CREATE TABLE IF NOT EXISTS teacher_cv_chat_messages(id bigserial PRIMARY KEY,teacher_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,sender_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),created_at timestamptz NOT NULL DEFAULT now())`);await pool.query("CREATE INDEX IF NOT EXISTS teacher_cv_chat_thread_idx ON teacher_cv_chat_messages(teacher_id,created_at)")})().catch(e=>{ready=null;throw e});return ready}
function isOwner(u:any){return ["owner","platform_owner"].includes(normalizeRole(u?.role))}
function isAdmin(u:any){return normalizeRole(u?.role)==="admin"}
function canReview(u:any){return isOwner(u)||isSeniorManager(u)}
function idOf(v:unknown){const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null}
router.use(requireAuth);
router.get("/config",requireManagerPermission("teacher_cv.view"),async(req,res)=>{if(!canReview(req.currentUser)){res.status(403).json({error:"Owner or Senior Manager access required"});return}await ensure();const r=await pool.query("SELECT review_duration_days,updated_at FROM teacher_cv_workflow_settings WHERE id=1");res.json({reviewDurationDays:(r.rows[0]?.review_duration_days==null?null:Number(r.rows[0].review_duration_days)),updatedAt:r.rows[0]?.updated_at||null,canEdit:isOwner(req.currentUser)})});
router.patch("/config",async(req,res)=>{if(!isOwner(req.currentUser)){res.status(403).json({error:"Only the Owner can set the review duration"});return}const days=Number(req.body?.reviewDurationDays);if(!Number.isInteger(days)||days<1||days>365){res.status(400).json({error:"Choose a whole number from 1 to 365 days"});return}await ensure();const r=await pool.query("UPDATE teacher_cv_workflow_settings SET review_duration_days=$1,updated_by=$2,updated_at=now() WHERE id=1 RETURNING review_duration_days,updated_at",[days,req.currentUser!.id]);await pool.query("UPDATE users u SET teacher_review_deadline=COALESCE((SELECT max(h.created_at) FROM teacher_cv_review_history h WHERE h.teacher_id=u.id AND h.action='submitted'),u.created_at)+make_interval(days=>$1) WHERE lower(u.role)=$2 AND u.teacher_application_status IN ($3,$4)",[days,"teacher","draft","pending_review"]);res.json({reviewDurationDays:r.rows[0].review_duration_days,updatedAt:r.rows[0].updated_at})});
router.get("/queue",requireManagerPermission("teacher_cv.view"),async(req,res)=>{await ensure();const s=await pool.query("SELECT review_duration_days FROM teacher_cv_workflow_settings WHERE id=1");const days=s.rows[0]?.review_duration_days==null?null:Number(s.rows[0].review_duration_days);const r=await pool.query("SELECT u.id,u.name,u.email,u.role,u.is_manager,u.manager_level,u.created_at,(SELECT max(h.created_at) FROM teacher_cv_review_history h WHERE h.teacher_id=u.id AND h.action='submitted') submitted_at,COALESCE(u.teacher_application_status,$1) status,u.teacher_review_deadline deadline,(u.teacher_review_deadline IS NOT NULL AND u.teacher_review_deadline<=now()) overdue,(SELECT count(*)::int FROM teacher_documents d WHERE d.user_id=u.id) document_count,(tp.cv->>'surveySubmittedAt') survey_submitted_at,COALESCE(tp.cv->>'surveyReviewStatus','pending') survey_review_status,EXISTS(SELECT 1 FROM teacher_cv_review_history submitted WHERE submitted.teacher_id=u.id AND submitted.action='submitted') has_cv_submission FROM users u LEFT JOIN teacher_profiles tp ON tp.user_id=u.id WHERE lower(u.role)=$2 AND (tp.user_id IS NOT NULL OR EXISTS(SELECT 1 FROM teacher_cv_review_history h WHERE h.teacher_id=u.id AND h.action IN ('submitted','cv_submission_superseded','cv_deleted','approved','rejected')) OR EXISTS(SELECT 1 FROM teacher_documents d WHERE d.user_id=u.id) OR EXISTS(SELECT 1 FROM teacher_qualifications q WHERE q.user_id=u.id)) ORDER BY u.created_at DESC LIMIT 500",["pending_review","teacher","pending_review","approved","rejected","auto_converted","rejected_pending_conversion"]);const actor=req.currentUser!;const applications=(isOwner(actor)||isAdmin(actor))?r.rows:r.rows.filter((row:any)=>canModerateUser(actor,{role:row.role,isManager:row.is_manager,managerLevel:row.manager_level})).map(({role,is_manager,manager_level,...row}:any)=>row);res.json({reviewDurationDays:days,applications})});
router.post("/survey/submit",async(req,res)=>{
 await ensure();
 const actor=req.currentUser!;
 if(normalizeRole(actor.role)!=="teacher"){res.status(403).json({error:"Teacher account required."});return;}
 await pool.query("CREATE TABLE IF NOT EXISTS teacher_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, cv jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now())");
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const profile=await client.query("SELECT cv FROM teacher_profiles WHERE user_id=$1 FOR UPDATE",[actor.id]);
  if(!profile.rows.length){await client.query("ROLLBACK");res.status(409).json({error:"Save your readiness survey answers before submitting it."});return;}
  const cv=profile.rows[0].cv&&typeof profile.rows[0].cv==="object"?profile.rows[0].cv:{};
  let answers:any={};
  try{answers=typeof cv.surveyAnswers==="string"?JSON.parse(cv.surveyAnswers):cv.surveyAnswers||{};}catch{answers={};}
  // Readiness answers are optional; incomplete answers must not block submission.
  if(cv.surveySubmittedAt){await client.query("COMMIT");res.json({submitted:true,alreadySubmitted:true,submittedAt:cv.surveySubmittedAt});return;}
  const submittedAt=new Date().toISOString();
  const nextCv={...cv,surveySubmittedAt:submittedAt,surveyReviewStatus:"pending",surveyReviewNote:null,surveyReviewedAt:null,surveyReviewedBy:null};
  await client.query("UPDATE teacher_profiles SET cv=$2::jsonb,updated_at=now() WHERE user_id=$1",[actor.id,JSON.stringify(nextCv)]);
  const current=await client.query("SELECT COALESCE(teacher_application_status,'draft') AS status FROM users WHERE id=$1",[actor.id]);
  const status=String(current.rows[0]?.status||"draft");
  await client.query("INSERT INTO teacher_cv_review_history(teacher_id,action,previous_status,new_status,note) VALUES($1,'survey_submitted',$2,$2,'Readiness survey submitted independently')",[actor.id,status]);
  await client.query("COMMIT");
  const surveyTitle="Teacher readiness survey submitted";
  const surveyMessage=(actor.name||"A teacher applicant")+" submitted a readiness survey for review. Open the Teacher CV Approval Workspace to inspect the answers.";
  let surveyReviewers:any[]=[];
  try{
   const reviewers=await pool.query(
    "SELECT DISTINCT u.id,u.role,u.is_manager,u.manager_level FROM users u LEFT JOIN manager_permission_grants view_grant ON view_grant.manager_user_id=u.id AND view_grant.permission_key='teacher_cv.view' AND view_grant.granted=true LEFT JOIN manager_permission_grants review_grant ON review_grant.manager_user_id=u.id AND review_grant.permission_key='teacher_cv.review' AND review_grant.granted=true LEFT JOIN manager_permission_grants authorize_grant ON authorize_grant.manager_user_id=u.id AND authorize_grant.permission_key='teacher_cv.authorize' AND authorize_grant.granted=true WHERE (lower(u.role) IN ('owner','platform_owner','admin') OR (view_grant.manager_user_id IS NOT NULL AND (lower(u.role) IN ('senior_manager','manager','junior_manager') OR lower(u.role)='teacher' AND u.is_manager=true AND lower(COALESCE(u.manager_level,'junior')) IN ('junior','senior') AND COALESCE(u.teacher_application_status,'') NOT IN ('draft','pending_review','rejected_pending_conversion')))) AND COALESCE(u.is_blocked,false)=false AND COALESCE(u.is_suspended,false)=false"
   );
   surveyReviewers=reviewers.rows.filter((reviewer:any)=>Number(reviewer.id)!==actor.id&&(isOwner(reviewer)||isAdmin(reviewer)||canModerateUser({role:reviewer.role,isManager:reviewer.is_manager,managerLevel:reviewer.manager_level},{role:actor.role,isManager:actor.isManager,managerLevel:actor.managerLevel})));
  }catch(error){console.error("[teacher-cv] Survey reviewer lookup failed after submission.",error instanceof Error?error.message:"unknown");}
  try{await db.insert(notificationsTable).values([
   {recipientId:actor.id,title:surveyTitle,message:"Your readiness survey was submitted independently. Your CV application and teaching permissions have not changed.",link:"/profile-hub",type:"teacher_survey_submission"},
   ...surveyReviewers.map((reviewer:any)=>({recipientId:Number(reviewer.id),title:surveyTitle,message:surveyMessage,link:["owner","platform_owner","admin"].includes(String(reviewer.role||"").toLowerCase())?"/admin/teacher-cv-workspace":"/manager/teacher-cv-workspace",type:"teacher_survey_submission"}))
  ]);}catch(error){console.error("[teacher-cv] Survey submission in-app notification failed.",error instanceof Error?error.message:"unknown");}
  await Promise.allSettled([actor.id,...surveyReviewers.map((r:any)=>Number(r.id))].map(recipientId=>enqueueEmailNotification(recipientId,"Dallyletter Elidems — "+surveyTitle,recipientId===actor.id?"Your readiness survey was submitted. This is separate from your CV application; teaching permissions remain unchanged.":surveyMessage+" Sign in to review it.")));
  res.json({submitted:true,alreadySubmitted:false,submittedAt,reviewerCount:surveyReviewers.length});
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}
 finally{client.release();}
});

router.post("/:teacherId/survey/decision",requireManagerPermission("teacher_cv.review"),async(req,res)=>{
 const id=idOf(req.params.teacherId),action=String(req.body?.action||""),note=typeof req.body?.note==="string"?req.body.note.trim().slice(0,2000):"";
 if(!id||!["approve","reject"].includes(action)){res.status(400).json({error:"Choose approve or reject for a valid survey submission."});return;}
 if(action==="reject"&&note.length<3){res.status(400).json({error:"A clear survey rejection reason of at least 3 characters is required."});return;}
 if(!canReview(req.currentUser)){res.status(403).json({error:"Only Owner or Senior Manager can review submitted readiness surveys."});return;}
 await ensure();
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const target=await client.query("SELECT u.name,u.role,u.is_manager,u.manager_level,tp.cv FROM users u JOIN teacher_profiles tp ON tp.user_id=u.id WHERE u.id=$1 AND lower(u.role)='teacher' FOR UPDATE OF u,tp",[id]);
  if(!target.rows.length||(!isOwner(req.currentUser)&&!isAdmin(req.currentUser)&&!canModerateUser(req.currentUser!,{role:target.rows[0].role,isManager:target.rows[0].is_manager,managerLevel:target.rows[0].manager_level}))){await client.query("ROLLBACK");res.status(404).json({error:"Submitted readiness survey not found."});return;}
  const cv=target.rows[0].cv&&typeof target.rows[0].cv==="object"?target.rows[0].cv:{};
  if(!cv.surveySubmittedAt){await client.query("ROLLBACK");res.status(404).json({error:"Readiness survey has not been submitted."});return;}
  const nextStatus=action==="approve"?"approved":"rejected";
  if(cv.surveyReviewStatus===nextStatus){await client.query("COMMIT");res.json({reviewed:true,alreadyReviewed:true,status:nextStatus});return;}
  if(cv.surveyReviewStatus && cv.surveyReviewStatus!=="pending"){await client.query("ROLLBACK");res.status(409).json({error:"This readiness survey has already received a decision."});return;}
  const nextCv={...cv,surveyReviewStatus:nextStatus,surveyReviewNote:note||null,surveyReviewedAt:new Date().toISOString(),surveyReviewedBy:req.currentUser!.id};
  await client.query("UPDATE teacher_profiles SET cv=$2::jsonb,updated_at=now() WHERE user_id=$1",[id,JSON.stringify(nextCv)]);
  await client.query("INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) VALUES($1,$2,$3,'survey_pending',$4,$5)",[id,req.currentUser!.id,action==="approve"?"survey_approved":"survey_rejected",nextStatus,note||null]);
  await client.query("COMMIT");
  const title=action==="approve"?"Readiness survey approved":"Readiness survey needs changes";
  const message=action==="approve"?"Your readiness survey has been approved. This does not by itself authorize teaching; your CV application must also be approved.":"Your readiness survey was not approved. Review the note in your Profile Hub and contact the reviewer if clarification is needed. Your CV application status has not changed.";
  try{await db.insert(notificationsTable).values({recipientId:id,title,message,link:"/profile-hub",type:"teacher_survey_decision"});}catch(error){console.error("[teacher-cv] Survey decision notification failed.",error instanceof Error?error.message:"unknown");}
  try{await enqueueEmailNotification(id,"Dallyletter Elidems — "+title,message+(note?" Reviewer note: "+note:""));}catch(error){console.error("[teacher-cv] Survey decision email queue failed.",error instanceof Error?error.message:"unknown");}
  res.json({reviewed:true,status:nextStatus,notificationQueued:true});
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}
 finally{client.release();}
});

router.post("/submit",async(req,res)=>{
 const actor=req.currentUser!;
 if(normalizeRole(actor.role)!=="teacher"){res.status(403).json({error:"Only the applying teacher can submit this application"});return;}
 await ensure();
 await pool.query("CREATE TABLE IF NOT EXISTS teacher_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, cv jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now())");
 // Attachments, qualifications, and profile completeness are optional. A saved
 // incomplete CV remains eligible for submission and owner review.
 const reviewSetting=await pool.query("SELECT review_duration_days FROM teacher_cv_workflow_settings WHERE id=1");
 const configuredDays=Number(reviewSetting.rows[0]?.review_duration_days||30);
 const reviewDays=Number.isInteger(configuredDays)&&configuredDays>=1&&configuredDays<=365?configuredDays:30;
 // Serialize submissions for this account. The status transition and submission history
  // commit together, so a draft cannot appear in the reviewer queue before it is submitted.
  const submissionClient=await pool.connect();
  let alreadySubmitted=false;
  try{
   await submissionClient.query("BEGIN");
   const current=await submissionClient.query("SELECT teacher_application_status FROM users WHERE id=$1 AND lower(role)='teacher' FOR UPDATE",[actor.id]);
   if(!current.rows.length){await submissionClient.query("ROLLBACK");res.status(404).json({error:"Teacher account not found"});return;}
   const previousStatus=String(current.rows[0].teacher_application_status||"draft");
   if(["approved","rejected_pending_conversion","auto_converted"].includes(previousStatus)){
    await submissionClient.query("ROLLBACK");res.status(409).json({error:"This teacher application is no longer eligible for submission."});return;
   }
   const priorSubmission=await submissionClient.query("SELECT id FROM teacher_cv_review_history WHERE teacher_id=$1 AND action='submitted' LIMIT 1",[actor.id]);
   if(priorSubmission.rows.length){
    await submissionClient.query("UPDATE users SET teacher_application_status='pending_review',teacher_review_deadline=COALESCE((SELECT max(h.created_at) FROM teacher_cv_review_history h WHERE h.teacher_id=users.id AND h.action='submitted'),now())+make_interval(days=>$2) WHERE id=$1 AND lower(role)='teacher'",[actor.id,reviewDays]);
    alreadySubmitted=true;
   }else{
    const statusUpdate=await submissionClient.query("UPDATE users SET teacher_application_status='pending_review',teacher_review_deadline=now()+make_interval(days=>$2) WHERE id=$1 AND lower(role)='teacher' AND COALESCE(teacher_application_status,'draft') IN ('draft','pending_review','not_applicable') RETURNING id",[actor.id,reviewDays]);
    if(!statusUpdate.rows.length){await submissionClient.query("ROLLBACK");res.status(409).json({error:"Teacher application status changed before submission. Refresh and try again."});return;}
    await submissionClient.query(
     "INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) VALUES($1,NULL,'submitted',$2,'pending_review','CV submission persisted. Notifications are best-effort and do not control workflow.')",
     [actor.id,previousStatus]
    );
   }
   await submissionClient.query("COMMIT");
  }catch(error){await submissionClient.query("ROLLBACK").catch(()=>undefined);throw error;}
  finally{submissionClient.release();}
  if(alreadySubmitted){res.json({submitted:true,alreadySubmitted:true,status:"pending_review",message:"Your application has already been submitted and is awaiting review."});return;}
  // Notification delivery follows the committed submission and cannot undo it.
  let reviewerRows:any[]=[];
 try{
  const reviewerResult=await pool.query(
    "SELECT DISTINCT u.id,u.role FROM users u LEFT JOIN manager_permission_grants view_grant ON view_grant.manager_user_id=u.id AND view_grant.permission_key='teacher_cv.view' AND view_grant.granted=true LEFT JOIN manager_permission_grants review_grant ON review_grant.manager_user_id=u.id AND review_grant.permission_key='teacher_cv.review' AND review_grant.granted=true LEFT JOIN manager_permission_grants authorize_grant ON authorize_grant.manager_user_id=u.id AND authorize_grant.permission_key='teacher_cv.authorize' AND authorize_grant.granted=true WHERE (lower(u.role) IN ('owner','platform_owner','admin') OR (view_grant.manager_user_id IS NOT NULL AND (lower(u.role) IN ('senior_manager','manager','junior_manager') OR lower(u.role)='teacher' AND u.is_manager=true AND lower(COALESCE(u.manager_level,'junior')) IN ('junior','senior') AND COALESCE(u.teacher_application_status,'') NOT IN ('draft','pending_review','rejected_pending_conversion')))) AND COALESCE(u.is_blocked,false)=false AND COALESCE(u.is_suspended,false)=false"
  );
  reviewerRows=reviewerResult.rows.filter((reviewer:any)=>Number(reviewer.id)!==actor.id&&(isOwner(reviewer)||isAdmin(reviewer)||canModerateUser({role:reviewer.role,isManager:reviewer.is_manager,managerLevel:reviewer.manager_level},{role:actor.role,isManager:actor.isManager,managerLevel:actor.managerLevel})));
 }catch(error){
  // The persisted CV submission is still valid when reviewer-notification lookup is temporarily unavailable.
  console.error("[teacher-cv] Reviewer lookup failed after submission was saved.",error instanceof Error?error.message:"unknown");
 }
 const reviewerIds=reviewerRows.map((r:any)=>Number(r.id)).filter((id:number)=>Number.isSafeInteger(id)&&id>0);
 const title="Teacher CV submitted for review";
 const message=(actor.name||"A teacher applicant")+" submitted a CV and supporting documents. Open the Teacher CV Approval Workspace to review the full application.";
 try{
  await db.insert(notificationsTable).values([
   {recipientId:actor.id,title,message:"Your CV and supporting documents were submitted. You can follow the application from your Profile Hub.",link:"/profile-hub",type:"teacher_cv_submission"},
   ...reviewerRows.map((reviewer:any)=>({recipientId:Number(reviewer.id),title,message,link:["owner","platform_owner"].includes(String(reviewer.role||"").toLowerCase())?"/admin/teacher-cv-workspace":"/manager/teacher-cv-workspace",type:"teacher_cv_submission"}))
  ]);
 }catch(error){console.error("[teacher-cv] In-app submission notification failed; CV remains submitted.",error instanceof Error?error.message:"unknown");}
 const emailTargets=[actor.id,...reviewerIds];
 const emailResults=await Promise.allSettled(emailTargets.map(recipientId=>enqueueEmailNotification(
  recipientId,
  "Dallyletter Elidems — teacher CV submitted",
  recipientId===actor.id
   ?"Your teacher CV and supporting documents have been submitted. Your account remains active. Teaching permissions remain restricted until an authorized approval."
   :message+" Sign in to Dallyletter Elidems and open the Teacher CV Approval Workspace."
 )));
 res.json({
  submitted:true,status:"pending_review",reviewerCount:reviewerIds.length,
  notificationsQueued:emailResults.filter(r=>r.status==="fulfilled").length,
  message:"Your CV and supporting documents have been saved and submitted for review. Notification delivery will be attempted separately and cannot block your application."
 });
});
router.get("/:teacherId/details",requireManagerPermission("teacher_cv.view"),async(req,res)=>{const id=idOf(req.params.teacherId);if(!id){res.status(400).json({error:"Invalid teacher id"});return}await ensure();await pool.query("CREATE TABLE IF NOT EXISTS teacher_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, cv jsonb NOT NULL DEFAULT jsonb_build_object(), updated_at timestamptz NOT NULL DEFAULT now())");const [u,d,c,h,q]=await Promise.all([pool.query("SELECT id,name,email,phone,role,is_manager,manager_level,created_at,COALESCE(teacher_application_status,'pending_review') AS teacher_application_status FROM users WHERE id=$1 AND lower(role)='teacher'",[id]),pool.query("SELECT id,document_type,file_name,mime_type,size_bytes,created_at FROM teacher_documents WHERE user_id=$1 ORDER BY created_at DESC",[id]),pool.query("SELECT cv,updated_at FROM teacher_profiles WHERE user_id=$1",[id]),pool.query("SELECT h.action,h.previous_status,h.new_status,h.note,h.created_at,u.name reviewer_name FROM teacher_cv_review_history h LEFT JOIN users u ON u.id=h.reviewer_id WHERE h.teacher_id=$1 ORDER BY h.created_at DESC LIMIT 100",[id]),pool.query("SELECT q.id,q.title,q.institution,q.year,q.verification_status,q.document_id,d.file_name AS document_file_name,d.mime_type AS document_mime_type FROM teacher_qualifications q LEFT JOIN teacher_documents d ON d.id=q.document_id AND d.user_id=q.user_id WHERE q.user_id=$1 ORDER BY q.created_at ASC",[id])]);const hasCvSubmission=h.rows.some((item:any)=>item.action==="submitted");const cvValue=c.rows[0]?.cv&&typeof c.rows[0].cv==="object"?c.rows[0].cv:{};const hasSurveySubmission=Boolean(cvValue.surveySubmittedAt);if(!u.rows.length || (!hasCvSubmission&&!hasSurveySubmission) || (!isOwner(req.currentUser) && !isAdmin(req.currentUser) && (!canModerateUser(req.currentUser!,{role:u.rows[0].role,isManager:u.rows[0].is_manager,managerLevel:u.rows[0].manager_level}) || (hasCvSubmission&&!["pending_review","not_applicable"].includes(String(u.rows[0].teacher_application_status||"pending_review")))))){res.status(404).json({error:"Teacher application or submitted readiness survey not found"});return}const {role,is_manager,manager_level,...teacher}=u.rows[0];res.json({teacher,documents:d.rows,qualifications:q.rows,cv:c.rows[0]?.cv||{},history:h.rows})});
router.post("/:teacherId/decision",requireManagerPermissionForRequest((req)=>req.body?.action==="approve"?"teacher_cv.authorize":"teacher_cv.review"),async(req,res)=>{
 if(!canReview(req.currentUser)){res.status(403).json({error:"Only Owner or Senior Manager can decide teacher applications"});return;}
 const id=idOf(req.params.teacherId),action=String(req.body?.action||""),note=typeof req.body?.note==="string"?req.body.note.trim().slice(0,2000):"";
 if(!id||!["approve","reject"].includes(action)){res.status(400).json({error:"Invalid decision"});return;}
 await ensure();
 const q=await pool.query("SELECT id,name,email,role,is_manager,manager_level,teacher_application_status FROM users WHERE id=$1",[id]);
 const t=q.rows[0];
 const submitted=await pool.query("SELECT 1 FROM teacher_cv_review_history WHERE teacher_id=$1 AND action='submitted' LIMIT 1",[id]);
 if(!t||normalizeRole(t.role)!=="teacher"||!submitted.rows.length||(!isOwner(req.currentUser)&&!isAdmin(req.currentUser)&&!canModerateUser(req.currentUser!,{role:t.role,isManager:t.is_manager,managerLevel:t.manager_level}))){res.status(404).json({error:"Teacher application not found"});return;}
 // Do not block authorization because a resume, photo, qualification,
 // certificate, or optional profile field has not been supplied.
 const client=await pool.connect();
 let conversionDeadline:string|null=null;
 try{
  await client.query("BEGIN");
  if(action==="approve"){
   const updated=await client.query("UPDATE users SET role='teacher',teacher_application_status='approved',teacher_review_deadline=NULL,updated_at=now() WHERE id=$1 AND lower(role)='teacher' AND COALESCE(teacher_application_status,'not_applicable') IN ('pending_review','not_applicable') RETURNING id,role,teacher_application_status",[id]);
    if(!updated.rows.length){await client.query("ROLLBACK");res.status(409).json({error:"This application is no longer awaiting a decision."});return;}
   await client.query("INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) VALUES($1,$2,'approved',$3,'approved',$4)",[id,req.currentUser!.id,t.teacher_application_status||"pending_review",note||null]);
   // The same Approve/Reject action updates the submitted survey when present.
   await client.query("UPDATE teacher_profiles SET cv=jsonb_set(cv,'{surveyReviewStatus}',to_jsonb($2::text),true) || jsonb_build_object('surveyReviewNote',$3,'surveyReviewedAt',now()::text,'surveyReviewedBy',$4),updated_at=now() WHERE user_id=$1 AND cv ? 'surveySubmittedAt' AND COALESCE(cv->>'surveyReviewStatus','pending')='pending'",[id,action==="approve"?"approved":"rejected",note||null,req.currentUser!.id]);
   await client.query("INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) SELECT $1,$2,$3,'survey_pending',$4,$5 FROM teacher_profiles WHERE user_id=$1 AND cv ? 'surveySubmittedAt' AND cv->>'surveyReviewStatus'=$4",[id,req.currentUser!.id,action==="approve"?"survey_approved":"survey_rejected",action==="approve"?"approved":"rejected",note||null]);
  }else{
   const setting=await client.query("SELECT review_duration_days FROM teacher_cv_workflow_settings WHERE id=1");
   const days=Number(setting.rows[0]?.review_duration_days||30);
   const safeDays=Number.isInteger(days)&&days>=1&&days<=365?days:30;
   const deadline=await client.query("UPDATE users SET teacher_application_status='rejected_pending_conversion',teacher_review_deadline=now()+make_interval(days=>$2),is_manager=false,is_prefect=false WHERE id=$1 AND lower(role)='teacher' AND COALESCE(teacher_application_status,'not_applicable') IN ('pending_review','not_applicable') RETURNING teacher_review_deadline",[id,safeDays]);
    if(!deadline.rows.length){await client.query("ROLLBACK");res.status(409).json({error:"This application is no longer awaiting a decision."});return;}
   conversionDeadline=deadline.rows[0]?.teacher_review_deadline?new Date(deadline.rows[0].teacher_review_deadline).toISOString():null;
   await client.query("INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) VALUES($1,$2,'rejected',$3,'rejected_pending_conversion',$4)",[id,req.currentUser!.id,t.teacher_application_status||"pending_review",note||null]);
   await client.query("UPDATE teacher_profiles SET cv=jsonb_set(cv,'{surveyReviewStatus}',to_jsonb('rejected'::text),true) || jsonb_build_object('surveyReviewNote',$2,'surveyReviewedAt',now()::text,'surveyReviewedBy',$3),updated_at=now() WHERE user_id=$1 AND cv ? 'surveySubmittedAt' AND COALESCE(cv->>'surveyReviewStatus','pending')='pending'",[id,note||null,req.currentUser!.id]);
   await client.query("INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) SELECT $1,$2,'survey_rejected','survey_pending','rejected',$3 FROM teacher_profiles WHERE user_id=$1 AND cv ? 'surveySubmittedAt' AND cv->>'surveyReviewStatus'='rejected'",[id,req.currentUser!.id,note||null]);
  }
  await client.query("COMMIT");
 }catch(e){await client.query("ROLLBACK").catch(()=>undefined);throw e;}finally{client.release();}
 const title=action==="approve"?"Teacher application approved":"Teacher application not approved";
 const message=action==="approve"
  ?"Your teacher CV has been approved. Your teacher permissions are now active. Sign in again if your dashboard has not refreshed."
  :"Your teacher CV was not approved. Your account and login remain active, but teaching permissions are disabled. Your account is scheduled to become a learner after "+(conversionDeadline?new Date(conversionDeadline).toLocaleString():"the configured conversion period")+".";
 try{await db.insert(notificationsTable).values({recipientId:id,title,message,link:action==="approve"?"/teacher":"/profile-hub",type:"teacher_cv_decision"});}catch(error){console.error("[teacher-cv] Decision notification failed; decision remains saved.",error instanceof Error?error.message:"unknown");}
 try{await enqueueEmailNotification(id,"Dallyletter Elidems — "+title,message);}catch(error){console.error("[teacher-cv] Decision email queue failed; decision remains saved.",error instanceof Error?error.message:"unknown");}
 res.json({
  status:action==="approve"?"approved":"rejected_pending_conversion",
  role:"teacher",
  teacherApplicationStatus:action==="approve"?"approved":"rejected_pending_conversion",
  dashboardPath:action==="approve"?"/teacher":"/profile-hub",
  conversionDeadline,
  message:action==="approve"?"Teacher approved and authorized. The teacher role, full teacher dashboard and teaching API permissions are now active.":"Teaching access denied. The account remains usable and will convert to a learner on the scheduled date."
 });
});

async function authorizeCvMutation(actor:any,teacherId:number){
 if(Number(actor?.id)===teacherId) return true;
 if(isOwner(actor)||isAdmin(actor)) return true;
 const target=await pool.query("SELECT role,is_manager,manager_level FROM users WHERE id=$1 AND lower(role)='teacher'",[teacherId]);
 return Boolean(target.rows[0]&&canAccessManager(actor)&&canModerateUser(actor,{role:target.rows[0].role,isManager:target.rows[0].is_manager,managerLevel:target.rows[0].manager_level}));
}
router.delete("/:teacherId/cv",requireManagerPermissionIfManager("teacher_cv.view"),async(req,res)=>{
 const id=idOf(req.params.teacherId); if(!id){res.status(400).json({error:"Invalid teacher id"});return;}
 if(!await authorizeCvMutation(req.currentUser!,id)){res.status(403).json({error:"You are not authorized to delete this CV"});return;}
 await ensure(); const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const target=await client.query("SELECT id FROM users WHERE id=$1 AND lower(role)='teacher' FOR UPDATE",[id]);
  if(!target.rows.length){await client.query("ROLLBACK");res.status(404).json({error:"Teacher CV owner not found"});return;}
  await client.query("DELETE FROM teacher_qualifications WHERE user_id=$1",[id]);
  await client.query("DELETE FROM teacher_documents WHERE user_id=$1",[id]);
  await client.query("UPDATE teacher_profiles SET cv=(cv - 'professionalSummary' - 'education' - 'experience' - 'subjects' - 'address' - 'personalDetails' - 'teachingDetails' - 'photoDocumentId' - 'certifications'),updated_at=now() WHERE user_id=$1",[id]);
  await client.query("UPDATE teacher_cv_review_history SET action='cv_submission_superseded' WHERE teacher_id=$1 AND action='submitted'",[id]);
  await client.query("UPDATE users SET teacher_application_status='draft',teacher_review_deadline=NULL,updated_at=now() WHERE id=$1 AND teacher_application_status='pending_review'",[id]);
  await client.query("INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) VALUES($1,$2,'cv_deleted','existing','deleted','CV deleted by authorized account holder; survey data and review audit retained')",[id,req.currentUser!.id]);
  await client.query("COMMIT"); res.json({deleted:true,scope:"cv",surveyPreserved:true,reviewHistoryPreserved:true});
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
});
router.delete("/:teacherId/survey",requireManagerPermissionIfManager("teacher_cv.view"),async(req,res)=>{
 const id=idOf(req.params.teacherId); if(!id){res.status(400).json({error:"Invalid teacher id"});return;}
 if(!await authorizeCvMutation(req.currentUser!,id)){res.status(403).json({error:"You are not authorized to delete this survey"});return;}
 await ensure(); const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const updated=await client.query("UPDATE teacher_profiles SET cv=cv - 'surveyAnswers' - 'surveySubmittedAt' - 'surveyReviewStatus' - 'surveyReviewNote' - 'surveyReviewedAt' - 'surveyReviewedBy',updated_at=now() WHERE user_id=$1 RETURNING user_id",[id]);
  if(!updated.rows.length){await client.query("ROLLBACK");res.status(404).json({error:"Survey not found"});return;}
  await client.query("INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) VALUES($1,$2,'survey_deleted','existing','deleted','Readiness survey deleted by authorized account holder')",[id,req.currentUser!.id]);
  await client.query("COMMIT"); res.json({deleted:true,scope:"survey",cvPreserved:true});
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
});

router.delete("/bulk/:scope",requireManagerPermissionIfManager("teacher_cv.view"),async(req,res)=>{
 const scope=String(req.params.scope||""); const ids=Array.isArray(req.body?.teacherIds)?[...new Set(req.body.teacherIds.map(idOf).filter(Boolean))] as number[]:[];
 if(!["cv","survey"].includes(scope)||!ids.length||ids.length>100){res.status(400).json({error:"Choose CV or survey and provide 1–100 valid teacher IDs."});return;}
 const allowed=await Promise.all(ids.map(async id=>({id,allowed:await authorizeCvMutation(req.currentUser!,id)})));
 const denied=allowed.filter(x=>!x.allowed).map(x=>x.id); if(denied.length){res.status(403).json({error:"One or more selected applications are outside your monitoring scope.",deniedTeacherIds:denied});return;}
 await ensure(); const client=await pool.connect(); const deleted:number[]=[];
 try{
  await client.query("BEGIN");
  for(const id of ids){
   const target=await client.query("SELECT id FROM users WHERE id=$1 AND lower(role)='teacher' FOR UPDATE",[id]); if(!target.rows.length)continue;
   if(scope==="cv"){
    await client.query("DELETE FROM teacher_qualifications WHERE user_id=$1",[id]); await client.query("DELETE FROM teacher_documents WHERE user_id=$1",[id]);
    await client.query("UPDATE teacher_profiles SET cv=cv - 'professionalSummary' - 'education' - 'experience' - 'subjects' - 'address' - 'personalDetails' - 'teachingDetails' - 'photoDocumentId' - 'certifications',updated_at=now() WHERE user_id=$1",[id]);
    await client.query("UPDATE teacher_cv_review_history SET action='cv_submission_superseded' WHERE teacher_id=$1 AND action='submitted'",[id]);
    await client.query("UPDATE users SET teacher_application_status='draft',teacher_review_deadline=NULL,updated_at=now() WHERE id=$1 AND teacher_application_status='pending_review'",[id]);
   }else{
    await client.query("UPDATE teacher_profiles SET cv=cv - 'surveyAnswers' - 'surveySubmittedAt' - 'surveyReviewStatus' - 'surveyReviewNote' - 'surveyReviewedAt' - 'surveyReviewedBy',updated_at=now() WHERE user_id=$1",[id]);
   }
   await client.query("INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) VALUES($1,$2,$3,'existing','deleted',$4)",[id,req.currentUser!.id,scope+"_deleted","Bulk "+scope+" deletion by authorized reviewer"]);
   deleted.push(id);
  }
  await client.query("COMMIT"); res.json({deleted:true,scope,deletedTeacherIds:deleted,count:deleted.length});
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}finally{client.release();}
});
router.get("/:teacherId/history",requireManagerPermissionIfManager("teacher_cv.view"),async(req,res)=>{
 const id=idOf(req.params.teacherId);if(!id){res.status(400).json({error:"Invalid teacher id"});return}
 const actor=req.currentUser!;
 if(actor.id!==id&&!isOwner(actor)&&!isAdmin(actor)){
  const target=await pool.query("SELECT role,is_manager,manager_level,COALESCE(teacher_application_status,'pending_review') AS teacher_application_status FROM users WHERE id=$1 AND lower(role)='teacher'",[id]);
  const submitted=await pool.query("SELECT 1 FROM teacher_cv_review_history WHERE teacher_id=$1 AND action='submitted' LIMIT 1",[id]);
  if(!target.rows.length||!["pending_review","not_applicable"].includes(String(target.rows[0].teacher_application_status||"pending_review"))||!submitted.rows.length||!canAccessManager(actor)||!canModerateUser(actor,{role:target.rows[0].role,isManager:target.rows[0].is_manager,managerLevel:target.rows[0].manager_level})){res.status(404).json({error:"Application history not found"});return}
 }
 await ensure();
 const result=await pool.query("SELECT h.action,h.previous_status,h.new_status,h.note,h.created_at,u.name reviewer_name FROM teacher_cv_review_history h LEFT JOIN users u ON u.id=h.reviewer_id WHERE h.teacher_id=$1 ORDER BY h.created_at DESC LIMIT 100",[id]);
 res.json({history:result.rows});
});
router.get("/:teacherId/chat",requireManagerPermissionIfManager("teacher_cv.chat"),async(req,res)=>{const id=idOf(req.params.teacherId);if(!id){res.status(400).json({error:"Invalid teacher id"});return}const actor=req.currentUser!,role=normalizeRole(actor.role);if(!canAccessManager(actor)&&!(actor.id===id&&role==="teacher")){res.status(403).json({error:"Application chat access denied"});return}await ensure();const target=await pool.query("SELECT role,is_manager,manager_level FROM users WHERE id=$1 AND lower(role)='teacher'",[id]);if(!target.rows.length||(actor.id!==id&&!isOwner(actor)&&!canModerateUser(actor,{role:target.rows[0].role,isManager:target.rows[0].is_manager,managerLevel:target.rows[0].manager_level}))){res.status(404).json({error:"Application chat is closed"});return}const r=await pool.query("SELECT m.id,m.sender_id,m.body,m.created_at,u.name sender_name,u.role sender_role FROM teacher_cv_chat_messages m JOIN users u ON u.id=m.sender_id WHERE m.teacher_id=$1 ORDER BY m.created_at ASC LIMIT 500",[id]);res.json(r.rows)});
router.post("/:teacherId/chat",requireManagerPermissionIfManager("teacher_cv.chat"),async(req,res)=>{
 const id=idOf(req.params.teacherId),body=typeof req.body?.body==="string"?req.body.body.trim():"";
 if(!id||!body||body.length>4000){res.status(400).json({error:"Message must contain 1–4000 characters"});return}
 const actor=req.currentUser!,role=normalizeRole(actor.role);
 if(!canAccessManager(actor)&&!(actor.id===id&&role==="teacher")){res.status(403).json({error:"Application chat access denied"});return}
 await ensure();
 const target=await pool.query("SELECT id,role,is_manager,manager_level FROM users WHERE id=$1 AND lower(role)='teacher'",[id]);
 if(!target.rows.length||(actor.id!==id&&!isOwner(actor)&&!canModerateUser(actor,{role:target.rows[0].role,isManager:target.rows[0].is_manager,managerLevel:target.rows[0].manager_level}))){res.status(404).json({error:"Application chat is closed"});return}
 const r=await pool.query("INSERT INTO teacher_cv_chat_messages(teacher_id,sender_id,body) VALUES($1,$2,$3) RETURNING id,sender_id,body,created_at",[id,actor.id,body]);
 let recipients:number[]=[];
 if(actor.id!==id){recipients=[id];}
 else{
  const reviewerResult=await pool.query("SELECT DISTINCT u.id,u.role,u.is_manager,u.manager_level FROM users u LEFT JOIN manager_permission_grants view_grant ON view_grant.manager_user_id=u.id AND view_grant.permission_key='teacher_cv.view' AND view_grant.granted=true LEFT JOIN manager_permission_grants chat_grant ON chat_grant.manager_user_id=u.id AND chat_grant.permission_key='teacher_cv.chat' AND chat_grant.granted=true WHERE (lower(u.role) IN ('owner','platform_owner','admin') OR (view_grant.manager_user_id IS NOT NULL AND chat_grant.manager_user_id IS NOT NULL AND (lower(u.role) IN ('manager','senior_manager') OR lower(u.role)='teacher' AND u.is_manager=true AND COALESCE(u.teacher_application_status,'') NOT IN ('draft','pending_review','rejected_pending_conversion')))) AND COALESCE(u.is_blocked,false)=false AND COALESCE(u.is_suspended,false)=false");
  recipients=reviewerResult.rows.filter((reviewer:any)=>Number(reviewer.id)!==id&&(isOwner(reviewer)||isAdmin(reviewer)||canModerateUser({role:reviewer.role,isManager:reviewer.is_manager,managerLevel:reviewer.manager_level},{role:target.rows[0].role,isManager:target.rows[0].is_manager,managerLevel:target.rows[0].manager_level}))).map((reviewer:any)=>Number(reviewer.id));
 }
 const title="New teacher application message";
 const message=(actor.id===id?(actor.name||"The teacher applicant"):(actor.name||"A Dallyletter reviewer"))+" sent a message in the teacher application conversation: "+body.slice(0,1000);
 for(const recipientId of recipients){
  try{await db.insert(notificationsTable).values({recipientId,title,message,link:recipientId===id?"/profile-hub":"/manager/teacher-cv-workspace?teacherId="+id,type:"teacher_cv_message"});}catch(error){console.error("[teacher-cv] Chat notification failed.",error instanceof Error?error.message:"unknown");}
 }
 const emailResults=await Promise.allSettled(recipients.map(recipientId=>enqueueEmailNotification(recipientId,"Dallyletter Elidems — "+title,message)));
 res.status(201).json({...r.rows[0],notificationsQueued:recipients.length,emailNotificationsQueued:emailResults.filter(result=>result.status==="fulfilled").length});
});
if(process.env.NODE_ENV==="test"){router.post("/__test/process-expired",async(req,res)=>{if(!isOwner(req.currentUser)){res.status(403).json({error:"Owner access required"});return}await processExpiredTeacherApplications();res.json({processed:true})})}

export default router;