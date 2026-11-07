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
function canReview(u:any){return isSeniorManager(u)}
function isOwner(u:any){return ["owner","platform_owner"].includes(normalizeRole(u?.role))}
function idOf(v:unknown){const n=Number(v);return Number.isSafeInteger(n)&&n>0?n:null}
router.use(requireAuth);
router.get("/config",requireManagerPermission("teacher_cv.view"),async(req,res)=>{if(!canReview(req.currentUser)){res.status(403).json({error:"Owner or Senior Manager access required"});return}await ensure();const r=await pool.query("SELECT review_duration_days,updated_at FROM teacher_cv_workflow_settings WHERE id=1");res.json({reviewDurationDays:(r.rows[0]?.review_duration_days==null?null:Number(r.rows[0].review_duration_days)),updatedAt:r.rows[0]?.updated_at||null,canEdit:isOwner(req.currentUser)})});
router.patch("/config",async(req,res)=>{if(!isOwner(req.currentUser)){res.status(403).json({error:"Only the Owner can set the review duration"});return}const days=Number(req.body?.reviewDurationDays);if(!Number.isInteger(days)||days<1||days>365){res.status(400).json({error:"Choose a whole number from 1 to 365 days"});return}await ensure();const r=await pool.query("UPDATE teacher_cv_workflow_settings SET review_duration_days=$1,updated_by=$2,updated_at=now() WHERE id=1 RETURNING review_duration_days,updated_at",[days,req.currentUser!.id]);await pool.query("UPDATE users SET teacher_review_deadline=created_at+make_interval(days=>$1) WHERE lower(role)=$2 AND teacher_application_status IN ($3,$4)",[days,"teacher","draft","pending_review"]);res.json({reviewDurationDays:r.rows[0].review_duration_days,updatedAt:r.rows[0].updated_at})});
router.get("/queue",requireManagerPermission("teacher_cv.view"),async(req,res)=>{await ensure();const s=await pool.query("SELECT review_duration_days FROM teacher_cv_workflow_settings WHERE id=1");const days=s.rows[0]?.review_duration_days==null?null:Number(s.rows[0].review_duration_days);const r=await pool.query("SELECT u.id,u.name,u.email,u.role,u.is_manager,u.manager_level,u.created_at,(SELECT max(h.created_at) FROM teacher_cv_review_history h WHERE h.teacher_id=u.id AND h.action='submitted') submitted_at,COALESCE(u.teacher_application_status,$1) status,u.teacher_review_deadline deadline,(u.teacher_review_deadline IS NOT NULL AND u.teacher_review_deadline<=now()) overdue,(SELECT count(*)::int FROM teacher_documents d WHERE d.user_id=u.id) document_count,(tp.cv->>'surveySubmittedAt') survey_submitted_at,COALESCE(tp.cv->>'surveyReviewStatus','pending') survey_review_status,EXISTS(SELECT 1 FROM teacher_cv_review_history submitted WHERE submitted.teacher_id=u.id AND submitted.action='submitted') has_cv_submission FROM users u LEFT JOIN teacher_profiles tp ON tp.user_id=u.id WHERE lower(u.role)=$2 AND ((COALESCE(u.teacher_application_status,$3) NOT IN ($4,$5,$6,$7) AND EXISTS (SELECT 1 FROM teacher_cv_review_history submitted WHERE submitted.teacher_id=u.id AND submitted.action='submitted')) OR (tp.cv->>'surveySubmittedAt' IS NOT NULL AND COALESCE(tp.cv->>'surveyReviewStatus','pending')='pending')) ORDER BY u.created_at ASC LIMIT 250",["pending_review","teacher","pending_review","approved","rejected","auto_converted","rejected_pending_conversion"]);const actor=req.currentUser!;const applications=isOwner(actor)?r.rows:r.rows.filter((row:any)=>canModerateUser(actor,{role:row.role,isManager:row.is_manager,managerLevel:row.manager_level})).map(({role,is_manager,manager_level,...row}:any)=>row);res.json({reviewDurationDays:days,applications})});
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
  const required=["laptop","smartphone","computer","online","internet","power","verificationCall"];
  const missing=required.filter(key=>!String(answers[key]??"").trim());
  if(!Array.isArray(answers.platforms)||!answers.platforms.some((value:any)=>String(value||"").trim()))missing.push("platforms");
  if(missing.length){await client.query("ROLLBACK");res.status(409).json({error:"Complete the required readiness survey answers before submitting the survey.",missingFields:missing});return;}
  if(cv.surveySubmittedAt){await client.query("COMMIT");res.json({submitted:true,alreadySubmitted:true,submittedAt:cv.surveySubmittedAt});return;}
  const submittedAt=new Date().toISOString();
  const nextCv={...cv,surveySubmittedAt:submittedAt,surveyReviewStatus:"pending",surveyReviewNote:null,surveyReviewedAt:null,surveyReviewedBy:null};
  await client.query("UPDATE teacher_profiles SET cv=$2::jsonb,updated_at=now() WHERE user_id=$1",[actor.id,JSON.stringify(nextCv)]);
  const current=await client.query("SELECT COALESCE(teacher_application_status,'draft') AS status FROM users WHERE id=$1",[actor.id]);
  const status=String(current.rows[0]?.status||"draft");
  await client.query("INSERT INTO teacher_cv_review_history(teacher_id,action,previous_status,new_status,note) VALUES($1,'survey_submitted',$2,$2,'Readiness survey submitted independently')",[actor.id,status]);
  await client.query("COMMIT");
  res.json({submitted:true,alreadySubmitted:false,submittedAt});
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
  const target=await client.query("SELECT u.role,u.is_manager,u.manager_level,tp.cv FROM users u JOIN teacher_profiles tp ON tp.user_id=u.id WHERE u.id=$1 AND lower(u.role)='teacher' FOR UPDATE OF u,tp",[id]);
  if(!target.rows.length||(!isOwner(req.currentUser)&&!canModerateUser(req.currentUser!,{role:target.rows[0].role,isManager:target.rows[0].is_manager,managerLevel:target.rows[0].manager_level}))){await client.query("ROLLBACK");res.status(404).json({error:"Submitted readiness survey not found."});return;}
  const cv=target.rows[0].cv&&typeof target.rows[0].cv==="object"?target.rows[0].cv:{};
  if(!cv.surveySubmittedAt){await client.query("ROLLBACK");res.status(404).json({error:"Readiness survey has not been submitted."});return;}
  const nextStatus=action==="approve"?"approved":"rejected";
  if(cv.surveyReviewStatus===nextStatus){await client.query("COMMIT");res.json({reviewed:true,alreadyReviewed:true,status:nextStatus});return;}
  if(cv.surveyReviewStatus!=="pending"){await client.query("ROLLBACK");res.status(409).json({error:"This readiness survey has already received a decision."});return;}
  const nextCv={...cv,surveyReviewStatus:nextStatus,surveyReviewNote:note||null,surveyReviewedAt:new Date().toISOString(),surveyReviewedBy:req.currentUser!.id};
  await client.query("UPDATE teacher_profiles SET cv=$2::jsonb,updated_at=now() WHERE user_id=$1",[id,JSON.stringify(nextCv)]);
  await client.query("INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) VALUES($1,$2,$3,'survey_pending',$4,$5)",[id,req.currentUser!.id,action==="approve"?"survey_approved":"survey_rejected",nextStatus,note||null]);
  await client.query("COMMIT");
  res.json({reviewed:true,status:nextStatus});
 }catch(error){await client.query("ROLLBACK").catch(()=>undefined);throw error;}
 finally{client.release();}
});

