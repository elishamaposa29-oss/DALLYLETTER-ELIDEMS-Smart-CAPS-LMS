-- 0001: legacy tables used by raw-SQL API routes.
-- Apply only after the core Drizzle schema (including public.users) exists.
-- Safe to re-run: existing tables/data are retained; existing-table shape is checked separately.
BEGIN;

CREATE TABLE IF NOT EXISTS public.content_permission_requests (
  id serial PRIMARY KEY,
  requester_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  owner_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  content_id integer NOT NULL,
  requested_action text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
CREATE INDEX IF NOT EXISTS content_permission_requests_owner_idx
  ON public.content_permission_requests(owner_id, status);
CREATE INDEX IF NOT EXISTS content_permission_requests_requester_idx
  ON public.content_permission_requests(requester_id, status);

CREATE TABLE IF NOT EXISTS public.message_media (
  storage_key text PRIMARY KEY,
  message_id integer,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_media_message_id_idx ON public.message_media(message_id);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS public.teacher_documents (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teacher_documents_user_idx ON public.teacher_documents(user_id);

COMMIT;
