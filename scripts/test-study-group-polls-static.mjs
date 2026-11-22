import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [api, panel, groups, studentChat, teacherChat, adminChat, aiRoute] = await Promise.all([
  read("../artifacts/api-server/src/routes/socialFeatures.ts"),
  read("../artifacts/dallyletter/src/components/StudyGroupPollPanel.tsx"),
  read("../artifacts/dallyletter/src/pages/student/StudentStudyGroups.tsx"),
  read("../artifacts/dallyletter/src/pages/student/StudentChat.tsx"),
  read("../artifacts/dallyletter/src/pages/teacher/TeacherChat.tsx"),
  read("../artifacts/dallyletter/src/pages/admin/AdminChat.tsx"),
  read("../artifacts/api-server/src/routes/ai.ts"),
]);

assert.ok(api.includes('router.get("/chat/polls/:pollId/leaderboard"'), "group polls must expose a leaderboard endpoint");
assert.ok(api.includes("innerJoin(usersTable,eq(chatPollVotesTable.userId,usersTable.id))"), "leaderboard must join each vote to its user profile");
assert.ok(api.includes("innerJoin(chatPollOptionsTable,eq(chatPollVotesTable.optionId,chatPollOptionsTable.id))"), "leaderboard must return the selected answer label");
assert.ok(api.includes('name:poll.anonymous?"Anonymous learner":vote.name'), "anonymous polls must not expose voter identities");
assert.ok(api.includes("canAccessChatGroup(poll.groupId,actor.id,actor)"), "leaderboard must enforce group membership");
assert.ok(panel.includes("Leaderboard"), "poll cards must expose a leaderboard action");
assert.ok(panel.includes("UserProfileLink userId={entry.userId} name={entry.name} avatarUrl={entry.avatarUrl}"), "leaderboard avatars must open the corresponding Profile Hub");
assert.ok(panel.includes("navigator.vibrate(result.isCorrect ? [45, 35, 70] : [110, 45, 110])"), "auto-mark feedback must provide optional haptics");
assert.ok(panel.includes("border-rose-300 bg-rose-50 text-rose-900"), "incorrect answers must be visibly red");
assert.ok(panel.includes("border-emerald-300 bg-emerald-50 text-emerald-900"), "correct answers must be visibly green");
assert.ok(panel.includes("StudyGroupPollCard key={item.poll.id}"), "all poll views must use the same full-featured poll card");
assert.ok(groups.includes("!result || !result.deleted"), "study-group deletion must handle null API responses");
assert.ok(studentChat.includes("!result || !result.deleted"), "learner chat deletion must handle null API responses");
assert.ok(teacherChat.includes("!data || !data.deleted"), "teacher chat deletion must handle null API responses");
assert.ok(adminChat.includes("!data || !data.deleted"), "admin chat deletion must handle null API responses");
assert.ok(aiRoute.includes("ai_connection_test_failed"), "AI connection failures must emit structured diagnostics");
assert.ok(aiRoute.includes("providerStatus: failure.statusCode ?? null"), "AI diagnostics must include upstream status without exposing provider response bodies");
console.log("STUDY_GROUP_POLLS_STATIC: PASS (leaderboard, profile links, anonymous privacy, marking haptics/feedback, shared poll cards, null-delete guards, AI diagnostics)");
