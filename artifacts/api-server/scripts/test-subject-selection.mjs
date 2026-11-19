import assert from "node:assert/strict";
import { pool } from "@workspace/db";

const ensure = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE IF NOT EXISTS learner_subjects (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,subjects text[] NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now())`);
    await client.query(`CREATE TABLE IF NOT EXISTS teacher_subjects (user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,teaching_subjects text[] NOT NULL DEFAULT '{}',subjects_to_teach text[] NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now())`);
    await client.query(`CREATE TABLE IF NOT EXISTS dallyletter_subject_catalog (id bigserial PRIMARY KEY,subject text NOT NULL,normalized_subject text NOT NULL UNIQUE,created_by integer REFERENCES users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now())`);
    await client.query(`CREATE TABLE IF NOT EXISTS dallyletter_subject_interactions (user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,normalized_subject text NOT NULL,subject text NOT NULL,interaction_count integer NOT NULL DEFAULT 0 CHECK (interaction_count >= 0),last_interacted_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY (user_id,normalized_subject))`);
    const suffix = Date.now().toString();
    const teacher = (await client.query(
      "INSERT INTO users(email,password_hash,name,role,teacher_application_status) VALUES($1,'test-hash','Selection Test Teacher','teacher','approved') RETURNING id",
      ["selection-teacher-" + suffix + "@example.test"],
    )).rows[0].id;
    const learner = (await client.query(
      "INSERT INTO users(email,password_hash,name,role,teacher_application_status) VALUES($1,'test-hash','Selection Test Learner','student','not_applicable') RETURNING id",
      ["selection-learner-" + suffix + "@example.test"],
    )).rows[0].id;

    await client.query("INSERT INTO learner_subjects(user_id,subjects) VALUES($1,$2)", [learner, ["History"]]);
    await client.query("INSERT INTO teacher_subjects(user_id,subjects_to_teach) VALUES($1,$2)", [teacher, ["Chemistry"]]);
    await client.query(
      "INSERT INTO dallyletter_subject_catalog(subject,normalized_subject,created_by) VALUES('Global Catalogue Subject','global catalogue subject',$1)",
      [teacher],
    );
    await client.query(
      "INSERT INTO dallyletter_subject_interactions(user_id,normalized_subject,subject,interaction_count,last_interacted_at) VALUES($1,'history','History',3,now()-interval '1 day')",
      [learner],
    );

    const lesson = await client.query(
      "INSERT INTO lessons(title,subject,type,teacher_id,teacher_name) VALUES('Selection test lesson','Chemistry','notes',$1,'Selection Test Teacher') RETURNING id",
      [teacher],
    );
    const liveClass = await client.query(
      "INSERT INTO classes(title,subject,meet_link,teacher_id,teacher_name) VALUES('Selection test class','Mathematics','https://example.test/meet',$1,'Selection Test Teacher') RETURNING id",
      [teacher],
    );
    await client.query(
      "INSERT INTO attendance(class_id,student_id,student_name,status) VALUES($1,$2,'Selection Test Learner','present')",
      [liveClass.rows[0].id, learner],
    );
    const assignment = await client.query(
      "INSERT INTO assignments(title,subject,due_date,teacher_id,teacher_name) VALUES('Selection test assignment','Biology','2099-01-01',$1,'Selection Test Teacher') RETURNING id",
      [teacher],
    );
    await client.query(
      "INSERT INTO assignment_submissions(assignment_id,student_id,student_name) VALUES($1,$2,'Selection Test Learner')",
      [assignment.rows[0].id, learner],
    );
    const poll = await client.query(
      "INSERT INTO polls(title,subject,created_by) VALUES('Selection test poll','Physics',$1) RETURNING id",
      [teacher],
    );
    await client.query(
      "INSERT INTO poll_submissions(poll_id,student_id) VALUES($1,$2)",
      [poll.rows[0].id, learner],
    );
    const group = await client.query(
      "INSERT INTO study_groups(name,subject,creator_id,creator_name) VALUES('Selection test group','Geography',$1,'Selection Test Learner') RETURNING id",
      [learner],
    );
    await client.query(
      "INSERT INTO study_group_members(group_id,user_id) VALUES($1,$2)",
      [group.rows[0].id, learner],
    );

    const catalog = await client.query(`SELECT min(subject) AS subject,count(*)::int AS usage_count FROM (
      SELECT trim(subject) AS subject FROM lessons WHERE subject IS NOT NULL AND trim(subject) <> ''
      UNION ALL SELECT trim(subject) FROM classes WHERE subject IS NOT NULL AND trim(subject) <> ''
      UNION ALL SELECT trim(subject) FROM assignments WHERE subject IS NOT NULL AND trim(subject) <> ''
      UNION ALL SELECT trim(subject) FROM polls WHERE subject IS NOT NULL AND trim(subject) <> ''
      UNION ALL SELECT trim(subject) FROM study_groups WHERE subject IS NOT NULL AND trim(subject) <> ''
      UNION ALL SELECT trim(value) FROM learner_subjects CROSS JOIN LATERAL unnest(subjects) AS learner_subject(value)
      UNION ALL SELECT trim(value) FROM teacher_subjects CROSS JOIN LATERAL unnest(subjects_to_teach) AS teacher_subject(value)
    ) subject_sources WHERE subject <> '' GROUP BY lower(subject)`);
    const custom = await client.query("SELECT subject FROM dallyletter_subject_catalog");
    const names = new Set([...catalog.rows, ...custom.rows].map(row => String(row.subject).toLowerCase()));
    for (const subject of ["history", "chemistry", "global catalogue subject", "mathematics", "biology", "physics", "geography"]) {
      assert.ok(names.has(subject), "Catalogue omitted " + subject);
    }

    const activity = await client.query(`SELECT min(subject) AS subject, sum(interaction_count)::int AS interaction_count, max(last_interacted_at) AS last_interacted_at
      FROM (
        SELECT subject,interaction_count,last_interacted_at FROM dallyletter_subject_interactions WHERE user_id=$1
        UNION ALL SELECT c.subject,count(*)::int,max(a.joined_at) FROM attendance a JOIN classes c ON c.id=a.class_id WHERE a.student_id=$1 AND lower(a.status)='present' GROUP BY lower(c.subject),c.subject
        UNION ALL SELECT a.subject,count(*)::int,max(s.submitted_at) FROM assignment_submissions s JOIN assignments a ON a.id=s.assignment_id WHERE s.student_id=$1 GROUP BY lower(a.subject),a.subject
        UNION ALL SELECT p.subject,count(*)::int,max(s.completed_at) FROM poll_submissions s JOIN polls p ON p.id=s.poll_id WHERE s.student_id=$1 AND p.subject IS NOT NULL GROUP BY lower(p.subject),p.subject
        UNION ALL SELECT g.subject,count(*)::int,max(m.joined_at) FROM study_group_members m JOIN study_groups g ON g.id=m.group_id WHERE m.user_id=$1 GROUP BY lower(g.subject),g.subject
        UNION ALL SELECT subject,count(*)::int,max(created_at) FROM lessons WHERE teacher_id=$1 GROUP BY lower(subject),subject
        UNION ALL SELECT subject,count(*)::int,max(created_at) FROM classes WHERE teacher_id=$1 GROUP BY lower(subject),subject
        UNION ALL SELECT subject,count(*)::int,max(created_at) FROM assignments WHERE teacher_id=$1 GROUP BY lower(subject),subject
        UNION ALL SELECT subject,count(*)::int,max(created_at) FROM polls WHERE created_by=$1 AND subject IS NOT NULL GROUP BY lower(subject),subject
      ) subject_activity
      GROUP BY lower(subject) ORDER BY interaction_count DESC,last_interacted_at DESC`, [learner]);
    const learnerActivity = new Map(activity.rows.map(row => [String(row.subject).toLowerCase(), Number(row.interaction_count)]));
    assert.equal(learnerActivity.get("history"), 3, "Personal selector click/use count was not preserved");
    for (const subject of ["mathematics", "biology", "physics", "geography"]) {
      assert.ok(learnerActivity.has(subject), "Personal ranking omitted learner activity for " + subject);
    }
    await client.query("ROLLBACK");
    console.log("Shared subject catalogue and personalized activity ranking integration passed.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

ensure().catch(error => { console.error(error); process.exitCode = 1; });
