import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, notificationsTable, usersTable, pool } from "@workspace/db";
import { requireAuth, normalizeRole, isOwnerRole, canAccessManager } from "../lib/auth-middleware";
import { managerHasPermission } from "../lib/manager-permission-policy";
import { canModerateUser } from "../lib/role-access";

const router = Router();
const sectionKeys = new Set(["overview","qualifications","subjects","enrollments","achievements","reports","attendance","register","payments","transfers","teacher_documents","groups","activity"]);
const modes = new Set(["me_only_authorized","selected_friends","everyone"]);
const publicByDefault = new Set(["overview","qualifications","subjects","achievements","teacher_documents"]);
const defaultModeForSection = (section: string): string => publicByDefault.has(section) ? "everyone" : "me_only_authorized";
let schemaReady: Promise<void> | null = null;

async function ensureSchema(): Promise<void> {
  if (!schemaReady) schemaReady = (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS profile_privacy_settings (
      user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      section_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      chat_privacy text NOT NULL DEFAULT 'everyone' CHECK (chat_privacy IN ('everyone','approval_required')),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS profile_connections (
      id bigserial PRIMARY KEY,
      requester_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (requester_id <> recipient_id),
      UNIQUE (requester_id, recipient_id)
    )`);
    await pool.query("CREATE INDEX IF NOT EXISTS profile_connections_recipient_status_idx ON profile_connections(recipient_id,status)");
  })().catch(error => { schemaReady = null; throw error; });
  await schemaReady;
}

export async function isProfileChatApprovalRequired(userId: number): Promise<boolean> {
  await ensureSchema();
  const result = await pool.query("SELECT chat_privacy FROM profile_privacy_settings WHERE user_id=$1", [userId]);
  return result.rows[0]?.chat_privacy === "approval_required";
}

export async function hasAcceptedProfileConnection(userA: number, userB: number): Promise<boolean> {
  await ensureSchema();
  const result = await pool.query(
    "SELECT 1 FROM profile_connections WHERE status='accepted' AND ((requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1)) LIMIT 1",
    [userA,userB],
  );
  return Number(result.rowCount ?? 0) > 0;
}

export async function canViewProfileSection(actor: NonNullable<Express.Request["currentUser"]>, targetId: number, section: string): Promise<boolean> {
  if (actor.id === targetId) return true;
  const actorIsOwner = isOwnerRole(actor.role);
  await ensureSchema();
  const target = await pool.query("SELECT role,is_manager,manager_level FROM users WHERE id=$1", [targetId]);
  if (!target.rows.length) return false;
  // Owner profiles and Owner activity are invisible to every non-Owner account,
  // including Senior Managers and Admins, regardless of the profile's public defaults.
  if (isOwnerRole(target.rows[0].role) && !actorIsOwner) return false;
  if (actorIsOwner) return true;
  if (canAccessManager(actor) && !canModerateUser(actor,{role:target.rows[0].role,isManager:target.rows[0].is_manager,managerLevel:target.rows[0].manager_level})) return false;

  const role = normalizeRole(actor.role);
  const approvedTeacher = role === "teacher" && actor.teacherApplicationStatus !== "pending_review";
  const managerAccess = canAccessManager(actor) || (approvedTeacher && actor.isManager === true);
  const result = await pool.query("SELECT section_settings FROM profile_privacy_settings WHERE user_id=$1", [targetId]);
  const setting = result.rows[0]?.section_settings?.[section] ?? { mode: defaultModeForSection(section), selectedUserIds: [] };

  if (setting.mode === "everyone") return true;
  if (setting.mode === "me_only_authorized") {
    if (managerAccess) {
      const managerSectionPermissions: Record<string, string> = {
        overview: "users.view", qualifications: "qualifications.view", subjects: "users.view",
        enrollments: "users.view", achievements: "achievements.view", reports: "reports.view",
        attendance: "attendance.view", register: "attendance.view", transfers: "transfers.view",
        teacher_documents: "qualifications.view", groups: "groups.manage", activity: "audit.view_subordinate",
      };
      const requiredPermission = managerSectionPermissions[section];
      return requiredPermission ? managerHasPermission(actor, requiredPermission) : false;
    }
    if (approvedTeacher) {
      const following = await pool.query("SELECT 1 FROM follows WHERE follower_id=$1 AND target_user_id=$2 LIMIT 1", [actor.id,targetId]);
      return following.rows.length > 0;
    }
    return false;
  }
  if (setting.mode === "selected_friends") {
    if (!Array.isArray(setting.selectedUserIds) || !setting.selectedUserIds.includes(actor.id)) return false;
    return hasAcceptedProfileConnection(actor.id,targetId);
  }
  return false;
}

router.get("/profile/:id/social", requireAuth, async (req,res): Promise<void> => {
  await ensureSchema();
  const targetId=Number(req.params.id), actor=req.currentUser!;
  if(!Number.isSafeInteger(targetId)||targetId<=0){res.status(400).json({error:"Invalid profile id"});return;}
  const [target]=await db.select({id:usersTable.id,role:usersTable.role,isManager:usersTable.isManager,managerLevel:usersTable.managerLevel,isPrefect:usersTable.isPrefect,isBlocked:usersTable.isBlocked,isSuspended:usersTable.isSuspended}).from(usersTable).where(eq(usersTable.id,targetId));
  if(!target || (isOwnerRole(target.role) && !isOwnerRole(actor.role)) || (actor.id!==targetId && canAccessManager(actor) && !isOwnerRole(actor.role) && !canModerateUser(actor,target))){res.status(404).json({error:"Profile not found"});return;}
  const privacy=await pool.query("SELECT section_settings,chat_privacy FROM profile_privacy_settings WHERE user_id=$1",[targetId]);
  const link=await pool.query(
    "SELECT id,status,requester_id,recipient_id FROM profile_connections WHERE (requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1) ORDER BY id DESC LIMIT 1",
    [actor.id,targetId],
  );
  const connection=link.rows[0]??null;
  const accepted=connection?.status==="accepted";
  const viewerRole=normalizeRole(actor.role),targetRole=normalizeRole(target.role);
  const existingRoleRuleAllows=viewerRole!=="student"||targetRole==="teacher"||isOwnerRole(target.role)||target.isPrefect===true;
  const chatPrivacy=privacy.rows[0]?.chat_privacy??"everyone";
  const canChat=actor.id!==targetId&&!target.isBlocked&&!target.isSuspended&&(accepted||((chatPrivacy!=="approval_required")&&existingRoleRuleAllows));
  res.setHeader("Cache-Control","private, no-store");
  res.json({
    isSelf:actor.id===targetId,
    privacy:actor.id===targetId?(privacy.rows[0]?.section_settings??{}):undefined,
    chatPrivacy,
    connection:connection?{id:Number(connection.id),status:connection.status,requestedByMe:connection.requester_id===actor.id}:null,
    canChat,
  });
});

router.get("/profile/:id/section/:section", requireAuth, async (req,res): Promise<void> => {
  await ensureSchema();
  const targetId=Number(req.params.id),section=String(req.params.section||"");
  if(!Number.isSafeInteger(targetId)||targetId<=0||!sectionKeys.has(section)||section==="overview"){res.status(400).json({error:"Invalid Profile Hub section."});return;}
  if(!(await canViewProfileSection(req.currentUser!,targetId,section))){res.status(403).json({error:"This Profile Hub section is private."});return;}
  const [target]=await db.select({id:usersTable.id,role:usersTable.role}).from(usersTable).where(eq(usersTable.id,targetId));
  if(!target){res.status(404).json({error:"Profile not found."});return;}
  let data:unknown;
  switch(section){
    case "qualifications":
      data=(await pool.query("SELECT title,verification_status,created_at FROM teacher_qualifications WHERE user_id=$1 AND verification_status='verified' ORDER BY created_at DESC",[targetId])).rows;
      break;
    case "subjects":{
      const role=normalizeRole(target.role);
      const query=role==="teacher"||role==="manager"||role==="senior_manager"
        ? "SELECT subjects_to_teach AS subjects,primary_subject FROM teacher_subjects WHERE user_id=$1"
        : "SELECT subjects FROM learner_subjects WHERE user_id=$1";
      data=(await pool.query(query,[targetId])).rows;
      break;
    }
    case "enrollments":
      data=(await pool.query("SELECT e.id,e.enrolled_at,e.progress_percent,e.status,c.title AS class_title,c.subject FROM enrollments e JOIN classes c ON c.id=e.class_id WHERE e.learner_id=$1 ORDER BY e.enrolled_at DESC",[targetId])).rows;
      break;
    case "achievements":
      data=(await pool.query("SELECT ua.id,ua.earned_at,a.name,a.description,a.icon,a.category,ua.awarded_by_name,ua.note FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id WHERE ua.user_id=$1 ORDER BY ua.earned_at DESC",[targetId])).rows;
      break;
    case "reports":
      data=(await pool.query("SELECT id,report_type,term_label,period_start,period_end,draft_content,review_note,reviewed_at,created_at FROM academic_report_drafts WHERE learner_id=$1 AND status='approved' ORDER BY reviewed_at DESC NULLS LAST,created_at DESC LIMIT 100",[targetId])).rows;
      break;
    case "attendance":
      data=(await pool.query("SELECT class_id,status,joined_at,left_at,duration_minutes,is_late FROM attendance WHERE student_id=$1 ORDER BY joined_at DESC LIMIT 500",[targetId])).rows;
      break;
    case "register":
      data=(await pool.query("SELECT attendance_date,time_zone,status,open_count,first_open_at,last_open_at,last_source,activity_label FROM daily_app_attendance WHERE user_id=$1 ORDER BY attendance_date DESC LIMIT 120",[targetId])).rows;
      break;
    case "payments":
      data=(await pool.query("SELECT id,month,year,amount,status,created_at,notes FROM payments WHERE student_id=$1 ORDER BY created_at DESC LIMIT 100",[targetId])).rows;
      break;
    case "transfers":
      data=(await pool.query("SELECT id,reason,status,review_note,reviewed_at,created_at FROM academic_transfer_requests WHERE learner_id=$1 ORDER BY created_at DESC LIMIT 100",[targetId])).rows;
      break;
    case "teacher_documents":{
      const actor=req.currentUser!,actorRole=normalizeRole(actor.role);
      const privateDocuments=actor.id===targetId||["owner","platform_owner","senior_manager","manager","junior_manager"].includes(actorRole)||(actorRole==="teacher"&&actor.isManager===true&&actor.teacherApplicationStatus!=="pending_review");
      const query=privateDocuments
        ? "SELECT id,document_type,file_name,mime_type,size_bytes,created_at FROM teacher_documents WHERE user_id=$1 ORDER BY created_at DESC"
        : "SELECT id,document_type,file_name,mime_type,size_bytes,created_at FROM teacher_documents WHERE user_id=$1 AND document_type='certificate' ORDER BY created_at DESC";
      data=(await pool.query(query,[targetId])).rows;
      break;
    }
    case "groups":
      data=(await pool.query("SELECT g.id,g.name,g.subject,'joined' AS relationship FROM study_group_members m JOIN study_groups g ON g.id=m.group_id WHERE m.user_id=$1 UNION SELECT g.id,g.name,g.subject,'created' AS relationship FROM study_groups g WHERE g.creator_id=$1 ORDER BY name",[targetId])).rows;
      break;
    case "activity":{
      const [daily,lesson]=await Promise.all([
        pool.query("SELECT count(*)::int AS days_present,max(attendance_date) AS last_active_date FROM daily_app_attendance WHERE user_id=$1 AND status='present'",[targetId]),
        pool.query("SELECT count(*)::int AS lesson_requests FROM lesson_requests WHERE prefect_id=$1",[targetId]),
      ]);
      data={...daily.rows[0],lesson_requests:lesson.rows[0]?.lesson_requests??0};
      break;
    }
    default:
      res.status(400).json({error:"This section does not have a public data view."});return;
  }
  res.setHeader("Cache-Control","private, no-store, no-cache, must-revalidate");
  res.json({section,data});
});

router.put("/profile/me/privacy", requireAuth, async (req,res): Promise<void> => {
  await ensureSchema();
  const sectionSettings=req.body?.sectionSettings;
  const chatPrivacy=req.body?.chatPrivacy;
  if(!sectionSettings||typeof sectionSettings!=="object"||Array.isArray(sectionSettings)){res.status(400).json({error:"sectionSettings must be an object"});return;}
  const cleaned:Record<string,{mode:string;selectedUserIds:number[]}>={};
  for(const [key,value] of Object.entries(sectionSettings)){
    if(!sectionKeys.has(key)||!value||typeof value!=="object"){res.status(400).json({error:"Invalid profile section privacy setting"});return;}
    const v=value as any;
    if(!modes.has(v.mode)||!Array.isArray(v.selectedUserIds??[])||(v.selectedUserIds??[]).some((id:any)=>!Number.isSafeInteger(Number(id))||Number(id)<=0)){res.status(400).json({error:"Invalid section privacy mode or selected friends"});return;}
    cleaned[key]={mode:v.mode,selectedUserIds:[...new Set<number>((v.selectedUserIds??[]).map((id:any)=>Number(id)))].slice(0,500)};
  }
  if(chatPrivacy!==undefined&&!["everyone","approval_required"].includes(chatPrivacy)){res.status(400).json({error:"Invalid chat privacy setting"});return;}
  const existing=await pool.query("SELECT section_settings,chat_privacy FROM profile_privacy_settings WHERE user_id=$1",[req.currentUser!.id]);
  const merged={...(existing.rows[0]?.section_settings??{}),...cleaned};
  const nextChat=chatPrivacy??existing.rows[0]?.chat_privacy??"everyone";
  await pool.query(
    "INSERT INTO profile_privacy_settings(user_id,section_settings,chat_privacy,updated_at) VALUES($1,$2::jsonb,$3,now()) ON CONFLICT(user_id) DO UPDATE SET section_settings=EXCLUDED.section_settings,chat_privacy=EXCLUDED.chat_privacy,updated_at=now()",
    [req.currentUser!.id,JSON.stringify(merged),nextChat],
  );
  res.json({sectionSettings:merged,chatPrivacy:nextChat});
});

router.post("/profile/:id/connect", requireAuth, async (req,res): Promise<void> => {
  await ensureSchema();
  const actor=req.currentUser!, targetId=Number(req.params.id);
  if(!Number.isSafeInteger(targetId)||targetId<=0||targetId===actor.id){res.status(400).json({error:"Choose another valid profile"});return;}
  const [target]=await db.select({id:usersTable.id,name:usersTable.name,role:usersTable.role,isManager:usersTable.isManager,managerLevel:usersTable.managerLevel,isBlocked:usersTable.isBlocked,isSuspended:usersTable.isSuspended}).from(usersTable).where(eq(usersTable.id,targetId));
  if(!target || (isOwnerRole(target.role) && !isOwnerRole(actor.role)) || (canAccessManager(actor) && !isOwnerRole(actor.role) && !canModerateUser(actor,target)) || target.isBlocked || target.isSuspended){res.status(404).json({error:"This profile is unavailable"});return;}
  const current=await pool.query("SELECT id,status,requester_id,recipient_id FROM profile_connections WHERE (requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1) ORDER BY id DESC LIMIT 1",[actor.id,targetId]);
  if(current.rows[0]?.status==="accepted"){res.json({status:"accepted",connectionId:Number(current.rows[0].id)});return;}
  if(current.rows[0]?.status==="pending"){res.status(409).json({error:current.rows[0].requester_id===actor.id?"Connection request already sent":"This user has already requested to connect with you. Review your requests."});return;}
  const inserted=await pool.query(
    "INSERT INTO profile_connections(requester_id,recipient_id,status) VALUES($1,$2,'pending') ON CONFLICT(requester_id,recipient_id) DO UPDATE SET status='pending',updated_at=now() RETURNING id",
    [actor.id,targetId],
  );
  await db.insert(notificationsTable).values([
    {recipientId:targetId,title:"New connection request",message:actor.name+" wants to connect with you.",link:"/profile-hub",type:"connection_request"},
    {recipientId:actor.id,title:"Connection request sent",message:"Your connection request to "+target.name+" was sent.",link:"/profile/"+targetId,type:"connection_request"},
  ]);
  res.status(201).json({status:"pending",connectionId:Number(inserted.rows[0].id)});
});

router.get("/profile/connections/friends", requireAuth, async(req,res):Promise<void> => {
  await ensureSchema();
  const rows=await pool.query(
    "SELECT u.id,u.name,u.role FROM profile_connections c JOIN users u ON u.id=CASE WHEN c.requester_id=$1 THEN c.recipient_id ELSE c.requester_id END WHERE c.status='accepted' AND (c.requester_id=$1 OR c.recipient_id=$1) ORDER BY u.name",
    [req.currentUser!.id],
  );
  const visibleRows=isOwnerRole(req.currentUser!.role)?rows.rows:rows.rows.filter((row:any)=>!isOwnerRole(row.role));
  res.json(visibleRows);
});

router.get("/profile/connections/requests", requireAuth, async(req,res):Promise<void> => {
  await ensureSchema();
  const rows=await pool.query(
    "SELECT c.id,c.requester_id,c.recipient_id,c.status,c.created_at,u.name AS requester_name,u.role AS requester_role FROM profile_connections c JOIN users u ON u.id=c.requester_id WHERE c.recipient_id=$1 AND c.status='pending' ORDER BY c.created_at DESC",
    [req.currentUser!.id],
  );
  const visibleRows=isOwnerRole(req.currentUser!.role)?rows.rows:rows.rows.filter((row:any)=>!isOwnerRole(row.requester_role));
  res.json(visibleRows);
});

router.patch("/profile/connections/:id", requireAuth, async(req,res):Promise<void> => {
  await ensureSchema();
  const id=Number(req.params.id),status=req.body?.status,actor=req.currentUser!;
  if(!Number.isSafeInteger(id)||!["accepted","rejected"].includes(status)){res.status(400).json({error:"Choose accept or reject"});return;}
  const updated=await pool.query(
    "UPDATE profile_connections SET status=$2,updated_at=now() WHERE id=$1 AND recipient_id=$3 AND status='pending' RETURNING requester_id,recipient_id",
    [id,status,actor.id],
  );
  if(!updated.rows.length){res.status(404).json({error:"Pending connection request not found"});return;}
  const requesterId=Number(updated.rows[0].requester_id);
  await db.insert(notificationsTable).values([
    {recipientId:requesterId,title:status==="accepted"?"Connection request accepted":"Connection request declined",message:actor.name+(status==="accepted"?" accepted your connection request.":" declined your connection request."),link:"/profile/"+actor.id,type:"connection_request"},
    {recipientId:actor.id,title:status==="accepted"?"Friend added":"Connection request declined",message:status==="accepted"?"You are now connected. Private chat is available when both users' settings permit it.":"The connection request was declined.",link:"/profile/connections",type:"connection_request"},
  ]);
  res.json({status});
});

export default router;
