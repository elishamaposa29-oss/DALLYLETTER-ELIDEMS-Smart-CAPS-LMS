import { pool } from "@workspace/db";
import { isOwnerRole, normalizeRole } from "./role-access";

type MediaPrincipal = NonNullable<Express.Request["currentUser"]>;

/**
 * Returns null for pre-ticket legacy objects (which retain their existing
 * authenticated compatibility path), otherwise enforces the ticket's
 * resource-specific delivery policy. Upload authorization is not a substitute
 * for download authorization: every ticketed object is checked against its
 * current resource reference before bytes are streamed.
 */
export async function authorizeTicketedMediaDelivery(storageKey: string, actor: MediaPrincipal): Promise<boolean | null> {
  if (!/^[a-f0-9-]{36}$/i.test(storageKey)) return false;
  const result = await pool.query(
    "SELECT user_id, route_key, target_type, target_id FROM public.media_upload_tickets WHERE storage_key=$1 AND status='consumed' ORDER BY consumed_at DESC LIMIT 1",
    [storageKey],
  );
  const ticket = result.rows[0] as { user_id: number; route_key: string; target_type: string; target_id: string } | undefined;
  if (!ticket) return null;
  if (Number(ticket.user_id) === Number(actor.id) || isOwnerRole(actor.role)) return true;

  const role = normalizeRole(actor.role);
  const key = `%${storageKey}%`;
  switch (ticket.route_key) {
    case "lessons.media": {
      if (ticket.target_type === "study-group-cover") {
        const groupId = Number(ticket.target_id);
        if (!Number.isSafeInteger(groupId) || groupId <= 0) return false;
        const [group] = (await pool.query("SELECT creator_id FROM public.study_groups WHERE id=$1", [groupId])).rows;
        if (!group) return false;
        if (Number(group.creator_id) === Number(actor.id)) return true;
        const member = await pool.query("SELECT 1 FROM public.study_group_members WHERE group_id=$1 AND user_id=$2 LIMIT 1", [groupId, actor.id]);
        return member.rows.length > 0;
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
        "SELECT s.student_id, a.teacher_id FROM public.assignment_submissions s JOIN public.assignments a ON a.id=s.assignment_id WHERE (s.file_url LIKE $1 OR s.content LIKE $1) LIMIT 1",
        [key],
      );
      const row = submission.rows[0];
      return Boolean(row && (Number(row.student_id) === Number(actor.id) || Number(row.teacher_id) === Number(actor.id)));
    }
    case "exercises.question-media": {
      const question = await pool.query(
        "SELECT e.created_by, e.status FROM public.exercise_questions q JOIN public.exercises e ON e.id=q.exercise_id WHERE q.config::text LIKE $1 LIMIT 1",
        [key],
      );
      const row = question.rows[0];
      return Boolean(row && (Number(row.created_by) === Number(actor.id) || (["student", "learner", "prefect"].includes(role) && row.status === "published")));
    }
    case "exercises.answer-media": {
      const answer = await pool.query(
        "SELECT s.learner_id, e.created_by FROM public.exercise_answers a JOIN public.exercise_submissions s ON s.id=a.submission_id JOIN public.exercises e ON e.id=s.exercise_id WHERE (a.media_reference LIKE $1 OR a.draw_data::text LIKE $1) LIMIT 1",
        [key],
      );
      const row = answer.rows[0];
      return Boolean(row && (Number(row.learner_id) === Number(actor.id) || Number(row.created_by) === Number(actor.id)));
    }
    case "handRaises.raise-hand.with-media": {
      const handRaise = await pool.query(
        "SELECT h.student_id, c.teacher_id FROM public.hand_raises h JOIN public.classes c ON c.id=h.class_id WHERE h.media_url LIKE $1 LIMIT 1",
        [key],
      );
      const row = handRaise.rows[0];
      return Boolean(row && (Number(row.student_id) === Number(actor.id) || Number(row.teacher_id) === Number(actor.id)));
    }
    case "users.me.avatar":
    case "users.me.cover":
      // Profile imagery is deliberately displayable in authenticated profile
      // and directory surfaces; private profile fields remain independently gated.
      return true;
    default:
      return false;
  }
}
