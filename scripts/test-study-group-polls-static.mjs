import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [api, panel, mobilePanel, groups, studyGroupsApi, studentChat, teacherChat, adminChat, aiRoute, aiSettings, academicRecords, studentPolls, profileLink, messagesApi, retentionEngine, retentionUi, ownerCommandCenter, appRoutes, dashboardLayout] = await Promise.all([
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
  read("../artifacts/api-server/src/routes/messages.ts"),
  read("../artifacts/api-server/src/lib/retention-cleanup.ts"),
  read("../artifacts/dallyletter/src/components/OwnerRetentionControls.tsx"),
  read("../artifacts/api-server/src/routes/ownerCommandCenter.ts"),
  read("../artifacts/dallyletter/src/App.tsx"),
  read("../artifacts/dallyletter/src/components/DashboardLayout.tsx"),
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
assert.ok(panel.includes("h-6 w-6 min-h-6 min-w-6") && panel.includes("h-3 w-3"), "individual poll delete icon must be compact without losing its accessible action");
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
assert.ok(profileLink.includes("getApiUrl(requestPath)") && profileLink.includes("Authorization"), "leaderboard profile avatars must load protected profile images using the existing authenticated media route");
assert.ok(profileLink.includes("new URL(avatarUrl)") && profileLink.includes("parsed.pathname + parsed.search") && profileLink.includes("getApiUrl(requestPath)"), "absolute protected LMS4 avatar URLs must be rebased and fetched with authentication instead of loaded anonymously");
assert.ok(api.includes("Number(vote.userId) === Number(actor.id)") && api.includes("Number(poll.creatorId) === Number(actor.id)"), "poll vote state and delete visibility must use normalized numeric user identifiers");
assert.ok(api.includes("const marked = poll.autoMark") && api.includes("isCorrect: optionIds[0] === poll.correctOptionId"), "auto-marked study-group votes must return the server-verified correctness result immediately");
assert.ok(api.includes("SELECT auto_mark,closed FROM chat_polls WHERE id=$1 FOR UPDATE"), "auto-marked submissions must serialize per poll to prevent concurrent repeat attempts");
assert.ok(api.includes("This auto-marked poll accepts only one answer from each learner."), "auto-marked polls must reject repeat submissions server-side");
assert.ok(api.includes("if(!current.auto_mark) await client.query"), "ordinary polls must preserve their existing editable vote behavior");
assert.ok(panel.includes("oneShotAutoMarkLocked") && panel.includes("Created by you"), "web poll cards must lock answered auto-marked polls and distinguish the current user's polls");

assert.ok(profileLink.includes('href={"/profile/" + Number(userId)}') && profileLink.includes("<img src={image}"), "leaderboard avatars must display actual profile images and remain clickable profile links");

assert.ok(messagesApi.includes("async function canOverrideGroupSettings") && messagesApi.includes("control?.mediaBlocked"), "group settings overrides must not bypass explicit media blocks");
assert.ok(messagesApi.includes("canAccessGroup(groupId, currentUser)") && messagesApi.includes('managerHasPermission(user, "groups.manage")') && messagesApi.includes("canModerateUser(user, creator)"), "Owner and managers must access group chat only within existing role and permission scope");
assert.ok(messagesApi.includes("const accessibleGroupIds: number[] = []") && messagesApi.includes("recentGroups"), "Owner and manager unread dashboards must include scoped group conversations");
assert.ok(retentionEngine.includes("RETENTION_CATEGORIES") && retentionEngine.includes("pg_try_advisory_lock"), "retention cleanup must use a fixed category allowlist and a cross-instance scheduler lock");
assert.ok(retentionEngine.includes("NOT EXISTS (SELECT 1 FROM exercise_submissions") && retentionEngine.includes("auto_mark=FALSE"), "retention cleanup must protect learner submissions and auto-marked poll evidence");
assert.ok(retentionEngine.includes("retention.cleanup.completed") && retentionEngine.includes("owner_retention_runs"), "retention runs must be durably audited, including failures");
assert.ok(retentionEngine.includes("startRetentionCleanupScheduler") && retentionEngine.includes("setInterval"), "retention cleanup must execute automatically on the configured server schedule");
assert.ok(retentionUi.includes("DELETE EXPIRED CONTENT") && retentionUi.includes("Preview eligible content") && retentionUi.includes("Enable scheduled cleanup"), "Owner retention controls must require a preview and explicit confirmation for manual cleanup");

assert.ok(ownerCommandCenter.includes("owner_retention_previews") && ownerCommandCenter.includes("previewId") && ownerCommandCenter.includes("used_at IS NULL"), "scheduled cleanup activation must require a recent, matching Owner preview");
assert.ok(retentionUi.includes("preview.retentionDays!==policy.retentionDays") && retentionUi.includes("previewId:preview?.previewId"), "Owner UI must invalidate stale previews and submit the matching preview token");
assert.ok(appRoutes.includes('path="/admin/chat"><ProtectedRoute allowedRoles={["owner","admin"]}') && appRoutes.includes('"owner","admin","manager","senior_manager","junior_manager"'), "Admin, Owner and Manager must have routes to the shared study-group and chat workspaces");
assert.ok(dashboardLayout.includes('{ label: "Study Groups", href: "/student/study-groups", icon: Users }') && dashboardLayout.includes('{ label: "Group Chat", href: "/admin/chat", icon: MessageSquare }'), "operational Admin dashboard must expose study groups and chat without exposing Owner-only controls");
assert.ok(adminChat.includes("VoiceRecorder onSend={handleSendVoice}") && adminChat.includes("handleSendMedia"), "Owner/Admin chat must support voice announcements and learning-media attachments");
assert.ok(academicRecords.includes("r.requested_by,u.role"), "transfer-letter deletion must load the real requester ID before checking creator authority");

assert.ok(ownerCommandCenter.includes("/owner/command-center/retention/preview") && ownerCommandCenter.includes("/owner/command-center/retention/run"), "Owner Command Centre must expose protected preview and execution endpoints");
assert.ok(academicRecords.includes('managerHasPermission(actor,"reports.view")') && academicRecords.includes('managerHasPermission(actor,"transfers.view")'), "report and transfer deletion must enforce existing manager permissions");
assert.ok(academicRecords.includes('"academic_report.deleted"') && academicRecords.includes('"transfer_letter.deleted"'), "report and transfer deletion must write audit events");

console.log("STUDY_GROUP_POLLS_STATIC: PASS (polls, one-shot auto-marking, bulk poll clearing, compact individual deletion, owner actions, normalized authorization, profile links, privacy, haptics, AI diagnostics)");
