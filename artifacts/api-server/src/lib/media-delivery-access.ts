import { pool } from "@workspace/db";
import { canAccessManager, canModerateUser, isOwnerRole, isSeniorManager, normalizeRole } from "./role-access";
import { managerHasPermission } from "./manager-permission-policy";
import { canViewProfileSection } from "../routes/profileConnections";

type MediaPrincipal = NonNullable<Express.Request["currentUser"]>;

/**
 * Enforces resource-specific delivery policy for ticketed objects and
 * reference-based authorization for legacy objects. Upload authorization is
 * not a substitute for download authorization: media access is checked against
 * the current resource reference before bytes are streamed.
 */
export async function authorizeTicketedMediaDelivery(storageKey: string, actor: MediaPrincipal): Promise<boolean> {
  if (!/^[a-f0-9-]{36}$/i.test(storageKey)) return false;
  const result = await pool.query(
    "SELECT user_id, route_key, target_type, target_id, status FROM public.media_upload_tickets WHERE storage_key=$1 ORDER BY created_at DESC LIMIT 1",
    [storageKey],
  );
  const ticket = result.rows[0] as { user_id: number; route_key: string; target_type: string; target_id: string; status: string } | undefined;
  if (!ticket) return authorizeLegacyMediaReference(storageKey, actor);
  if (ticket.status !== "consumed") return false;
  if (Number(ticket.user_id) === Number(actor.id) || isOwnerRole(actor.role)) return true;

  const role = normalizeRole(actor.role);
  const key = `%${storageKey}%`;
  switch (ticket.route_key) {
    case "lessons.media": {
      if (ticket.target_type === "study-group-cover") {
        const groupId = Number(ticket.target_id);
        if (!Number.isSafeInteger(groupId) || groupId <= 0) return false;
        const [group] = (await pool.query(
          "SELECT g.creator_id, u.role AS creator_role, u.is_manager AS creator_is_manager, u.manager_level AS creator_manager_level FROM public.study_groups g JOIN public.users u ON u.id=g.creator_id WHERE g.id=$1",
          [groupId],
        )).rows;
        if (!group) return false;
        if (isOwnerRole(actor.role) || Number(group.creator_id) === Number(actor.id)) return true;
        const creator = { role: group.creator_role, isManager: group.creator_is_manager, managerLevel: group.creator_manager_level };
        if (isOwnerRole(creator.role)) return false;
        if (canAccessManager(actor)) return canModerateUser(actor, creator);
        // Study-group discovery/detail APIs allow authenticated non-manager
        // users to view groups before joining; preserve that visibility rule.
        return true;
      }
      if (ticket.target_type === "lesson-media-library") {
        const grade = typeof actor.grade === "string" ? actor.grade : null;
        const lesson = await pool.query(
          "SELECT 1 FROM public.lessons WHERE (media_url LIKE $1 OR content LIKE $1) AND ($2::text IS NULL OR grade IS NULL OR lower(trim(grade))=lower(trim($2))) LIMIT 1",
          [key, grade],
        );
        return lesson.rows.length > 0;
      }
      return false;
    }
    case "assignments.material": {
      const grade = typeof actor.grade === "string" ? actor.grade : null;
      const assignment = await pool.query(
        "SELECT 1 FROM public.assignments WHERE attachment_url LIKE $1 AND status='active' AND reference_material_hidden=false AND ($2::text IS NULL OR grade IS NULL OR lower(trim(grade))=lower(trim($2))) LIMIT 1",
        [key, grade],
      );
      return assignment.rows.length > 0;
    }
    case "assignments.submission-material": {
      const submission = await pool.query(
        "SELECT s.student_id, a.teacher_id, u.role AS teacher_role, u.is_manager AS teacher_is_manager, u.manager_level AS teacher_manager_level FROM public.assignment_submissions s JOIN public.assignments a ON a.id=s.assignment_id LEFT JOIN public.users u ON u.id=a.teacher_id WHERE (s.file_url LIKE $1 OR s.content LIKE $1) LIMIT 1",
        [key],
      );
      const row = submission.rows[0];
      if (!row) return false;
      if (Number(row.student_id) === Number(actor.id) || Number(row.teacher_id) === Number(actor.id)) return true;
      return canAccessManager(actor) && await managerHasPermission(actor, "recordbook.view")
        && canModerateUser(actor, { role: row.teacher_role, isManager: row.teacher_is_manager, managerLevel: row.teacher_manager_level });
    }
    case "exercises.question-media": {
      const question = await pool.query(
        "SELECT e.created_by, e.status, e.grade, u.role AS creator_role, u.is_manager AS creator_is_manager, u.manager_level AS creator_manager_level FROM public.exercise_questions q JOIN public.exercises e ON e.id=q.exercise_id LEFT JOIN public.users u ON u.id=e.created_by WHERE q.config::text LIKE $1 LIMIT 1",
        [key],
      );
      const row = question.rows[0];
      if (!row) return false;
      if (Number(row.created_by) === Number(actor.id)) return true;
      if (canAccessManager(actor) && await managerHasPermission(actor, "users.override.teacher")
        && canModerateUser(actor, { role: row.creator_role, isManager: row.creator_is_manager, managerLevel: row.creator_manager_level })) return true;
      return ["student", "learner", "prefect"].includes(role) && row.status === "published"
        && (grade == null || row.grade == null || String(row.grade).trim().toLowerCase() === grade.trim().toLowerCase());
    }
    case "exercises.answer-media": {
      const answer = await pool.query(
        "SELECT s.learner_id, e.created_by, u.role AS creator_role, u.is_manager AS creator_is_manager, u.manager_level AS creator_manager_level FROM public.exercise_answers a JOIN public.exercise_submissions s ON s.id=a.submission_id JOIN public.exercises e ON e.id=s.exercise_id LEFT JOIN public.users u ON u.id=e.created_by WHERE (a.media_reference LIKE $1 OR a.draw_data::text LIKE $1) LIMIT 1",
        [key],
      );
      const row = answer.rows[0];
      if (!row) return false;
      if (Number(row.learner_id) === Number(actor.id) || Number(row.created_by) === Number(actor.id)) return true;
      return canAccessManager(actor) && await managerHasPermission(actor, "recordbook.view")
        && canModerateUser(actor, { role: row.creator_role, isManager: row.creator_is_manager, managerLevel: row.creator_manager_level });
    }
    case "handRaises.raise-hand.with-media": {
      const handRaise = await pool.query(
        "SELECT h.student_id, c.teacher_id FROM public.hand_raises h JOIN public.classes c ON c.id=h.class_id WHERE h.media_url LIKE $1 LIMIT 1",
        [key],
      );
      const row = handRaise.rows[0];
      return Boolean(row && (Number(row.student_id) === Number(actor.id) || Number(row.teacher_id) === Number(actor.id) || isSeniorManager(actor)));
    }
    case "users.me.avatar":
    case "users.me.cover": {
      const profileOwnerId = Number(ticket.target_id);
      if (!Number.isSafeInteger(profileOwnerId) || profileOwnerId <= 0) return false;
      return canViewProfileSection(actor, profileOwnerId, "overview");
    }
    default:
      return false;
  }
}

