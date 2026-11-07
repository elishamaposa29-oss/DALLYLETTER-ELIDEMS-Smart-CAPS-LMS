import test from "node:test";
import assert from "node:assert/strict";
import { defaultManagerPermission, isSeniorOnlyManagerPermission, canAccessManager, canApproveAchievementAwards, canManageAcademicContent, canModerateUser, canPendingTeacherUseRoute, canRecommendAchievementAwards, canReviewAcademicTransfer, canUseStaffAI, enforceAcademicStaffAccess, enforceAuthenticated, enforceOwnerAccess, isActiveTeacherManager, isJuniorManager, isOwnerRole, isSeniorManager, normalizeRole } from "./role-access.js";

test("normalizes legacy role casing and separators",()=>{
 assert.equal(normalizeRole(" Senior Manager "), "senior_manager");
 assert.equal(normalizeRole("PLATFORM-OWNER"), "platform_owner");
 assert.equal(normalizeRole(null), "");
});

test("only owner-class roles receive owner privileges",()=>{
 for(const role of ["owner","OWNER","platform_owner","Platform Owner"]) assert.equal(isOwnerRole(role),true,role);
 assert.equal(isOwnerRole("admin"),false,"admin must not inherit Owner authority");
 for(const role of ["student","teacher","manager","senior_manager","prefect","unknown"]) assert.equal(isOwnerRole(role),false,role);
});

test("manager flag grants scoped manager and academic access, not owner access",()=>{
 const manager={role:"teacher",isManager:true};
 assert.equal(canAccessManager(manager),true);
 assert.equal(canManageAcademicContent(manager),true);
 assert.equal(isOwnerRole(manager.role),false);
});

test("restricted teacher applications cannot retain manager authority through a legacy manager flag",()=>{
 for(const teacherApplicationStatus of ["draft","pending_review","rejected_pending_conversion"]){
  const user={role:"teacher",isManager:true,teacherApplicationStatus};
  assert.equal(isActiveTeacherManager(user),false,teacherApplicationStatus);
  assert.equal(canAccessManager(user),false,teacherApplicationStatus);
 }
 const approved={role:"teacher",isManager:true,teacherApplicationStatus:"approved"};
 assert.equal(isActiveTeacherManager(approved),true);
 assert.equal(canAccessManager(approved),true);
});

test("learner and unknown roles cannot use staff or academic controls",()=>{
 for(const user of [{role:"student"},{role:"prefect"},{role:""},{role:"unknown"}]){
  assert.equal(canUseStaffAI(user),false,String(user.role));
  assert.equal(canManageAcademicContent(user),false,String(user.role));
 }
});

test("authorized teachers can use staff AI but cannot access owner tools",()=>{
 const teacher={role:"teacher",isManager:false};
 assert.equal(canUseStaffAI(teacher),true);
 assert.equal(canManageAcademicContent(teacher),true);
 assert.equal(isOwnerRole(teacher.role),false);
});

test("only owner aliases have owner-class access; admin remains separate",()=>{
 for(const role of ["owner","platform_owner"]){
  assert.equal(canUseStaffAI({role}),true);
  assert.equal(canManageAcademicContent({role}),true);
  assert.equal(canAccessManager({role}),true);
 }
});

