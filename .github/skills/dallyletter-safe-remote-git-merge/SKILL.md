---
name: dallyletter-safe-remote-git-merge
description: Safely reconcile a Dallyletter pull-request branch with main using the connected GitHub remote Git Data tools. Use whenever a PR is diverged or has merge conflicts, including legacy DEMx Development branches.
---

# Dallyletter safe remote Git merge

## Purpose
Perform real Git history reconciliation remotely through the connected GitHub tools. Do not assume a local checkout or Codespaces is required. Never claim a merge is complete until GitHub confirms the new branch head and comparison.

## Required sequence
1. Read PR metadata and record the exact base branch, head branch, head SHA, base SHA, PR state, and mergeability.
2. Read the current base and head refs again immediately before writing. Never rely on stale SHAs.
3. Compare base...head and identify the merge base, ahead/behind counts, and every changed path on both sides.
4. Retrieve the merge-base, base, and head versions for overlapping paths. Reconcile using a true three-way merge:
   - Preserve all independent changes from both sides.
   - For non-overlapping paths, retain the side's change.
   - For overlapping paths, merge intent and behavior, not merely one side's file.
   - Preserve API contracts, authorization checks, role permissions, migrations, existing compatibility, tests, and user-approved design decisions.
   - Never resolve every conflict by choosing 'ours' or 'theirs' globally.
5. Build a Git tree based on the latest base tree. Include the complete merged content for all changed paths, preserving file modes and executable bits. Do not omit unrelated base changes.
6. Create a genuine two-parent merge commit: first parent = PR head, second parent = latest base (or vice versa consistently); message clearly identifies the merge. The tree must contain both sides' reconciled work.
7. Update only the PR head branch using a compare-and-swap/expected-SHA lease. Prefer a normal fast-forward update when possible; if the merge commit is not a descendant of the old head, use force-with-lease only with the exact recorded old head SHA and only after verifying the new merge commit has both original parents. Never use an unguarded force update.
8. Re-read PR metadata, branch head, and compare base...head. Verify behind_by=0, head SHA equals the new merge commit, the merge commit has both expected parents, and the PR remains open and unmerged.
9. Inspect CI checks and run available relevant tests. Report checks honestly. Do not merge the PR into main, deploy, mutate production data, or alter secrets unless separately authorized.

## Safety rules
- Never reset, rewrite, delete, or discard the PR's work.
- Never move main while reconciling a PR branch.
- Never fabricate a merge by pointing a branch at the base tree without reapplying PR changes.
- Never mark conflicts resolved without inspecting all overlapping file changes.
- Use expected-SHA/lease protection for branch updates; if the lease fails, re-read the ref and restart reconciliation from the new state.
- If a remote tool cannot retrieve required file contents or safely update refs, stop before mutation and state the exact missing capability. Do not pretend a partial operation succeeded.
- Preserve legacy branch names, including DEMx Development mode branches; branch naming is not a reason to replace or recreate a branch.
- Keep the user informed with short evidence-based status updates and distinguish completed actions from pending verification.

## Available GitHub remote workflow
Use the connected GitHub tools for PR metadata, compare commits, fetching files/blobs/trees, creating blobs/trees/commits, and guarded ref updates. Tool names and schemas may vary; inspect the available tool catalog rather than assuming a local Git shell exists.
