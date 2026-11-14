# Dallyletter Elidems — 5049 interface upgrade tracker

This is an implementation tracker, not a claim that the listed features are complete. Status changes only after code, visual evidence and functional tests support it.

## Shared foundation

| Area | Current state | Remaining acceptance work |
|---|---|---|
| Brand identity | **Implemented on PR branch** | Review authenticated screenshots against the existing brand and founder HTML reference |
| Web theme tokens | **Implemented on PR branch** | Contrast, focus, reduced-motion and responsive visual review |
| Authenticated dashboard shell | **Implemented on PR branch** | Capture each role and check all navigation states |
| Shared Card surface | **Implemented on PR branch** | Inspect dense tables, dialogs and special cards for regressions |
| Android palette | **Implemented on PR branch** | Validate on device sizes and both light/dark modes |
| Teacher-manager navigation | **Duplicate links removed; regression assertion added** | Verify each destination against its grant and role policy |

## Learner learning loop

| Feature | Current state | Remaining acceptance work |
|---|---|---|
| Lessons | **Visual refinement applied** | Authenticated desktop/mobile capture; filters, media, follows, lesson deep links and empty/error states |
| Exercises and drawing | **Visual refinement applied** | Create/open/save/submit; canvas persistence; media; offline/retry; permissions |
| Assignments | **Visual refinement applied** | Upload, submit, deadline validation, resubmit, feedback, returned/graded read-only behavior |
| Teacher exercise marking | Existing workflow retained | Validate marking, rubric/marks, AI assist, return, re-open and learner result visibility |
| RecordBook | Existing shared workspace retained | Confirm that submitted/marked work becomes accurate evidence; PDF/report export and role visibility |
| Polls and quizzes | Existing feature retained | Author, publish, vote/answer, close, results, role checks |
| Live classes | Existing feature retained | Schedule, join, attendance, media/connection failure states |
| Study groups and chat | Existing feature retained | Create, join, message, membership boundaries, moderation and notifications |
| Achievements / BREAK-ELIDEMS | Existing feature retained | Earn/unlock rules, evidence, duplicate prevention, role controls |
| Fees and payment history | Existing feature retained | Provider-confirmed status, partial/full payment, refunds, retry and reconciliation |

## Teacher workflow

| Feature | Current state | Remaining acceptance work |
|---|---|---|
| Teacher dashboard and Profile Hub | Existing feature retained | Authenticated capture; pending/approved/rejected/expired state checks |
| Lesson and class management | Existing feature retained | CRUD, publish, class assignment, learner visibility |
| Assignment and exercise builder | Existing feature retained | Save, publish, attachment, validation, marking queue |
| CV, qualifications and survey | Existing workflow retained | Upload optionality, review, audit history, private chat grants, approval gate |
| Transfer-letter workflow | Existing workflow retained | Review form, approve/reject action and teacher access transition |
| Teacher reports and RecordBook | Existing feature retained | Data accuracy, PDF export, permission checks |

## Manager and Owner workflow

| Feature | Current state | Remaining acceptance work |
|---|---|---|
| Manager dashboard | Existing feature retained | Junior/Senior/Manager account-by-account grant matrix |
| Teacher/learner monitoring | Existing feature retained | Correct filters, actions, pagination and data scope |
| CV/qualification/transfer approvals | Existing workflow retained | Web + Android parity; authorization and audit verification |
| Per-user manager grants | Existing workflow retained | Owner-issued grants, revocation, denial, audit and forbidden-action tests |
| Owner command centre | Existing feature retained | All action destinations and Owner-only controls |
| Payments, finance and staff payments | Existing feature retained | Provider reconciliation, owner-configured fee rules and access restrictions |
| AI settings, safety and audit | Existing feature retained | Provider errors, redaction, policy enforcement, access control |
| Admin | Existing feature retained | Explicitly non-Owner authority; no accidental privilege inheritance |

## Android parity and release

- [ ] Auth/session and account isolation
- [ ] Learner routes and feature interactions
- [ ] Teacher workflows and marking
- [ ] Manager grants and denied states
- [ ] Media, drawing, camera and document uploads
- [ ] Notifications and deep links
- [ ] Offline queue, retries and conflict handling
- [ ] Small-screen, safe-area, keyboard and accessibility review
- [ ] Real API-backed end-to-end acceptance in an isolated test environment
- [ ] Authenticated screenshots for all roles, using approved synthetic showcase accounts
- [ ] Full CI, Android build and preview smoke checks green

## Evidence rules

- HTTP 200 on an SPA shell is route-rewrite evidence only; it is not proof that a protected screen rendered or its action worked.
- A passing typecheck/build is not end-to-end feature acceptance.
- Screenshots from a role may only be captured with an account authorised for that role. Never expose Owner/private screens in public artifacts.
- Do not mark a feature complete without verifying its visible UI, action, API, persistence, permission boundaries, failure states and Android behavior.
- Keep all work on PR #125 until review. No production merge or production data/config changes are included in this task.