function mockResponse(){
 let statusCode=200; let payload:unknown=null;
 const res={status(code:number){statusCode=code;return res;},json(value:unknown){payload=value;return res;}};
 return {res,status:()=>statusCode,payload:()=>payload};
}
test("authentication guard returns 401 without a session and never calls next",()=>{
 const response=mockResponse();let nextCalls=0;
 enforceAuthenticated({},response.res,()=>{nextCalls+=1;});
 assert.equal(response.status(),401);assert.equal(nextCalls,0);
});
test("owner guard denies students and managers but permits owner-class roles",()=>{
 for(const user of [{role:"student"},{role:"teacher",isManager:true},{role:"senior_manager"},{role:"admin"}]){
  const response=mockResponse();let nextCalls=0;
  enforceOwnerAccess({currentUser:user},response.res,()=>{nextCalls+=1;});
  assert.equal(response.status(),403,String(user.role));assert.equal(nextCalls,0);
 }
 for(const user of [{role:"owner"},{role:"platform_owner"}]){
  const response=mockResponse();let nextCalls=0;
  enforceOwnerAccess({currentUser:user},response.res,()=>{nextCalls+=1;});
  assert.equal(response.status(),200,String(user.role));assert.equal(nextCalls,1);
 }
});
test("academic staff guard denies learners and allows teacher and explicit manager",()=>{
 for(const user of [{role:"student"},{role:"prefect"},{role:"unknown"}]){
  const response=mockResponse();let nextCalls=0;
  enforceAcademicStaffAccess({currentUser:user},response.res,()=>{nextCalls+=1;});
  assert.equal(response.status(),403,String(user.role));assert.equal(nextCalls,0);
 }
 for(const user of [{role:"teacher"},{role:"teacher",isManager:true},{role:"owner"}]){
  const response=mockResponse();let nextCalls=0;
  enforceAcademicStaffAccess({currentUser:user},response.res,()=>{nextCalls+=1;});
  assert.equal(response.status(),200,String(user.role));assert.equal(nextCalls,1);
 }
});

test("learner, prefect, and unknown roles cannot gain staff privileges from a stale manager flag",()=>{
 for(const role of ["student","prefect","unknown",""]){
  const user={role,isManager:true};
  assert.equal(canAccessManager(user),false,role);
  assert.equal(canManageAcademicContent(user),false,role);
  assert.equal(canUseStaffAI(user),false,role);
 }
});

test("manager and senior-manager roles retain portal access without a legacy manager flag",()=>{
 for(const role of ["manager","senior_manager"]){
  const user={role,isManager:false};
  assert.equal(canAccessManager(user),true,role);
  assert.equal(canManageAcademicContent(user),true,role);
  assert.equal(canUseStaffAI(user),true,role);
 }
 const managerTeacher={role:"teacher",isManager:true};
 assert.equal(canAccessManager(managerTeacher),true);
 assert.equal(canManageAcademicContent(managerTeacher),true);
 assert.equal(canUseStaffAI(managerTeacher),true);
 const ordinaryTeacher={role:"teacher",isManager:false};
 assert.equal(canAccessManager(ordinaryTeacher),false);
 assert.equal(canManageAcademicContent(ordinaryTeacher),true);
 assert.equal(canUseStaffAI(ordinaryTeacher),true);
});

test("pending teacher applicants cannot access academic staff tools or staff AI",()=>{
 const pending={role:"teacher",isManager:true,teacherApplicationStatus:"pending_review"};
 assert.equal(canManageAcademicContent(pending),false);
 assert.equal(canUseStaffAI(pending),false);
 assert.equal(canAccessManager(pending),false);
 const response=mockResponse();let nextCalls=0;
 enforceAcademicStaffAccess({currentUser:pending},response.res,()=>{nextCalls+=1;});
 assert.equal(response.status(),403);assert.equal(nextCalls,0);
});
test("approved teachers and owners retain academic staff access",()=>{
 assert.equal(canManageAcademicContent({role:"teacher",teacherApplicationStatus:"approved"}),true);
 assert.equal(canUseStaffAI({role:"teacher",teacherApplicationStatus:"approved"}),true);
 assert.equal(canManageAcademicContent({role:"owner",teacherApplicationStatus:"pending_review"}),true);
});

