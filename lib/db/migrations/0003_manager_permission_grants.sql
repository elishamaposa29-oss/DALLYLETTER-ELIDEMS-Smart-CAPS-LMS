-- Manager permission grants are explicit, per-user, owner-controlled and reversible.
-- This migration is additive and is NOT executed automatically against production.
BEGIN;
CREATE TABLE IF NOT EXISTS public.manager_permission_grants (
  manager_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  granted boolean NOT NULL,
  changed_by integer NOT NULL REFERENCES public.users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (manager_user_id, permission_key)
);
CREATE INDEX IF NOT EXISTS manager_permission_grants_changed_by_idx
  ON public.manager_permission_grants(changed_by, changed_at DESC);
CREATE TABLE IF NOT EXISTS public.manager_permission_history (
  id bigserial PRIMARY KEY,
  manager_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  previous_granted boolean,
  granted boolean NOT NULL,
  changed_by integer NOT NULL REFERENCES public.users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manager_permission_history_manager_idx
  ON public.manager_permission_history(manager_user_id, changed_at DESC);
COMMIT;
