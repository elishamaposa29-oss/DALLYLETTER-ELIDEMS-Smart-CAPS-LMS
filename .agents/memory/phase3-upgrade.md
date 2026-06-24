---
name: Phase 3 upgrade patterns
description: Patterns and gotchas from the Phase 3 massive upgrade of DallyLetter Elidems
---

## Backend route patterns

**Always use `Promise<void>` return type and `String(req.params.id)` cast:**
```ts
router.get("/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id)); // avoids TS2345
  if (!row) { res.status(404).json({ error: "Not found" }); return; } // avoid TS7030
  res.json(row);
});
```

**Why:** `req.params` has type `Record<string, string | string[]>` in Express, so direct `parseInt(req.params.id)` fails TS. Using `String(req.params.id)` narrows it. Routes without explicit `: Promise<void>` and proper `return;` on every branch trigger TS7030.

## Frontend async patterns

**Never use async directly in useEffect callbacks or event handlers that return void:**
```ts
// BAD - causes TS7030
const handleSomething = async () => { ... }

// GOOD
const handleSomething = () => {
  void fetch(...).then(r => { ... });
};

// BAD - causes issues
useEffect(() => { await something(); }, []);

// GOOD
useEffect(() => { void something().then(...); }, []);
// OR
const load = () => { void fetch(...).then(...); };
useEffect(() => { load(); }, []);
```

## New schemas added (Phase 3)

All pushed to DB:
- `assignments` + `assignmentSubmissions` — teacher assignments, student submissions, grading
- `attendance` — class join/leave tracking per student
- `ownerAlerts` — incident reports from students/staff to owner
- `staffPayments` — salary/bonus payments to staff members
- `achievements` + `userAchievements` — badge system with leaderboard

## New user fields (Phase 3)

Added to `users` table: `isManager`, `paymentInfo`, `performanceScore`, `badgeCount`, `streakDays`, `bio`, `lastActiveDate`

## Manager role

Not a separate DB role — it's `isManager: boolean` on the `users` table for teachers. Managers get extra nav via `DashboardLayout.tsx` check `(user as any).isManager`. Protected routes use `allowedRoles={["teacher", "owner"]}`.

## Routes registration pattern

Routes that define their own full paths (like `router.get("/owner-alerts", ...)`) should be registered with `router.use(ownerAlertsRouter)` NOT `router.use("/owner-alerts", ownerAlertsRouter)` to avoid double-prefixing.
