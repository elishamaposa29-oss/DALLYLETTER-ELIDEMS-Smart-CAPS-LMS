import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { db, pool, usersTable } from "@workspace/db";

const base=process.env.API_BASE_URL||"http://127.0.0.1:4000";
const capture=process.env.MOCK_PROVIDER_CAPTURE||"/tmp/dallyletter-provider-capture.jsonl";
const suffix=crypto.randomBytes(6).toString("hex");
const ownerEmail="teacher-cv-owner-"+suffix+"@example.test";
const password="Teacher-CV-Test-Password-938!";
async function request(path,{token,method="GET",body}={}){
 const response=await fetch(base+path,{method,headers:{...(token?{Authorization:"Bearer "+token}:{}),...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
 const data=await response.json().catch(()=>({}));
 return {status:response.status,data};
}
const [owner]=await db.insert(usersTable).values({email:ownerEmail,passwordHash:"test-only-not-used",name:"CV Workflow Test Owner",role:"owner"}).returning();
const encoded=Buffer.from(JSON.stringify({userId:owner.id,ts:Date.now()})).toString("base64url");
const ownerToken=encoded+"."+crypto.createHmac("sha256",process.env.JWT_SECRET).update(encoded).digest("hex");
await pool.query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '90 days')",[crypto.createHash("sha256").update(ownerToken).digest("hex"),owner.id]);
const config=await request("/api/teacher-cv-workspace/config",{token:ownerToken});
assert.equal(config.status,200,"Owner can open CV workflow settings");
const savedConfig=await request("/api/teacher-cv-workspace/config",{token:ownerToken,method:"PATCH",body:{reviewDurationDays:1}});
assert.equal(savedConfig.status,200,"Owner can set the review duration");
assert.equal(savedConfig.data.reviewDurationDays,1);

async function registerTeacher(label){
 const email="teacher-cv-"+label+"-"+suffix+"@example.test";
 const created=await request("/api/auth/register",{method:"POST",body:{name:"CV Test "+label,email,password,role:"teacher",phone:"+263771234567"}});
 assert.equal(created.status,201,"Teacher registration must succeed");
 assert.equal(created.data.user.teacherApplicationStatus,"pending_review");
 assert.ok(created.data.user.teacherReviewDeadline,"Owner-configured review deadline must be assigned");
 return {id:created.data.user.id,email,token:created.data.token};
}
const rejected=await registerTeacher("rejected");
const deniedDashboard=await request("/api/dashboard",{token:rejected.token});
assert.equal(deniedDashboard.status,403,"Pending teacher cannot access dashboard APIs");
const deniedLesson=await request("/api/lessons",{token:rejected.token,method:"POST",body:{title:"blocked pending teacher action"}});
assert.equal(deniedLesson.status,403,"Pending teacher cannot create lessons");
const cvRead=await request("/api/users/me/teacher-cv",{token:rejected.token});
assert.equal(cvRead.status,200,"Pending teacher can access their own CV");
const cvWrite=await request("/api/users/me/teacher-cv",{token:rejected.token,method:"PATCH",body:{cv:{professionalSummary:"A test CV",education:"Test education",experience:"3 years",subjects:"Mathematics",address:"Harare",personalDetails:JSON.stringify({fullName:"CV Test rejected",idNumber:"TEST-123",dob:"1995-06-15",phone:"+263771234567",email:rejected.email,address:"Harare"})}}});
assert.equal(cvWrite.status,200,"Pending teacher can save CV fields");
const applicantMessage=await request("/api/teacher-cv-workspace/"+rejected.id+"/chat",{token:rejected.token,method:"POST",body:{body:"Please confirm my application was received."}});
assert.equal(applicantMessage.status,201,"Applicant can message reviewers");
const ownerMessages=await request("/api/teacher-cv-workspace/"+rejected.id+"/chat",{token:ownerToken});
assert.equal(ownerMessages.status,200);
assert.equal(ownerMessages.data.length,1,"Owner can read applicant conversation");
const rejectedDecision=await request("/api/teacher-cv-workspace/"+rejected.id+"/decision",{token:ownerToken,method:"POST",body:{action:"reject",note:"Test rejection"}});
assert.equal(rejectedDecision.status,200,"Owner rejection succeeds only after email provider acceptance");
const rejectedRow=await pool.query("SELECT role,teacher_application_status,password_hash FROM users WHERE id=$1",[rejected.id]);
assert.equal(rejectedRow.rows[0].role,"student","Rejected teacher becomes learner");
assert.equal(rejectedRow.rows[0].teacher_application_status,"rejected");
assert.ok(rejectedRow.rows[0].password_hash,"Existing login credential must be preserved");
const revokedSession=await request("/api/users/me/teacher-cv",{token:rejected.token});
assert.equal(revokedSession.status,401,"Old teacher session is revoked after conversion");
const learnerLogin=await request("/api/auth/login",{method:"POST",body:{email:rejected.email,password}});
assert.equal(learnerLogin.status,200,"Original credentials still authenticate after conversion");
assert.equal(learnerLogin.data.user.role,"student","Next login receives learner role");
const learnerLesson=await request("/api/lessons",{token:learnerLogin.data.token,method:"POST",body:{title:"learner cannot teach"}});
assert.equal(learnerLesson.status,403,"Converted learner cannot create teacher lessons");

const expired=await registerTeacher("expired");
await pool.query("UPDATE users SET created_at=now()-interval '2 days',teacher_review_deadline=now()-interval '1 day' WHERE id=$1",[expired.id]);
const expiryRun=await request("/api/teacher-cv-workspace/__test/process-expired",{token:ownerToken,method:"POST"});
assert.equal(expiryRun.status,200,"Owner can run the expiry processor in isolated test mode");
const expiredRow=await pool.query("SELECT role,teacher_application_status,password_hash FROM users WHERE id=$1",[expired.id]);
assert.equal(expiredRow.rows[0].role,"student","Expired application automatically becomes learner");
assert.equal(expiredRow.rows[0].teacher_application_status,"auto_converted");
assert.ok(expiredRow.rows[0].password_hash,"Expiry preserves the login credential");
const expiredOldSession=await request("/api/users/me/teacher-cv",{token:expired.token});
assert.equal(expiredOldSession.status,401,"Expiry conversion revokes existing teacher sessions");
const expiredLogin=await request("/api/auth/login",{method:"POST",body:{email:expired.email,password}});
assert.equal(expiredLogin.status,200,"Expired applicant can sign in with original credentials");
assert.equal(expiredLogin.data.user.role,"student","Expired applicant's next login is learner experience");

const records=readFileSync(capture,"utf8").split("\n").filter(Boolean).map(line=>JSON.parse(line));
const emails=records.filter(record=>record.provider==="resend"&&record.body?.subject?.includes("teacher application"));
assert.ok(emails.some(record=>record.body?.to?.includes(rejected.email)),"Rejection notification must be accepted by the mocked Resend provider");
assert.ok(emails.some(record=>record.body?.to?.includes(expired.email)),"Expiry notification must be accepted by the mocked Resend provider");
console.log("TEACHER_CV_WORKFLOW_E2E:",JSON.stringify({pendingTeacherRestrictions:"PASS",ownCvAccess:"PASS",applicantChat:"PASS",ownerDurationSetting:"PASS",rejectionEmailAccepted:"PASS",rejectionConversion:"PASS",sessionRevocation:"PASS",nextLoginLearner:"PASS",expiryEmailAccepted:"PASS",expiryConversion:"PASS",expiryNextLoginLearner:"PASS",emailProvider:"isolated Resend mock; no real inbox delivery"}));
