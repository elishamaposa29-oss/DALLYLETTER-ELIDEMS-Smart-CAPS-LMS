import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, notificationsTable, usersTable, pool } from "@workspace/db";
import { requireAuth, normalizeRole } from "../lib/auth-middleware";

const router = Router();
const sectionKeys = new Set(["overview","qualifications","subjects","enrollments","achievements","reports","attendance","register","payments","transfers","teacher_documents","groups","activity"]);
const modes = new Set(["me_only_authorized","selected_friends","everyone"]);
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
  return result.rowCount > 0;
}

export async function canViewProfileSection(actor: NonNullable<Express.Request["currentUser"]>, targetId: number, section: string): Promise<boolean> {
  if (actor.id === targetId) return true;
  const role = normalizeRole(actor.role);
  if (["owner","platform_owner","senior_manager","manager","junior_manager"].includes(role) || (role === "teacher" && actor.isManager === true)) return true;
  await ensureSchema();
  if (role === "teacher") {
    const following = await pool.query("SELECT 1 FROM follows WHERE follower_id=$1 AND target_user_id=$2 LIMIT 1", [actor.id,targetId]);
    if (following.rows.length) return true;
  }
  const result = await pool.query("SELECT section_settings FROM profile_privacy_settings WHERE user_id=$1", [targetId]);
  const setting = result.rows[0]?.section_settings?.[section] ?? { mode: "everyone", selectedUserIds: [] };
  if (setting.mode === "everyone") return true;
  if (setting.mode === "me_only_authorized") return false;
  if (setting.mode === "selected_friends") {
    if (!Array.isArray(setting.selectedUserIds) || !setting.selectedUserIds.includes(actorId)) return false;
    return hasAcceptedProfileConnection(actorId,targetId);
  }
  return false;
}

router.get("/profile/:id/social", requireAuth, async (req,res): Promise<void> => {
  await ensureSchema();
  const targetId=Number(req.params.id), actor=req.currentUser!;
  if(!Number.isSafeInteger(targetId)||targetId<=0){res.status(400).json({error:"Invalid profile id"});return;}
  const [target]=await db.select({id:usersTable.id,role:usersTable.role,isPrefect:usersTable.isPrefect,isBlocked:usersTable.isBlocked,isSuspended:usersTable.isSuspended}).from(usersTable).where(eq(usersTable.id,targetId));
  if(!target){res.status(404).json({error:"Profile not found"});return;}
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
    cleaned[key]={mode:v.mode,selectedUserIds:[...new Set((v.selectedUserIds??[]).map(Number))].slice(0,500)};
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
  const [target]=await db.select({id:usersTable.id,name:usersTable.name,isBlocked:usersTable.isBlocked,isSuspended:usersTable.isSuspended}).from(usersTable).where(eq(usersTable.id,targetId));
  if(!target||target.isBlocked||target.isSuspended){res.status(404).json({error:"This profile is unavailable"});return;}
  const current=await pool.query("SELECT id,status,requester_id,recipient_id FROM profile_connections WHERE (requester_id=$1 AND recipient_id=$2) OR (requester_id=$2 AND recipient_id=$1) ORDER BY id DESC LIMIT 1",[actor.id,targetId]);
  if(current.rows[0]?.status==="accepted"){res.json({status:"accepted",connectionId:Number(current.rows[0].id)});return;}
  if(current.rows[0]?.status==="pending"){res.status(409).json({error:current.rows[0].requester_id===actor.id?"Connection request already sent":"This user has already requested to connect with you. Review your requests."});return;}
  const inserted=await pool.query(
    "INSERT INTO profile_connections(requester_id,recipient_id,status) VALUES($1,$2,'pending') ON CONFLICT(requester_id,recipient_id) DO UPDATE SET status='pending',updated_at=now() RETURNING id",
    [actor.id,targetId],
  );
  await db.insert(notificationsTable).values([
    {recipientId:targetId,title:"New connection request",message:actor.name+" wants to connect with you.",link:"/profile/connections",type:"connection_request"},
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
  res.json(rows.rows);
});

router.get("/profile/connections/requests", requireAuth, async(req,res):Promise<void> => {
  await ensureSchema();
  const rows=await pool.query(
    "SELECT c.id,c.requester_id,c.recipient_id,c.status,c.created_at,u.name AS requester_name,u.role AS requester_role FROM profile_connections c JOIN users u ON u.id=c.requester_id WHERE c.recipient_id=$1 AND c.status='pending' ORDER BY c.created_at DESC",
    [req.currentUser!.id],
  );
  res.json(rows.rows);
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
