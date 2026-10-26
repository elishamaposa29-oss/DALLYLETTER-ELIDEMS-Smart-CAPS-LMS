-- Profile Hub additive foundation. Safe to re-run; never alters or deletes users.
BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notification_email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS notification_email_verified_at timestamptz;

-- Keep the document table ahead of its qualification foreign key so this migration
-- can run independently on databases that have not provisioned teacher documents yet.
CREATE TABLE IF NOT EXISTS public.teacher_documents (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  data bytea NOT NULL DEFAULT '\\x'::bytea,
  storage_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teacher_documents_user_idx ON public.teacher_documents(user_id);
ALTER TABLE public.teacher_documents ADD COLUMN IF NOT EXISTS storage_key text;

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

-- Additive enrollment source for the existing class-based learning model.
CREATE TABLE IF NOT EXISTS public.enrollments (
  id serial PRIMARY KEY,
  learner_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  class_id integer NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  UNIQUE (learner_id, class_id)
);
CREATE INDEX IF NOT EXISTS enrollments_learner_idx ON public.enrollments(learner_id, enrolled_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_email_verifications (
  user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payout_history (
  id serial PRIMARY KEY,
  teacher_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  method text NOT NULL,
  provider_reference text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  webhook_verified boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payout_history_provider_reference_idx ON public.payout_history(provider_reference) WHERE provider_reference IS NOT NULL;

ALTER TABLE public.teacher_qualifications DROP CONSTRAINT IF EXISTS teacher_qualifications_verification_status_check;
ALTER TABLE public.teacher_qualifications ADD CONSTRAINT teacher_qualifications_verification_status_check CHECK (verification_status IN ('pending','verified','rejected'));

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
