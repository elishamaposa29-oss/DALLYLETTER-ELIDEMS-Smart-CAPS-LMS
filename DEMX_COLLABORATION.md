# DEMx Collaboration Workflow

## Source of truth

- GitHub is the shared source of truth.
- VS Code is the primary development environment.
- Replit is a secondary development environment.
- The collaboration branch is `DEMx-Development-Mode-📳😏`, the Git-compatible form of `DEMx Development Mode 📳😏` (Git rejects spaces in branch names).
- `main` is production-protected and must not be developed on directly.

## Before and during work

- Before editing, verify the branch with `git branch --show-current`, then run `git status`, `git fetch --prune origin`, `git log`, and `git rev-list --left-right --count HEAD...@{upstream}`.
- If the worktree is dirty, stop and preserve those changes. If the branch is behind, inspect the incoming commits and rebase or merge only after confirming it will not overwrite local work.
- Before pushing, run `git diff --check` and inspect `git diff`; reject non-fast-forward pushes and resolve conflicts explicitly rather than force-pushing.
- Treat files as shared resources: announce the files or feature area being changed, avoid simultaneous edits in VS Code and Replit, and pull/sync before resuming after another agent pushes.
- Search for existing routes, components, helpers, and migrations before adding an implementation; extend the existing owner instead of creating duplicate logic.
- Keep commits small, meaningful, and descriptive. Use commit messages to communicate behavior, affected areas, and follow-up needs to the other environment.
- Test changes before pushing them to GitHub, then push completed work so both environments can synchronize from GitHub.

## Protection rules

- Do not force-push, reset destructively, delete, or automatically merge `main`.
- Changes reach `main` only after tests pass, the build succeeds, review is complete, no secrets are present, and database changes are confirmed non-destructive.
- Never commit secrets or credentials.
- Never perform destructive operations against production databases.
- Use Git history, revert, and recovery tools for rollback. Before significant work, record the known-good commit and, when appropriate, create a dated checkpoint tag such as `demx-checkpoint-YYYYMMDD-HHMM`.
- Treat `main` as protected: no direct development, force-push, destructive reset, deletion, or automatic merge. Merge only through reviewed changes after tests, builds, secret checks, and database-safety review pass.

## Safe handoff

- A handoff must include the commit pushed, files changed, checks run, and any unresolved conflict or follow-up.
- The next environment must fetch and inspect that commit before editing. Never overwrite uncommitted work from either environment.