test("Junior managers may override only ordinary subordinate accounts",()=>{
 const junior={role:"junior_manager"};
 for(const role of ["teacher","student","learner","prefect"]) assert.equal(canModerateUser(junior,{role}),true,role);
 for(const target of [{role:"junior_manager"},{role:"senior_manager"},{role:"manager",managerLevel:"junior"},{role:"admin"},{role:"owner"}]) assert.equal(canModerateUser(junior,target),false,String(target.role));
});
test("Senior managers may override Junior Managers and ordinary users but never Admin or Owner",()=>{
 const senior={role:"senior_manager"};
 for(const target of [{role:"junior_manager"},{role:"manager",managerLevel:"junior"},{role:"teacher"},{role:"student"},{role:"prefect"}]) assert.equal(canModerateUser(senior,target),true,String(target.role));
 for(const target of [{role:"senior_manager"},{role:"admin"},{role:"owner"}]) assert.equal(canModerateUser(senior,target),false,String(target.role));
});

test("transfer review access is limited to Owner and Senior Manager authority; Admin is excluded",()=>{
 for(const role of ["owner","platform_owner","senior_manager"]) assert.equal(canReviewAcademicTransfer({role}),true,role);
 assert.equal(canReviewAcademicTransfer({role:"manager",managerLevel:"senior"}),true,"legacy senior-level managers retain review authority");
 assert.equal(canReviewAcademicTransfer({role:"teacher",isManager:true,managerLevel:"senior"}),true,"legacy senior teacher-managers retain review authority");
 for(const role of ["admin","manager","junior_manager","student","prefect","teacher","unknown"]) assert.equal(canReviewAcademicTransfer({role,isManager:false}),false,role);
 assert.equal(canReviewAcademicTransfer({role:"teacher",isManager:true,managerLevel:"junior"}),false,"junior teacher-managers cannot approve transfers");
 assert.equal(canReviewAcademicTransfer({role:"teacher",isManager:true,managerLevel:"senior",teacherApplicationStatus:"pending_review"}),false,"pending teacher applications cannot review transfers");
});

test("explicit hierarchy keeps junior and senior manager permissions while separating approvals",()=>{
 const juniorRole={role:"manager",managerLevel:"junior"};
 const juniorLegacy={role:"teacher",isManager:true,managerLevel:"junior"};
 const seniorRole={role:"senior_manager"};
 const seniorLegacy={role:"teacher",isManager:true,managerLevel:"senior"};
 const owner={role:"owner"};
 for(const user of [juniorRole,juniorLegacy]){
  assert.equal(isJuniorManager(user),true);
  assert.equal(isSeniorManager(user),false);
  assert.equal(canRecommendAchievementAwards(user),true);
  assert.equal(canApproveAchievementAwards(user),false);
  assert.equal(canAccessManager(user),true);
 }
 for(const user of [seniorRole,seniorLegacy,owner]){
  assert.equal(isJuniorManager(user),false);
  assert.equal(isSeniorManager(user),true);
  assert.equal(canRecommendAchievementAwards(user),true);
  assert.equal(canApproveAchievementAwards(user),true);
  assert.equal(canAccessManager(user),true);
 }
});
test("junior_manager role alias retains manager workspace access but not senior approvals",()=>{
 const junior={role:"junior_manager"};
 assert.equal(isJuniorManager(junior),true);
 assert.equal(isSeniorManager(junior),false);
 assert.equal(canAccessManager(junior),true);
 assert.equal(canManageAcademicContent(junior),true);
 assert.equal(canRecommendAchievementAwards(junior),true);
 assert.equal(canApproveAchievementAwards(junior),false);
 assert.equal(canReviewAcademicTransfer(junior),false);
});

test("draft, pending and rejected teacher managers do not gain authority from stale manager flags",()=>{
 for(const status of ["draft","pending_review","rejected_pending_conversion"]){
  const pending={role:"teacher",isManager:true,managerLevel:"senior",teacherApplicationStatus:status};
  assert.equal(isJuniorManager(pending),false,status);
  assert.equal(isSeniorManager(pending),false,status);
  assert.equal(canRecommendAchievementAwards(pending),false,status);
  assert.equal(canApproveAchievementAwards(pending),false,status);
  assert.equal(canAccessManager(pending),false,status);
 }
});
test("ordinary teachers and learners retain existing access without manager authority",()=>{
 for(const user of [{role:"teacher",isManager:false},{role:"student"},{role:"prefect"}]){
  assert.equal(isJuniorManager(user),false);
  assert.equal(isSeniorManager(user),false);
  assert.equal(canRecommendAchievementAwards(user),false);
  assert.equal(canApproveAchievementAwards(user),false);
 }
});

