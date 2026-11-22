import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [api, panel, mobilePanel, groups, studentChat, teacherChat, adminChat, aiRoute, aiSettings, academicRecords] = await Promise.all([
  read("../artifacts/api-server/src/routes/socialFeatures.ts"),
  read("../artifacts/dallyletter/src/components/StudyGroupPollPanel.tsx"),
  read("../artifacts/dallyletter-mobile/components/StudyGroupPollPanel.tsx"),
  read("../artifacts/dallyletter/src/pages/student/StudentStudyGroups.tsx"),
  read("../artifacts/dallyletter/src/pages/student/StudentChat.tsx"),
  read("../artifacts/dallyletter/src/pages/teacher/TeacherChat.tsx"),
  read("../artifacts/dallyletter/src/pages/admin/AdminChat.tsx"),
  read("../artifacts/api-server/src/routes/ai.ts"),
  read("../artifacts/dallyletter/src/pages/admin/AdminAISettings.tsx"),
  read("../artifacts/api-server/src/routes/academicRecords.ts"),
]);

assert.ok(api.includes('router.get("/chat/polls/:pollId/leaderboard"'), "group polls must expose a leaderboard endpoint");
assert.ok(api.includes("innerJoin(usersTable,eq(chatPollVotesTable.userId,usersTable.id))"), "leaderboard must join each vote to its user profile");
assert.ok(api.includes("innerJoin(chatPollOptionsTable,eq(chatPollVotesTable.optionId,chatPollOptionsTable.id))"), "leaderboard must return the selected answer label");
assert.ok(api.includes('name:poll.anonymous?"Anonymous learner":vote.name'), "anonymous polls must not expose voter identities");
assert.ok(api.includes("canAccessChatGroup(poll.groupId,actor.id,actor)"), "leaderboard must enforce group membership");
assert.ok(api.includes("router.delete(" + String.fromCharCode(34) + "/chat/polls/:pollId"), "poll deletion endpoint must exist");
assert.ok(api.includes("managerHasPermission(actor,\"groups.manage\")"), "poll deletion must use the existing groups.manage permission");
assert.ok(api.includes("canModerateUser(actor,groupCreator)"), "manager poll deletion must remain inside the manager’s existing moderation scope");
assert.ok(api.includes("res.status(200).json({ ok: true, deleted: true, pollId })"), "poll deletion must return an explicit JSON deletion confirmation");
assert.ok(panel.includes("Leaderboard"), "poll cards must expose a leaderboard action");
assert.ok(panel.includes("UserProfileLink userId={entry.userId} name={entry.name} avatarUrl={entry.avatarUrl}"), "leaderboard avatars must open the corresponding Profile Hub");
assert.ok(panel.includes("navigator.vibrate(result.isCorrect ? [45, 35, 70] : [110, 45, 110])"), "auto-mark feedback must provide optional haptics");
assert.ok(panel.includes("border-rose-300 bg-rose-50 text-rose-900"), "incorrect answers must be visibly red");
assert.ok(panel.includes("border-emerald-300 bg-emerald-50 text-emerald-900"), "correct answers must be visibly green");
assert.ok(panel.includes("StudyGroupPollCard key={item.poll.id}"), "all web poll views must use the same full-featured poll card");
assert.ok(mobilePanel.includes("UserProfileLink userId={entry.userId} name={entry.name} avatarUrl={entry.avatarUrl}"), "mobile leaderboard avatars must open Profile Hub");
assert.ok(mobilePanel.includes("Vibration.vibrate(data.isCorrect?[45,35,70]:[110,45,110])"), "mobile auto-mark feedback must vibrate on correct and incorrect answers");
assert.ok(mobilePanel.includes("Enable automatic marking"), "mobile poll creators must be able to enable auto-marking");
assert.ok(mobilePanel.includes("Leaderboard"), "mobile poll cards must expose a leaderboard");
assert.ok(mobilePanel.includes("item.poll.canDelete&&"), "mobile poll deletion control must follow the server-authorized canDelete flag");
assert.ok(mobilePanel.includes("/api/chat/polls/"), "mobile poll deletion must call the existing API endpoint");
assert.ok(groups.includes("!result || !result.deleted"), "study-group deletion must handle null API responses");
assert.ok(studentChat.includes("!result || !result.deleted"), "learner chat deletion must handle null API responses");
assert.ok(teacherChat.includes("!data || !data.deleted"), "teacher chat deletion must handle null API responses");
assert.ok(adminChat.includes("!data || !data.deleted"), "admin chat deletion must handle null API responses");
assert.ok(aiRoute.includes("ai_connection_test_failed"), "AI connection failures must emit structured diagnostics");
assert.ok(aiRoute.includes("providerStatus: failure.statusCode ?? null"), "AI diagnostics must include upstream status without exposing provider response bodies");
assert.ok(aiSettings.includes("provider HTTP ${data.providerStatus}"), "AI settings must display the safe upstream status to the owner");
assert.ok(academicRecords.includes("res.status(200).json({ ok: true, deleted: true, transferRequestId: id })"), "transfer-letter deletion must return an explicit JSON confirmation");
assert.ok(academicRecords.includes("res.status(200).json({ ok: true, deleted: true, reportDraftId: id })"), "RecordBook draft deletion must return an explicit JSON confirmation");
console.log("STUDY_GROUP_POLLS_STATIC: PASS (leaderboard, profile links, anonymous privacy, marking haptics/feedback, shared poll cards, null-delete guards, AI diagnostics)");
