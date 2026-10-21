import test from "node:test";
import assert from "node:assert/strict";
import { canAccessManager, canManageAcademicContent, canUseStaffAI, isOwnerRole, normalizeRole } from "./role-access.js";

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
