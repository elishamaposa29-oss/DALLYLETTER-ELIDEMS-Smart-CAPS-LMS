import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [api,privacy,card,page,hub,app,academic,schema,ai,docs,achievementApi,achievementUi,pdf,idHelper,docPage] = await Promise.all([
  readFile("artifacts/api-server/src/routes/schoolIdentity.ts","utf8"),
  readFile("artifacts/api-server/src/routes/profileConnections.ts","utf8"),
  readFile("artifacts/dallyletter/src/components/SchoolIdCard.tsx","utf8"),
  readFile("artifacts/dallyletter/src/pages/SchoolIdVerification.tsx","utf8"),
  readFile("artifacts/dallyletter/src/pages/ProfileHub.tsx","utf8"),
  readFile("artifacts/dallyletter/src/App.tsx","utf8"),
  readFile("artifacts/api-server/src/routes/academicRecords.ts","utf8"),
  readFile("artifacts/api-server/src/lib/school-id.ts","utf8"),
  readFile("artifacts/dallyletter/src/pages/DocumentVerification.tsx","utf8"),
  readFile("artifacts/api-server/src/lib/ensureProfileHubSchema.ts","utf8"),
  readFile("artifacts/api-server/src/routes/ai.ts","utf8"),
  readFile("artifacts/api-server/src/routes/schoolIdentity.ts","utf8"),
  readFile("artifacts/api-server/src/routes/achievements.ts","utf8"),
  readFile("artifacts/dallyletter/src/pages/student/StudentAchievements.tsx","utf8"),
  readFile("artifacts/api-server/src/routes/academicRecords.ts","utf8"),
]);
assert.match(api,/randomBytes\(16\)/,"School IDs must use 80 random bits");
assert.match(api,/NOT EXISTS \(SELECT 1 FROM learner_school_ids/,"Existing learner accounts must receive School IDs during the additive backfill");
assert.match(api,/createHash\("sha256"\)/,"School IDs must include a checksum and hashed lookup throttling");
assert.match(api,/school_id=\$1/,"Public lookup must match the complete exact School ID");
assert.match(api,/>= 20/,"Public verification must be rate limited");
assert.match(api,/settings\[key\]\?\.mode === "everyone"/,"Only explicitly public portfolio sections may be exposed");
assert.match(api,/stripPrivateFields/,"Public report payloads must remove private personal fields");
assert.match(api,/sensitivePersonalDataShared: false/,"Public lookup must not expose sensitive personal fields");
assert.match(api,/isPublic\("subjects"\)/,"Public portfolio must support learner subjects");
assert.match(api,/isPublic\("transfers"\)/,"Public portfolio must support approved transfer information");
assert.match(academic,/revoke-verification/,"Owner must have a transfer verification revocation endpoint");
assert.match(academic,/verification_revoked_at IS NULL/,"Revoked transfer links must fail public verification");
assert.match(schema,/verification_revocation_reason/,"Transfer revocation reason must be persisted");
assert.match(ai,/\/ai\/school-id-analysis/,"AI academic analysis must have a dedicated School ID route");
assert.match(ai,/Names and approximate IDs cannot be used/,"AI must reject name-only or approximate identity lookups");
assert.match(ai,/settings\[key\]\?\.mode === "everyone"/,"AI must use only learner-published portfolio sections");
assert.match(ai,/verified published academic facts/,"AI analysis must be grounded in verified academic records");
assert.match(privacy,/profile\.sensitive_data_consent\.enabled/,"Consent enablement must be audited");
assert.match(privacy,/profile\.sensitive_data_consent\.revoked/,"Consent revocation must be audited");
assert.match(privacy,/sensitive_personal_data_consent/,"Consent must persist in Profile Hub privacy settings");
assert.match(privacy,/sensitivePersonalDataFields/,"Consent must be saved for individually selected fields");
assert.match(privacy,/guardianApprovalVerified:false/,"Learner selection must not substitute for guardian verification");
assert.match(card,/api\.qrserver\.com/,"School ID card must provide a QR code for the verification URL");
assert.match(card,/navigator\.share/,"School ID card must use native sharing where available");
assert.match(card,/school-id\/me/,"Learner Profile Hub must request its own School ID");
assert.match(hub,/SchoolIdCard/,"School ID card must be integrated into Profile Hub");
assert.match(page,/school-id\/verify/,"Public verification page must call the exact ID endpoint");
assert.match(app,/const SchoolIdVerification = lazy\(\(\) => import\("@\/pages\/SchoolIdVerification"\)\)/,"Public School ID page must be lazily imported");
assert.match(app,/\/verify\/school\/:schoolId/,"Public School ID verification route must be registered");
console.log("School ID / consent static checks passed.");