router.post("/submit",async(req,res)=>{
 const actor=req.currentUser!;
 if(normalizeRole(actor.role)!=="teacher"){res.status(403).json({error:"Only the applying teacher can submit this application"});return;}
 await ensure();
 await pool.query("CREATE TABLE IF NOT EXISTS teacher_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, cv jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now())");
 const [cvResult,docs,quals]=await Promise.all([
  pool.query("SELECT cv FROM teacher_profiles WHERE user_id=$1",[actor.id]),
  pool.query("SELECT id FROM teacher_documents WHERE user_id=$1 AND document_type='resume' AND mime_type='application/pdf'",[actor.id]),
  pool.query("SELECT q.id,q.title,q.document_id,d.document_type FROM teacher_qualifications q LEFT JOIN teacher_documents d ON d.id=q.document_id AND d.user_id=q.user_id WHERE q.user_id=$1",[actor.id]),
 ]);
 const cv=(cvResult.rows[0]?.cv||{}) as Record<string,unknown>;
 let personal:any={};try{personal=JSON.parse(String(cv.personalDetails||"{}"))}catch{}
 const missing=["professionalSummary","education","experience","subjects","address"].filter(k=>typeof cv[k]!=="string"||String(cv[k]).trim().length<2);
 const photo=await pool.query("SELECT id FROM teacher_documents WHERE id=$1 AND user_id=$2 AND document_type='cv' AND mime_type LIKE 'image/%'",[Number(cv.photoDocumentId),actor.id]);
 const incomplete=quals.rows.filter(q=>!q.document_id||q.document_type!=="certificate");
 if(missing.length||!personal.fullName||!personal.idNumber||!personal.dob||!personal.phone||!personal.email||!personal.address||!photo.rows.length||!docs.rows.length||!quals.rows.length||incomplete.length){
  res.status(409).json({error:"Complete the required CV details, upload a PDF resume and profile photo, and attach a separate certificate to every qualification before submitting. The readiness survey is optional and can be saved separately.",missingFields:missing,photoUploaded:Boolean(photo.rows.length),resumeUploaded:docs.rows.length>0,qualifications:quals.rows.length,certificatesMissing:incomplete.length});return;
 }
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
    await submissionClient.query("UPDATE users SET teacher_application_status='pending_review',teacher_review_deadline=COALESCE(teacher_review_deadline,now()+make_interval(days=>$2)) WHERE id=$1 AND lower(role)='teacher'",[actor.id,reviewDays]);
    alreadySubmitted=true;
   }else{
    const statusUpdate=await submissionClient.query("UPDATE users SET teacher_application_status='pending_review',teacher_review_deadline=COALESCE(teacher_review_deadline,now()+make_interval(days=>$2)) WHERE id=$1 AND lower(role)='teacher' AND COALESCE(teacher_application_status,'draft') IN ('draft','pending_review','not_applicable') RETURNING id",[actor.id,reviewDays]);
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
   "SELECT DISTINCT u.id,u.role FROM users u LEFT JOIN manager_permission_grants g ON g.manager_user_id=u.id AND g.permission_key='teacher_cv.view' AND g.granted=true WHERE (lower(u.role) IN ('owner','platform_owner') OR g.manager_user_id IS NOT NULL) AND u.is_blocked=false AND u.is_suspended=false"
  );
  reviewerRows=reviewerResult.rows;
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
router.get("/:teacherId/details",requireManagerPermission("teacher_cv.view"),async(req,res)=>{const id=idOf(req.params.teacherId);if(!id){res.status(400).json({error:"Invalid teacher id"});return}await ensure();await pool.query("CREATE TABLE IF NOT EXISTS teacher_profiles (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, cv jsonb NOT NULL DEFAULT jsonb_build_object(), updated_at timestamptz NOT NULL DEFAULT now())");const [u,d,c,h,q]=await Promise.all([pool.query("SELECT id,name,email,phone,role,is_manager,manager_level,created_at,COALESCE(teacher_application_status,'pending_review') AS teacher_application_status FROM users WHERE id=$1 AND lower(role)='teacher'",[id]),pool.query("SELECT id,document_type,file_name,mime_type,size_bytes,created_at FROM teacher_documents WHERE user_id=$1 ORDER BY created_at DESC",[id]),pool.query("SELECT cv,updated_at FROM teacher_profiles WHERE user_id=$1",[id]),pool.query("SELECT h.action,h.previous_status,h.new_status,h.note,h.created_at,u.name reviewer_name FROM teacher_cv_review_history h LEFT JOIN users u ON u.id=h.reviewer_id WHERE h.teacher_id=$1 ORDER BY h.created_at DESC LIMIT 100",[id]),pool.query("SELECT q.id,q.title,q.institution,q.year,q.verification_status,q.document_id,d.file_name AS document_file_name,d.mime_type AS document_mime_type FROM teacher_qualifications q LEFT JOIN teacher_documents d ON d.id=q.document_id AND d.user_id=q.user_id WHERE q.user_id=$1 ORDER BY q.created_at ASC",[id])]);const hasCvSubmission=h.rows.some((item:any)=>item.action==="submitted");const cvValue=c.rows[0]?.cv&&typeof c.rows[0].cv==="object"?c.rows[0].cv:{};const hasSurveySubmission=Boolean(cvValue.surveySubmittedAt);if(!u.rows.length || (!hasCvSubmission&&!hasSurveySubmission) || (!isOwner(req.currentUser) && (!canModerateUser(req.currentUser!,{role:u.rows[0].role,isManager:u.rows[0].is_manager,managerLevel:u.rows[0].manager_level}) || (hasCvSubmission&&!["pending_review","not_applicable"].includes(String(u.rows[0].teacher_application_status||"pending_review")))))){res.status(404).json({error:"Teacher application or submitted readiness survey not found"});return}const {role,is_manager,manager_level,...teacher}=u.rows[0];res.json({teacher,documents:d.rows,qualifications:q.rows,cv:c.rows[0]?.cv||{},history:h.rows})});
router.post("/:teacherId/decision",requireManagerPermissionForRequest((req)=>req.body?.action==="approve"?"teacher_cv.authorize":"teacher_cv.review"),async(req,res)=>{
 if(!canReview(req.currentUser)){res.status(403).json({error:"Only Owner or Senior Manager can decide teacher applications"});return;}
 const id=idOf(req.params.teacherId),action=String(req.body?.action||""),note=typeof req.body?.note==="string"?req.body.note.trim().slice(0,2000):"";
 if(!id||!["approve","reject"].includes(action)){res.status(400).json({error:"Invalid decision"});return;}
 await ensure();
 const q=await pool.query("SELECT id,name,email,role,is_manager,manager_level,teacher_application_status FROM users WHERE id=$1",[id]);
 const t=q.rows[0];
 const submitted=await pool.query("SELECT 1 FROM teacher_cv_review_history WHERE teacher_id=$1 AND action='submitted' LIMIT 1",[id]);
 if(!t||normalizeRole(t.role)!=="teacher"||!submitted.rows.length||(!isOwner(req.currentUser)&&!canModerateUser(req.currentUser!,{role:t.role,isManager:t.is_manager,managerLevel:t.manager_level}))){res.status(404).json({error:"Teacher application not found"});return;}
 if(action==="approve"){
  const [cvResult,qualResult,resumeResult]=await Promise.all([
   pool.query("SELECT cv FROM teacher_profiles WHERE user_id=$1",[id]),
   pool.query("SELECT q.id,q.title,q.verification_status,q.document_id,d.document_type FROM teacher_qualifications q LEFT JOIN teacher_documents d ON d.id=q.document_id AND d.user_id=q.user_id WHERE q.user_id=$1",[id]),
   pool.query("SELECT id FROM teacher_documents WHERE user_id=$1 AND document_type='resume' AND mime_type='application/pdf' LIMIT 1",[id])
  ]);
  const cv=(cvResult.rows[0]?.cv||{}) as Record<string,unknown>;
  let personal:any={};try{personal=JSON.parse(String(cv.personalDetails||"{}"))}catch{}
  const required=["professionalSummary","education","experience","subjects","address"];
  const missing=required.filter(k=>typeof cv[k]!=="string"||String(cv[k]).trim().length<2);
  const photoResult=await pool.query("SELECT id FROM teacher_documents WHERE id=$1 AND user_id=$2 AND document_type=$3 AND mime_type LIKE $4",[Number(cv.photoDocumentId),id,"cv","image/%"]);
  const hasPhoto=photoResult.rows.length>0;
  const incomplete=qualResult.rows.filter(q=>q.verification_status!=="verified"||!q.document_id||q.document_type!=="certificate");
  if(missing.length||!hasPhoto||!resumeResult.rows.length||!personal.fullName||!personal.idNumber||!personal.dob||!personal.phone||!personal.email||!personal.address||!qualResult.rows.length||incomplete.length){
   res.status(409).json({error:"Complete personal/legal details, upload a profile photo and PDF resume, attach a certificate to every qualification, and have every qualification verified before authorizing teaching access. The readiness survey is optional.",missingFields:missing,photoUploaded:hasPhoto,resumePdfUploaded:Boolean(resumeResult.rows.length),qualificationCount:qualResult.rows.length,unverifiedQualifications:incomplete.map(q=>({id:q.id,title:q.title,status:q.verification_status,documentUploaded:Boolean(q.document_id)}))});return;
  }
 }
 const client=await pool.connect();
 let conversionDeadline:string|null=null;
 try{
  await client.query("BEGIN");
  if(action==="approve"){
   const updated=await client.query("UPDATE users SET teacher_application_status='approved',teacher_review_deadline=NULL WHERE id=$1 AND lower(role)='teacher' AND COALESCE(teacher_application_status,'not_applicable') IN ('pending_review','not_applicable') RETURNING id",[id]);
    if(!updated.rows.length){await client.query("ROLLBACK");res.status(409).json({error:"This application is no longer awaiting a decision."});return;}
   await client.query("INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) VALUES($1,$2,'approved',$3,'approved',$4)",[id,req.currentUser!.id,t.teacher_application_status||"pending_review",note||null]);
  }else{
   const setting=await client.query("SELECT review_duration_days FROM teacher_cv_workflow_settings WHERE id=1");
   const days=Number(setting.rows[0]?.review_duration_days||30);
   const safeDays=Number.isInteger(days)&&days>=1&&days<=365?days:30;
   const deadline=await client.query("UPDATE users SET teacher_application_status='rejected_pending_conversion',teacher_review_deadline=now()+make_interval(days=>$2),is_manager=false,is_prefect=false WHERE id=$1 AND lower(role)='teacher' AND COALESCE(teacher_application_status,'not_applicable') IN ('pending_review','not_applicable') RETURNING teacher_review_deadline",[id,safeDays]);
    if(!deadline.rows.length){await client.query("ROLLBACK");res.status(409).json({error:"This application is no longer awaiting a decision."});return;}
   conversionDeadline=deadline.rows[0]?.teacher_review_deadline?new Date(deadline.rows[0].teacher_review_deadline).toISOString():null;
   await client.query("INSERT INTO teacher_cv_review_history(teacher_id,reviewer_id,action,previous_status,new_status,note) VALUES($1,$2,'rejected',$3,'rejected_pending_conversion',$4)",[id,req.currentUser!.id,t.teacher_application_status||"pending_review",note||null]);
  }
  await client.query("COMMIT");
 }catch(e){await client.query("ROLLBACK").catch(()=>undefined);throw e;}finally{client.release();}
 const title=action==="approve"?"Teacher application approved":"Teacher application not approved";
 const message=action==="approve"
  ?"Your teacher CV has been approved. Your teacher permissions are now active. Sign in again if your dashboard has not refreshed."
  :"Your teacher CV was not approved. Your account and login remain active, but teaching permissions are disabled. Your account is scheduled to become a learner after "+(conversionDeadline?new Date(conversionDeadline).toLocaleString():"the configured conversion period")+".";
 try{await db.insert(notificationsTable).values({recipientId:id,title,message,link:"/profile-hub",type:"teacher_cv_decision"});}catch(error){console.error("[teacher-cv] Decision notification failed; decision remains saved.",error instanceof Error?error.message:"unknown");}
 try{await enqueueEmailNotification(id,"Dallyletter Elidems — "+title,message);}catch(error){console.error("[teacher-cv] Decision email queue failed; decision remains saved.",error instanceof Error?error.message:"unknown");}
 res.json({
  status:action==="approve"?"approved":"rejected_pending_conversion",
  conversionDeadline,
  message:action==="approve"?"Teacher approved and authorized.":"Teaching access denied. The account remains usable and will convert to a learner on the scheduled date."
 });
});
router.get("/:teacherId/history",requireManagerPermissionIfManager("teacher_cv.view"),async(req,res)=>{
 const id=idOf(req.params.teacherId);if(!id){res.status(400).json({error:"Invalid teacher id"});return}
 const actor=req.currentUser!;
 if(actor.id!==id&&!isOwner(actor)){
  const target=await pool.query("SELECT role,is_manager,manager_level,COALESCE(teacher_application_status,'pending_review') AS teacher_application_status FROM users WHERE id=$1 AND lower(role)='teacher'",[id]);
  const submitted=await pool.query("SELECT 1 FROM teacher_cv_review_history WHERE teacher_id=$1 AND action='submitted' LIMIT 1",[id]);
  if(!target.rows.length||!["pending_review","not_applicable"].includes(String(target.rows[0].teacher_application_status||"pending_review"))||!submitted.rows.length||!canAccessManager(actor)||!canModerateUser(actor,{role:target.rows[0].role,isManager:target.rows[0].is_manager,managerLevel:target.rows[0].manager_level})){res.status(404).json({error:"Application history not found"});return}
 }
 await ensure();
 const result=await pool.query("SELECT h.action,h.previous_status,h.new_status,h.note,h.created_at,u.name reviewer_name FROM teacher_cv_review_history h LEFT JOIN users u ON u.id=h.reviewer_id WHERE h.teacher_id=$1 ORDER BY h.created_at DESC LIMIT 100",[id]);
 res.json({history:result.rows});
});
router.get("/:teacherId/chat",requireManagerPermissionIfManager("teacher_cv.chat"),async(req,res)=>{const id=idOf(req.params.teacherId);if(!id){res.status(400).json({error:"Invalid teacher id"});return}const actor=req.currentUser!,role=normalizeRole(actor.role);if(!canAccessManager(actor)&&!(actor.id===id&&role==="teacher")){res.status(403).json({error:"Application chat access denied"});return}await ensure();const target=await pool.query("SELECT role,is_manager,manager_level FROM users WHERE id=$1 AND lower(role)='teacher'",[id]);if(!target.rows.length||(actor.id!==id&&!isOwner(actor)&&!canModerateUser(actor,{role:target.rows[0].role,isManager:target.rows[0].is_manager,managerLevel:target.rows[0].manager_level}))){res.status(404).json({error:"Application chat is closed"});return}const r=await pool.query("SELECT m.id,m.sender_id,m.body,m.created_at,u.name sender_name,u.role sender_role FROM teacher_cv_chat_messages m JOIN users u ON u.id=m.sender_id WHERE m.teacher_id=$1 ORDER BY m.created_at ASC LIMIT 500",[id]);res.json(r.rows)});
router.post("/:teacherId/chat",requireManagerPermissionIfManager("teacher_cv.chat"),async(req,res)=>{const id=idOf(req.params.teacherId),body=typeof req.body?.body==="string"?req.body.body.trim():"";if(!id||!body||body.length>4000){res.status(400).json({error:"Message must contain 1–4000 characters"});return}const role=normalizeRole(req.currentUser!.role);if(!canAccessManager(req.currentUser!)&&!(req.currentUser!.id===id&&role==="teacher")){res.status(403).json({error:"Application chat access denied"});return}await ensure();const target=await pool.query("SELECT id,role,is_manager,manager_level FROM users WHERE id=$1 AND lower(role)='teacher'",[id]);if(!target.rows.length||(req.currentUser!.id!==id&&!isOwner(req.currentUser)&&!canModerateUser(req.currentUser!,{role:target.rows[0].role,isManager:target.rows[0].is_manager,managerLevel:target.rows[0].manager_level}))){res.status(404).json({error:"Application chat is closed"});return}const r=await pool.query("INSERT INTO teacher_cv_chat_messages(teacher_id,sender_id,body) VALUES($1,$2,$3) RETURNING id,sender_id,body,created_at",[id,req.currentUser!.id,body]);res.status(201).json(r.rows[0])});
if(process.env.NODE_ENV==="test"){router.post("/__test/process-expired",async(req,res)=>{if(!isOwner(req.currentUser)){res.status(403).json({error:"Owner access required"});return}await processExpiredTeacherApplications();res.json({processed:true})})}

export default router;