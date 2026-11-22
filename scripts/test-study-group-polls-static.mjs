import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [api, panel, mobilePanel, groups, studyGroupsApi, studentChat, teacherChat, adminChat, aiRoute, aiSettings, academicRecords, studentPolls, profileLink] = await Promise.all([
  read("../artifacts/api-server/src/routes/socialFeatures.ts"),
  read("../artifacts/dallyletter/src/components/StudyGroupPollPanel.tsx"),
  read("../artifacts/dallyletter-mobile/components/StudyGroupPollPanel.tsx"),
  read("../artifacts/dallyletter/src/pages/student/StudentStudyGroups.tsx"),
  read("../artifacts/api-server/src/routes/studyGroups.ts"),
  read("../artifacts/dallyletter/src/pages/student/StudentChat.tsx"),
  read("../artifacts/dallyletter/src/pages/teacher/TeacherChat.tsx"),
  read("../artifacts/dallyletter/src/pages/admin/AdminChat.tsx"),
  read("../artifacts/api-server/src/routes/ai.ts"),
  read("../artifacts/dallyletter/src/pages/admin/AdminAISettings.tsx"),
  read("../artifacts/api-server/src/routes/academicRecords.ts"),
  read("../artifacts/dallyletter/src/pages/student/StudentPolls.tsx"),
  read("../artifacts/dallyletter/src/components/UserProfileLink.tsx"),
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
assert.ok(api.includes('router.delete("/chat/groups/:groupId/polls"'), "group-wide poll clearing endpoint must exist");
assert.ok(api.includes("deletedPollCount:pollIds.length"), "group-wide poll clearing must report how many polls were deleted");
assert.ok(api.includes("tx.delete(chatPollVotesTable).where(inArray(chatPollVotesTable.pollId,pollIds))"), "group-wide poll clearing must delete poll votes transactionally");
assert.ok(api.includes("Only the group creator, platform owner, or an in-scope manager"), "group-wide poll clearing must enforce existing owner and manager scope");
assert.ok(groups.includes("/api/chat/groups/\u0024{group.id}/polls"), "Clear chat must also clear all group polls");
assert.ok(groups.includes("Clear chat & polls"), "the group cleanup action must clearly disclose that it clears polls too");
assert.ok(panel.includes("border-2 border-red-400 bg-red-50"), "individual poll delete icon must be visually prominent");
assert.ok(panel.includes('aria-label="Delete poll"') && panel.includes("title={`Delete poll: ${item.poll.question}`}"), "individual poll delete icon must have a stable accessible label and poll-specific tooltip");
assert.ok(panel.includes("Leaderboard"), "poll cards must expose a leaderboard action");
assert.ok(panel.includes("UserProfileLink userId={entry.userId} name={entry.name} avatarUrl={entry.avatarUrl}"), "leaderboard avatars must open the corresponding Profile Hub");
assert.ok(panel.includes("navigator.vibrate(result.isCorrect ? [45, 35, 70] : [110, 45, 110])"), "auto-mark feedback must provide optional haptics");
assert.ok(panel.indexOf("setSelectedAnswerId(optionId);") < panel.indexOf('apiJson<PollMarkResult>("/api/chat/polls/" + item.poll.id + "/vote"'), "web answer selection must update optimistically before waiting for the network");
assert.ok(panel.includes("Answer received — checking your result…"), "web auto-marking must show immediate pending feedback while the server verifies correctness");
assert.ok(mobilePanel.indexOf("setSelectedAnswers(current=>({...current,[poll.poll.id]:optionId}));") < mobilePanel.indexOf('fetch(getApiUrl("/api/chat/polls/"+poll.poll.id+"/vote")'), "mobile answer selection must update optimistically before waiting for the network");
assert.ok(mobilePanel.includes("Answer received — checking your result…"), "mobile auto-marking must show immediate pending feedback while the server verifies correctness");
assert.ok(mobilePanel.includes("finally{setVotingIds"), "mobile vote lock must always be released after server response");
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
assert.ok(groups.includes("const canManage = isOwner || group.canManage === true"), "group creators must see member moderation actions even when API identity IDs differ in type");
assert.ok(groups.includes("(isOwner || group.canManage === true) && <Button type=\"button\" variant=\"ghost\" size=\"icon\" aria-label={`Delete study group"), "group creators must see the compact delete-group action");
assert.ok(groups.includes("(isOwner || group.canManage === true) && <Button variant=\"ghost\" size=\"sm\""), "group creators must see the clear-chat action");
assert.ok(studyGroupsApi.includes("Number(group.creatorId) === Number(user.id)"), "study-group owner authorization must compare normalized IDs");
assert.ok(studentChat.includes("!result || !result.deleted"), "learner chat deletion must handle null API responses");
assert.ok(teacherChat.includes("!data || !data.deleted"), "teacher chat deletion must handle null API responses");
assert.ok(adminChat.includes("!data || !data.deleted"), "admin chat deletion must handle null API responses");
assert.ok(aiRoute.includes("ai_connection_test_failed"), "AI connection failures must emit structured diagnostics");
assert.ok(aiRoute.includes("providerStatus: failure.statusCode ?? null"), "AI diagnostics must include upstream status without exposing provider response bodies");
assert.ok(aiSettings.includes("provider HTTP ${data.providerStatus}"), "AI settings must display the safe upstream status to the owner");
assert.ok(academicRecords.includes("res.status(200).json({ ok: true, deleted: true, transferRequestId: id })"), "transfer-letter deletion must return an explicit JSON confirmation");
assert.ok(academicRecords.includes("res.status(200).json({ ok: true, deleted: true, reportDraftId: id })"), "RecordBook draft deletion must return an explicit JSON confirmation");
assert.ok(studentPolls.includes('aria-label="Results privacy settings"') && studentPolls.includes("aria-expanded={privacyPanelOpen}"), "quiz results privacy must be hidden behind an expandable icon control");
assert.ok(studentPolls.includes('aria-label="Instant marking settings"') && studentPolls.includes("aria-expanded={instantMarkingPanelOpen}"), "practice instant-marking settings must be hidden behind an expandable icon control");
assert.ok(studentPolls.includes("{privacyPanelOpen &&") && studentPolls.includes("{instantMarkingPanelOpen &&"), "privacy and instant-marking settings must expand only when requested");
assert.ok(studentPolls.includes("setResultPrivacy") && studentPolls.includes("setInstantMarking"), "collapsing the settings must preserve the existing setting controls");
assert.ok(profileLink.includes("getApiUrl(avatarUrl)") && profileLink.includes("Authorization"), "leaderboard profile avatars must load protected profile images using the existing authenticated media route");
assert.ok(profileLink.includes("new URL(avatarUrl)") && profileLink.includes("parsed.pathname + parsed.search") && profileLink.includes("getApiUrl(requestPath)"), "absolute protected LMS4 avatar URLs must be rebased and fetched with authentication instead of loaded anonymously");
assert.ok(api.includes("Number(vote.userId) === Number(actor.id)") && api.includes("Number(poll.creatorId) === Number(actor.id)"), "poll vote state and delete visibility must use normalized numeric user identifiers");
assert.ok(api.includes("const marked = poll.autoMark") && api.includes("isCorrect: optionIds[0] === poll.correctOptionId"), "auto-marked study-group votes must return the server-verified correctness result immediately");
assert.ok(profileLink.includes('href={"/profile/" + Number(userId)}') && profileLink.includes("<img src={image}"), "leaderboard avatars must display actual profile images and remain clickable profile links");
console.log("STUDY_GROUP_POLLS_STATIC: PASS (polls, bulk poll clearing, individual deletion, owner actions, normalized authorization, profile links, privacy, haptics, AI diagnostics)");
