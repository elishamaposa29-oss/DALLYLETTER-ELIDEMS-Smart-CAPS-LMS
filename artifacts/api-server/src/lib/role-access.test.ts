import test from "node:test";
import assert from "node:assert/strict";
import { canAccessManager, canManageAcademicContent, canReviewAcademicTransfer, canUseStaffAI, enforceAcademicStaffAccess, enforceAuthenticated, enforceOwnerAccess, isOwnerRole, normalizeRole } from "./role-access.js";

test("normalizes legacy role casing and separators",()=>{
 assert.equal(normalizeRole(" Senior Manager "), "senior_manager");
 assert.equal(normalizeRole("PLATFORM-OWNER"), "platform_owner");
 assert.equal(normalizeRole(null), "");
});

test("only owner-class roles receive owner privileges",()=>{
 for(const role of ["owner","OWNER","admin","platform_owner","Platform Owner"]) assert.equal(isOwnerRole(role),true,role);
 for(const role of ["student","teacher","manager","senior_manager","prefect","unknown"]) assert.equal(isOwnerRole(role),false,role);
});

test("manager flag grants scoped manager and academic access, not owner access",()=>{
 const manager={role:"teacher",isManager:true};
 assert.equal(canAccessManager(manager),true);
 assert.equal(canManageAcademicContent(manager),true);
 assert.equal(isOwnerRole(manager.role),false);
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

test("owner and admin have owner-class access",()=>{
 for(const role of ["owner","admin","platform_owner"]){
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
 for(const user of [{role:"student"},{role:"teacher",isManager:true},{role:"senior_manager"}]){
  const response=mockResponse();let nextCalls=0;
  enforceOwnerAccess({currentUser:user},response.res,()=>{nextCalls+=1;});
  assert.equal(response.status(),403,String(user.role));assert.equal(nextCalls,0);
 }
 for(const user of [{role:"owner"},{role:"admin"},{role:"platform_owner"}]){
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

test("transfer review access recognizes owner aliases and rejects ordinary learners",()=>{
 for(const role of ["owner","admin","platform_owner","senior_manager","manager"]) assert.equal(canReviewAcademicTransfer({role}),true,role);
 assert.equal(canReviewAcademicTransfer({role:"teacher",isManager:true}),true);
 assert.equal(canReviewAcademicTransfer({role:"teacher",isManager:true,teacherApplicationStatus:"pending_review"}),false);
 for(const role of ["student","prefect","teacher","unknown"]) assert.equal(canReviewAcademicTransfer({role,isManager:false}),false,role);
});
