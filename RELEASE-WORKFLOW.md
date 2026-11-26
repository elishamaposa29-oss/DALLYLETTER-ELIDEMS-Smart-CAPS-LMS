# DALLYLETTER ELIDEMS release workflow

## Branch purpose

- main: day-to-day development and integration
- staging: pre-production validation and user acceptance testing
- production: the live branch that serves the real platform

## Release flow

1. Developers work on feature branches and merge into main.
2. A pull request from main into staging is created for validation.
3. CI runs build, typecheck, dependency checks, and health verification.
4. If checks pass, the staging deployment is promoted.
5. After approval, merge staging into production.
6. Production deployment only happens after the release is approved.

## Required safety checks

Every release must pass:

- install validation
- type checking
- production build
- API health check
- database connectivity check
- deployment verification

If any check fails, deployment stops automatically.

## Rollback

If a deployment fails:

1. Open the hosting provider dashboard.
2. Re-deploy the previous successful release.
3. If the failing release already changed the database, restore the most recent backup before continuing.
4. Notify the project owner and record the incident.

For Render, use the rollback or redeploy previous version feature from the service dashboard.

## Versioning

Use semantic versioning for releases:

- v1.0.0 for the first stable release
- v1.1.0 for minor feature releases
- v2.0.0 for major changes

## Database safety

- Never run production migrations from development branches.
- Keep database credentials separate for each environment.
- Backup production before any migration or major release.
- Test migrations in staging first.

## Emergency recovery

If production becomes unstable:

1. Stop the release pipeline.
2. Roll back to the last known good deployment.
3. Restore the database from backup if needed.
4. Re-run the health checks after recovery.