/**
 * Older media objects predate upload tickets. They remain readable only when
 * a current database resource still references the key and the requester is
 * allowed to view that resource. Unreferenced legacy objects fail closed.
 */
async function authorizeLegacyMediaReference(storageKey: string, actor: MediaPrincipal): Promise<boolean> {
  const key = `%${storageKey}%`;
  const role = normalizeRole(actor.role);
  const grade = typeof actor.grade === "string" ? actor.grade : null;

  const lesson = await pool.query(
    "SELECT 1 FROM public.lessons WHERE (media_url LIKE $1 OR content LIKE $1) AND ($2::text IS NULL OR grade IS NULL OR lower(trim(grade))=lower(trim($2))) LIMIT 1",
    [key, grade],
  );
  if (lesson.rows.length) return true;

  const group = await pool.query(
    "SELECT g.id, g.creator_id, u.role AS creator_role, u.is_manager AS creator_is_manager, u.manager_level AS creator_manager_level FROM public.study_groups g JOIN public.users u ON u.id=g.creator_id WHERE g.cover_image_url LIKE $1 LIMIT 1",
    [key],
  );
  if (group.rows[0]) {
    const g = group.rows[0];
    if (isOwnerRole(actor.role) || Number(g.creator_id) === Number(actor.id)) return true;
    const creator = { role: g.creator_role, isManager: g.creator_is_manager, managerLevel: g.creator_manager_level };
    if (!isOwnerRole(creator.role) && (!canAccessManager(actor) || canModerateUser(actor, creator))) return true;
  }

  const assignment = await pool.query(
    "SELECT 1 FROM public.assignments WHERE attachment_url LIKE $1 AND status='active' AND reference_material_hidden=false AND ($2::text IS NULL OR grade IS NULL OR lower(trim(grade))=lower(trim($2))) LIMIT 1",
    [key, grade],
  );
  if (assignment.rows.length) return true;

  const submission = await pool.query(
    "SELECT s.student_id, a.teacher_id FROM public.assignment_submissions s JOIN public.assignments a ON a.id=s.assignment_id WHERE (s.file_url LIKE $1 OR s.content LIKE $1) LIMIT 1",
    [key],
  );
  if (submission.rows[0] && (Number(submission.rows[0].student_id) === Number(actor.id) || Number(submission.rows[0].teacher_id) === Number(actor.id))) return true;

  const question = await pool.query(
    "SELECT e.created_by, e.status FROM public.exercise_questions q JOIN public.exercises e ON e.id=q.exercise_id WHERE q.config::text LIKE $1 LIMIT 1",
    [key],
  );
  if (question.rows[0] && (Number(question.rows[0].created_by) === Number(actor.id) || (["student", "learner", "prefect"].includes(role) && question.rows[0].status === "published"))) return true;

  const answer = await pool.query(
    "SELECT s.learner_id, e.created_by FROM public.exercise_answers a JOIN public.exercise_submissions s ON s.id=a.submission_id JOIN public.exercises e ON e.id=s.exercise_id WHERE (a.media_reference LIKE $1 OR a.draw_data::text LIKE $1) LIMIT 1",
    [key],
  );
  if (answer.rows[0] && (Number(answer.rows[0].learner_id) === Number(actor.id) || Number(answer.rows[0].created_by) === Number(actor.id))) return true;

  const handRaise = await pool.query(
    "SELECT h.student_id, c.teacher_id FROM public.hand_raises h JOIN public.classes c ON c.id=h.class_id WHERE h.media_url LIKE $1 LIMIT 1",
    [key],
  );
  if (handRaise.rows[0] && (Number(handRaise.rows[0].student_id) === Number(actor.id) || Number(handRaise.rows[0].teacher_id) === Number(actor.id))) return true;

  const avatar = await pool.query("SELECT id FROM public.users WHERE avatar_url LIKE $1 LIMIT 1", [key]);
  if (avatar.rows[0] && await canViewProfileSection(actor, Number(avatar.rows[0].id), "overview")) return true;

  const coverTable = await pool.query("SELECT to_regclass('public.user_profile_covers') AS table_name");
  if (coverTable.rows[0]?.table_name) {
    const cover = await pool.query("SELECT user_id FROM public.user_profile_covers WHERE media_url LIKE $1 LIMIT 1", [key]);
    if (cover.rows[0] && await canViewProfileSection(actor, Number(cover.rows[0].user_id), "overview")) return true;
  }

  return false;
}
