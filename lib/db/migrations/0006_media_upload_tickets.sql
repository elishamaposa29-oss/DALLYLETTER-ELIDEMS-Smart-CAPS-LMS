BEGIN;

CREATE TABLE IF NOT EXISTS public.media_upload_tickets (
  id uuid PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  route_key text NOT NULL CHECK (length(route_key) BETWEEN 1 AND 100),
  target_type text NOT NULL CHECK (length(target_type) BETWEEN 1 AND 60),
  target_id text NOT NULL CHECK (length(target_id) BETWEEN 1 AND 160),
  storage_key uuid NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (length(mime_type) BETWEEN 1 AND 160),
  max_bytes bigint NOT NULL CHECK (max_bytes > 0 AND max_bytes <= 262144000),
  expected_sha256 char(64),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'uploaded', 'consumed', 'expired', 'rejected')),
  expires_at timestamptz NOT NULL,
  uploaded_size bigint,
  uploaded_sha256 char(64),
  uploaded_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expected_sha256 IS NULL OR expected_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (uploaded_sha256 IS NULL OR uploaded_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (uploaded_size IS NULL OR uploaded_size >= 0)
);

CREATE INDEX IF NOT EXISTS media_upload_tickets_expiry_idx
  ON public.media_upload_tickets (expires_at)
  WHERE status IN ('issued', 'uploaded');

CREATE INDEX IF NOT EXISTS media_upload_tickets_user_target_idx
  ON public.media_upload_tickets (user_id, route_key, target_type, target_id, created_at DESC);

COMMIT;
