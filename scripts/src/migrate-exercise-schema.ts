import { pool } from "@workspace/db";

const statements = [
  `CREATE TABLE IF NOT EXISTS exercises (
    id serial PRIMARY KEY,
    lesson_id integer NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    created_by integer NOT NULL REFERENCES users(id),
    title text NOT NULL,
    instructions text,
    status text NOT NULL DEFAULT 'draft',
    grade text,
    stream text,
    layout jsonb NOT NULL DEFAULT '{"version":1,"page":"book"}'::jsonb,
    total_marks numeric(8,2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS exercises_lesson_idx ON exercises(lesson_id)`,
  `CREATE INDEX IF NOT EXISTS exercises_status_idx ON exercises(status)`,

  `CREATE TABLE IF NOT EXISTS exercise_questions (
    id serial PRIMARY KEY,
    exercise_id integer NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0,
    prompt text NOT NULL,
    type text NOT NULL DEFAULT 'input',
    marks_allocated numeric(8,2) NOT NULL DEFAULT 1,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS exercise_questions_exercise_idx ON exercise_questions(exercise_id)`,

  `CREATE TABLE IF NOT EXISTS exercise_options (
    id serial PRIMARY KEY,
    question_id integer NOT NULL REFERENCES exercise_questions(id) ON DELETE CASCADE,
    label text NOT NULL,
    value text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    is_correct boolean NOT NULL DEFAULT false
  )`,
  `CREATE INDEX IF NOT EXISTS exercise_options_question_idx ON exercise_options(question_id)`,

  `CREATE TABLE IF NOT EXISTS exercise_submissions (
    id serial PRIMARY KEY,
    exercise_id integer NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    learner_id integer NOT NULL REFERENCES users(id),
    attempt_number integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'submitted',
    total_score numeric(8,2) NOT NULL DEFAULT 0,
    percentage numeric(6,2),
    submitted_at timestamptz NOT NULL DEFAULT now(),
    marked_at timestamptz,
    returned_at timestamptz
  )`,
  `ALTER TABLE exercise_submissions ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1`,
  `CREATE UNIQUE INDEX IF NOT EXISTS exercise_submission_attempt_idx ON exercise_submissions(exercise_id, learner_id, attempt_number)`,
  `CREATE INDEX IF NOT EXISTS exercise_submissions_exercise_idx ON exercise_submissions(exercise_id)`,

  `CREATE TABLE IF NOT EXISTS exercise_answers (
    id serial PRIMARY KEY,
    submission_id integer NOT NULL REFERENCES exercise_submissions(id) ON DELETE CASCADE,
    question_id integer NOT NULL REFERENCES exercise_questions(id) ON DELETE CASCADE,
    text_answer text,
    selected_value text,
    draw_data jsonb,
    media_reference text,
    awarded_marks numeric(8,2) NOT NULL DEFAULT 0,
    correction_notes text,
    marked_by integer REFERENCES users(id),
    marked_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS exercise_answers_submission_idx ON exercise_answers(submission_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS exercise_answer_question_idx ON exercise_answers(submission_id, question_id)`,

  `CREATE TABLE IF NOT EXISTS exercise_media (
    id serial PRIMARY KEY,
    exercise_id integer REFERENCES exercises(id) ON DELETE CASCADE,
    question_id integer REFERENCES exercise_questions(id) ON DELETE CASCADE,
    answer_id integer REFERENCES exercise_answers(id) ON DELETE CASCADE,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    storage_key text NOT NULL,
    size_bytes integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT exercise_media_owner_check CHECK (exercise_id IS NOT NULL OR question_id IS NOT NULL OR answer_id IS NOT NULL)
  )`,
  `CREATE INDEX IF NOT EXISTS exercise_media_exercise_idx ON exercise_media(exercise_id)`,
  `CREATE INDEX IF NOT EXISTS exercise_media_question_idx ON exercise_media(question_id)`,
  `CREATE INDEX IF NOT EXISTS exercise_media_answer_idx ON exercise_media(answer_id)`,
];

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of statements) {
      await client.query(statement);
    }
    await client.query("COMMIT");
    console.log("Exercise schema migration completed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Exercise schema migration failed; transaction rolled back.");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
