# DEMx Collaboration Workflow

## Source of truth

- GitHub is the shared source of truth.
- VS Code is the primary development environment.
- Replit is a secondary development environment.
- The collaboration branch is `DEMx-Development-Mode-📳😏`, the Git-compatible form of `DEMx Development Mode 📳😏` (Git rejects spaces in branch names).
- `main` is production-protected and must not be developed on directly.

## Before and during work

- Check `git status`, the current branch, recent commits, and remote state before starting.
- Pull or rebase safely when appropriate; never overwrite uncommitted work.
- Avoid editing the same files simultaneously in VS Code and Replit.
- Keep commits small, meaningful, and descriptive; use Git commits to communicate important changes.
- Test changes before pushing them to GitHub.
- Push completed work so both environments can synchronize from GitHub.

## Protection rules

- Do not force-push, reset destructively, delete, or automatically merge `main`.
- Changes reach `main` only after tests pass, the build succeeds, review is complete, no secrets are present, and database changes are confirmed non-destructive.
- Never commit secrets or credentials.
- Never perform destructive operations against production databases.
- Use Git history, revert, and recovery tools for rollback. Create a dated checkpoint tag before significant work when appropriate.
