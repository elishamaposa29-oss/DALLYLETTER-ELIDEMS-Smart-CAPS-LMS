-- Profile Hub additive foundation. Safe to re-run; never alters or deletes users.
BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notification_email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notification_email_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.teacher_qualifications (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  institution text,
  year integer,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified')),
  document_id integer REFERENCES public.teacher_documents(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (year IS NULL OR year BETWEEN 1900 AND 2200)
);
CREATE INDEX IF NOT EXISTS teacher_qualifications_user_idx ON public.teacher_qualifications(user_id);

CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  teaching_subjects text[] NOT NULL DEFAULT '{}',
  subjects_to_teach text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payout_preferences (
  user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('ecocash','paypal','bank')),
  ecocash_phone text,
  paypal_email text,
  bank_name text,
  account_name_holder text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (method = 'ecocash' AND ecocash_phone IS NOT NULL AND length(trim(ecocash_phone)) BETWEEN 7 AND 40)
    OR (method = 'paypal' AND paypal_email IS NOT NULL AND length(trim(paypal_email)) <= 254)
    OR (method = 'bank' AND bank_name IS NOT NULL AND account_name_holder IS NOT NULL)
  )
);

-- Preserve legacy CV JSON and copy only the legacy education field as an unverified row.
-- The original JSON is never overwritten or deleted.
DO $$
BEGIN
  IF to_regclass('public.teacher_profiles') IS NOT NULL THEN
    INSERT INTO public.teacher_qualifications (user_id, title, source, verification_status)
    SELECT tp.user_id, left(trim(tp.cv->>'education'), 500), 'legacy_migration', 'pending'
    FROM public.teacher_profiles tp
    WHERE jsonb_typeof(tp.cv) = 'object'
      AND nullif(trim(tp.cv->>'education'), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.teacher_qualifications q
        WHERE q.user_id = tp.user_id AND q.source = 'legacy_migration'
          AND q.title = left(trim(tp.cv->>'education'), 500)
      );
  END IF;
END $$;
COMMIT;
