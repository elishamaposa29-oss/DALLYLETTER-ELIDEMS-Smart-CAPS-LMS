# Database Recovery and Migration — Safety-First Runbook

This document is a procedure, not permission to alter production. **Do not delete, replace, or overwrite a database until the replacement is proven usable and the owner explicitly confirms permanent data loss is acceptable.**

## Current rebuild state

- The canonical Render API is DALLYLETTER-ELIDEMS-Smart-CAPS-LMS-4, service ID srv-d9ihv8favr4c73assgag, branch main.
- A replacement PostgreSQL database is connected through the Render service's DATABASE_URL.
- The original temporary PostgreSQL instance was suspended/expired. No verified dump or restore exists.
- The replacement database is intended to be empty. Its schema is initialized from the canonical Drizzle schema during build; this does not recover old users or records.
- A successful build does not prove signup, login, roles, or feature workflows are healthy. Test them against the live service before declaring readiness.

## Safe verification order

1. Confirm Render deploy uses the expected main commit and the intended database URL. Never print secrets in logs or tickets.
2. Confirm the database schema exists and all required tables/columns are present.
3. Confirm API health and successful startup with no SQL errors.
4. Test ordinary signup/login and secure owner provisioning. Never ship a default owner password.
5. Test core features using authenticated roles: create/edit/reload lessons, create/publish/attempt/mark exercises, lesson requests, groups, polls, dashboards, and permissions.
6. Confirm data survives page reload and API process restart.
7. Only after the replacement is accepted, confirm whether the old database may be permanently deleted.

## Recovery and backup

- Render's temporary free database may no longer be recoverable. Ask Render support whether any recovery/export window remains.
- Do not claim a backup exists unless an actual dump was created, stored securely, and successfully restored to an isolated target.
- Keep credentials in managed secret storage, never in source control.
- Do not use an automatic schema push as a substitute for tested migrations in a long-lived production database.
- Keep similarly named Render services until their consumers, database references, and deployment targets are mapped.

## Release gates

Required evidence: passing CI and Release Safety on the exact commit, successful canonical Render deployment, healthy API startup, authenticated role tests, persistence/reload tests, and no unexplained SQL errors. Media and messaging can remain explicitly deferred only if their failures do not break core learning features.