test("pending teacher API policy allows self-service and privacy-checked Profile Hub routes while blocking teaching tools",()=>{
 const applicant={id:41,role:"teacher",teacherApplicationStatus:"pending_review"};
 for(const [method,path] of [
  ["GET","/api/auth/me"],
  ["GET","/api/users/me/recovery-profile"],
  ["GET","/api/users/me/notification-email"],
  ["GET","/api/users/me/enrollments"],
  ["GET","/api/users/me/enrollments-summary"],
  ["GET","/api/users/me/subjects"],
  ["PUT","/api/users/me/subjects"],
  // Pending applicants cannot access payout preferences until authorization.
  // Pending applicants may read only their own academic/profile records.
  ["GET","/api/academic-records/current-year"],
  ["GET","/api/academic-records/me"],
  ["GET","/api/academic-records/reports/me"],
   ["GET","/api/academic-records/reports/drafts/123/download/pdf"],
   ["GET","/api/academic-records/reports/drafts/123/download"],
   ["GET","/api/academic-records/transfer-requests/123/download"],
   ["GET","/api/academic-records/transfer-verification/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
  ["GET","/api/achievements/my"],
  ["GET","/api/daily-attendance/me"],
  ["GET","/api/subjects/catalog"],
  ["PUT","/api/profile/me/privacy"],
  ["GET","/api/profile/41/social"],
  ["GET","/api/profile/41/section/attendance"],
  ["GET","/api/profile/connections/friends"],
  ["GET","/api/profile/connections/requests"],
  ["POST","/api/profile/99/connect"],
  ["PATCH","/api/profile/connections/123"],
  ["POST","/api/users/me/phone/request-verification"],
  ["POST","/api/users/me/recovery-question/verify"],
  ["POST","/api/daily-attendance/open"],
  ["POST","/api/academic-records/transfer-requests"],
  ["GET","/api/auth/me/"],
  ["GET","/api/auth/me?source=profile"],
  ["GET","/api//auth//me/"],
  ["PATCH","/api/notifications/123/read/"],
  ["POST","/api/auth/login"],
  ["POST","/api/auth/google"],
  ["POST","/api/auth/logout"],
  ["GET","/api/notifications"],
  ["PATCH","/api/notifications/123/read"],
  ["GET","/api/users/me/teacher-cv"],
  ["PATCH","/api/users/me/teacher-cv"],
  ["POST","/api/users/me/qualifications"],
  ["PATCH","/api/users/me/qualifications/99"],
  ["POST","/api/users/me/qualifications/bulk"],
  ["GET","/api/users/41/teacher-documents/99"],
  ["POST","/api/users/me/notification-email/request"],
  ["POST","/api/users/me/phone/confirm"],
  ["PATCH","/api/users/me/recovery-profile"],
  ["POST","/api/users/me/teacher-documents"],
  ["POST","/api/qualifications/8/document"],
  ["GET","/api/users/41/teacher-documents"],
  ["GET","/api/users/41/public-profile"],
  ["GET","/api/users/41"],
  ["PATCH","/api/users/41"],
  ["GET","/api/teacher-cv-workspace/41/chat"],
  ["POST","/api/teacher-cv-workspace/41/chat"],
  ["GET","/api/teacher-cv-workspace/41/history"],
 ]) assert.equal(canPendingTeacherUseRoute(applicant,method,path),true,method+" "+path);
 for(const [method,path] of [
  ["POST","/api/notifications"],
  ["DELETE","/api/notifications/123"],
  ["GET","/api/dashboard"],
  ["GET","/api/teacher-dashboard"],
  ["GET","/api/users/me/payout-preferences"],
  ["PUT","/api/users/me/payout-preferences"],
  ["GET","/api/lessons"],
  ["GET","/api/assignments"],
  ["GET","/api/exercises"],
  ["GET","/api/polls"],
  ["GET","/api/live-classes"],
  ["GET","/api/teacher-cv-workspace/42/chat"],
  ["GET","/api/academic-records/report-learners"],
   ["POST","/api/academic-records/transfer-requests/123/review"],
   ["POST","/api/academic-records/reports/drafts/123/review"],
  ["GET","/api/users/42"],
  ["PATCH","/api/users/42"],
  ["POST","/api/lessons"],
  ["POST","/api/assignments"],
  ["POST","/api/exercises"],
  ["POST","/api/polls"],
  ["POST","/api/live-classes"],
  ["DELETE","/api/users/41"],
 ]) assert.equal(canPendingTeacherUseRoute(applicant,method,path),false,method+" "+path);
 const draftApplicant={...applicant,teacherApplicationStatus:"draft"};
 assert.equal(canPendingTeacherUseRoute(draftApplicant,"GET","/api/users/me/teacher-cv"),true,"Draft teacher can access their own CV workspace");
 assert.equal(canPendingTeacherUseRoute(draftApplicant,"GET","/api/academic-records/transfer-requests"),true,"Draft teacher can access only their own transfer-request list; the route filters records by authenticated user ownership");
 assert.equal(canPendingTeacherUseRoute(draftApplicant,"POST","/api/lessons"),false,"Draft teacher cannot perform teaching operations");
 assert.equal(canPendingTeacherUseRoute({...applicant,teacherApplicationStatus:"approved"},"POST","/api/lessons"),true);
 assert.equal(canPendingTeacherUseRoute({...applicant,teacherApplicationStatus:" PENDING_REVIEW "},"GET","/api/auth/me"),true);
});

test("pending teacher API policy never blocks authentication and permits all self Profile Hub data",()=>{
 const applicant={id:41,role:"teacher",teacherApplicationStatus:"pending_review"};
 for(const [method,path] of [
  ["GET","/api/auth/me"],
  ["POST","/api/auth/login"],
  ["POST","/api/auth/register"],
  ["POST","/api/auth/google"],
  ["GET","/api/users/me/enrollments-summary"],
  ["GET","/api/users/me/enrollments"],
  ["GET","/api/users/me/notification-email"],
  ["GET","/api/users/me/subjects"],
  ["GET","/api/users/me/payout-preferences"],
  ["GET","/api/users/me/recovery-profile"],
  ["GET","/api/academic-records/reports/me"],
  ["GET","/api/academic-records/current-year"],
  ["GET","/api/achievements/my"],
  ["GET","/api/subjects/catalog"],
   ["GET","/api/config/currentYear"],
  ["GET","/api/profile/41/social"],
  ["GET","/api/profile/41/section/attendance"],
  ["GET","/api/profile/41/section/qualifications"],
  ["POST","/api/profile/99/connect"],
  ["GET","/api/profile/connections/friends"],
  ["GET","/api/profile/connections/requests"],
  ["PATCH","/api/profile/connections/123"],
  ["GET","/api/notifications"],
  ["PATCH","/api/notifications/123/read"],
   ["GET","/api/profile/99/social"],
   ["GET","/api/profile/99/section/reports"],
   ["GET","/api/users/99/public-profile"],
   ["GET","/api/users/99/teacher-documents"],
   ["GET","/api/users/99/teacher-documents/8"],
   ["GET","/api/achievements/user/99"],
   ["GET","/api/achievements"],
   ["GET","/api/messages"],
   ["POST","/api/messages"],
   ["DELETE","/api/messages/123"],
   ["POST","/api/messages/media"],
   ["GET","/api/messages/media/123e4567-e89b-12d3-a456-426614174000"],
   ["POST","/api/messages/123/report"],
  ["POST","/api/teacher-cv-workspace/survey/submit"],
  ["GET","/api/profile/connections/friends"],
  ["GET","/api/profile/connections/requests"],
  ["PUT","/api/profile/me/privacy"],
  ["PATCH","/api/profile/connections/123"],
  ["GET","/api/notifications"],
  ["PATCH","/api/notifications/123/read"],
 ]) assert.equal(canPendingTeacherUseRoute(applicant,method,path),true,method+" "+path);
 const rejected={...applicant,teacherApplicationStatus:"rejected_pending_conversion"};
 for(const [method,path] of [["GET","/api/auth/me"],["POST","/api/auth/login"],["GET","/api/users/me/notification-email"],["POST","/api/teacher-cv-workspace/submit"],["POST","/api/teacher-cv-workspace/survey/submit"]])
  assert.equal(canPendingTeacherUseRoute(rejected,method,path),true,method+" "+path);
 assert.equal(canPendingTeacherUseRoute(rejected,"POST","/api/lessons"),false);
 assert.equal(canPendingTeacherUseRoute(rejected,"POST","/api/notifications"),false,"Applicants may read and mark their own notifications but cannot broadcast/create notifications");
 assert.equal(canPendingTeacherUseRoute(rejected,"DELETE","/api/notifications/123"),false);
});

test("manager moderation follows hierarchy and protects Owner, Admin, and senior peers",()=>{
 const junior={role:"junior_manager"};
 const senior={role:"senior_manager"};
 const owner={role:"owner"};
 for(const target of [{role:"teacher"},{role:"student"},{role:"prefect"},{role:"manager",managerLevel:"junior"}])
  assert.equal(canModerateUser(senior,target),true,JSON.stringify(target));
 for(const target of [{role:"owner"},{role:"platform_owner"},{role:"admin"},{role:"senior_manager"},{role:"manager",managerLevel:"senior"},{role:"teacher",isManager:true,managerLevel:"senior"}])
  assert.equal(canModerateUser(senior,target),false,JSON.stringify(target));
 assert.equal(canModerateUser(junior,{role:"teacher"}),true,"Junior may override an ordinary teacher when separately granted the matching permission");
 assert.equal(canModerateUser(junior,{role:"student"}),true,"Junior may override an ordinary learner when separately granted the matching permission");
 assert.equal(canModerateUser(junior,{role:"prefect"}),true,"Junior may override a prefect when separately granted the matching permission");
 assert.equal(canModerateUser(junior,{role:"manager",managerLevel:"junior"}),false,"Junior cannot override another manager");
 assert.equal(canModerateUser(junior,{role:"senior_manager"}),false);
 assert.equal(canModerateUser(junior,{role:"admin"}),false);
 assert.equal(canModerateUser(junior,{role:"owner"}),false);
 assert.equal(canModerateUser(owner,{role:"admin"}),true);
 assert.equal(canModerateUser(owner,{role:"owner"}),false);
});

test("every manager permission requires an explicit per-user Owner grant regardless of seniority",()=>{
 for(const role of ["manager","junior_manager","senior_manager"]){
  for(const key of ["manager.dashboard.view","users.view","owner.chat","transfers.approve","reports.review","teacher_cv.authorize","attendance.view","recordbook.view","manager.monitoring.view"]){
   assert.equal(defaultManagerPermission(role,role==="senior_manager"?"senior":"junior",false,key),false,role+" must not inherit "+key);
  }
 }
 assert.equal(isSeniorOnlyManagerPermission("manager.monitoring.view"),true);
 assert.equal(isSeniorOnlyManagerPermission("teacher_cv.chat"),false);
 for(const role of ["admin","teacher","student","owner"]) assert.equal(defaultManagerPermission(role,undefined,false,"users.view"),false);
 assert.equal(defaultManagerPermission("senior_manager","senior",false,"owner.activity.view"),false);
 assert.equal(defaultManagerPermission("senior_manager","senior",false,"unregistered.permission"),false);
});
