# Manager school-tenancy gap and safe migration plan

## Audit finding

The current Drizzle schema exports a single global `users` table and shared academic, attendance, content, messaging and audit tables. The exported schema index has no school/organisation membership schema. The `users` table has no `school_id`, `organisation_id` or tenant key. Repository searches for `school_id`, `organization_id`, `schoolId`, `organizationId` and `tenant_id` also found no existing tenant model.

Therefore, school-level isolation is **not currently established by a first-class tenant model**. Existing manager permissions are per-user, but a permission grant alone cannot safely identify which school's records the manager may access.

## Safe migration plan (design only; not executed)

1. **Model organisations and schools:** introduce organisation and school records with stable IDs; do not overload the existing user role field.
2. **Memberships:** add a user-to-school membership table with membership status and school-scoped role assignment. Permit multiple memberships only where product rules explicitly support them.
3. **Backfill plan:** create one explicit legacy/default school for existing records, then map current users and records to it using verified ownership/relationship evidence. Do not infer school membership from role, email domain or manager status.
4. **Nullable rollout:** add nullable tenant foreign keys to school-owned records first, with indexes and foreign-key validation. Keep existing reads working while backfill is reviewed.
5. **Scope services:** require a resolved active school membership in manager API context; add school predicates to reads, writes, joins, exports, queues, background jobs, notifications and document downloads.
6. **Prevent cross-school IDOR:** use compound lookups by both record ID and authorised school ID. A matching role or permission must never substitute for membership.
7. **Verify:** add cross-school positive/negative tests for every manager workflow and background job. Compare web and Android using the same resolved membership and permission policy.
8. **Enforce constraints later:** after backfill completeness and audit approval, make required tenant foreign keys non-null and add appropriate composite uniqueness constraints.
9. **Rollout and rollback:** deploy additive schema first, backfill in controlled batches, enable tenant-aware reads behind a server-side feature flag, monitor mismatches, then enforce. Keep a reversible rollback path until all records are mapped.

## Safety boundary

This document records the schema gap and a migration design only. No production data was read or modified for a backfill, no migration was created or run, and no tenant columns or invented school IDs were added. Implementation requires an Owner-approved school/organisation model and verified mapping of existing records.
