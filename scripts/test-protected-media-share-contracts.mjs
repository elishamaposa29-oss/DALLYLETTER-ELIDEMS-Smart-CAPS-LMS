import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function sourceFiles(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return /\\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [path] : [];
  });
}
const files = [
  ...sourceFiles("artifacts/dallyletter/src"),
  ...sourceFiles("artifacts/dallyletter-mobile"),
  ...sourceFiles("lib/api-client-react/src"),
];
const contents = new Map(files.map(path => [path, readFileSync(join(root, path), "utf8")]));
const helperPath = "lib/api-client-react/src/protected-media-share.ts";
const helper = contents.get(helperPath);
assert.ok(helper, "One shared protected-media-link creator must exist in the shared API client");
assert.match(helper, /POST/);
assert.match(helper, /\/api\/lessons\/media\//);
assert.match(helper, /\/shared-media/);
assert.match(helper, /shareToken/);
assert.match(helper, /expires|protected/i);

const webPath = "artifacts/dallyletter/src/components/AuthenticatedMedia.tsx";
const web = contents.get(webPath);
assert.match(web, /createProtectedMediaShareLink/);
assert.match(web, /navigator\\.share/);
assert.match(web, /navigator\\.clipboard\\?\.writeText/);
assert.doesNotMatch(web, /files:\\s*\\[file\\]/, "Web must never bypass protected links by sharing raw media files");

const mobileMediaPath = "artifacts/dallyletter-mobile/components/OfflineMediaDownload.tsx";
const mobileMedia = contents.get(mobileMediaPath);
assert.match(mobileMedia, /createProtectedMediaShareLink/);
assert.match(mobileMedia, /Share\\.share/);
assert.doesNotMatch(mobileMedia, /shared-media\\?url=/, "Mobile must not maintain a second protected-link URL builder");

const lessonPath = "artifacts/dallyletter-mobile/app/(student)/lessons.tsx";
const lesson = contents.get(lessonPath);
assert.match(lesson, /createProtectedMediaShareLink/);
assert.match(lesson, /Share\\.share/);
assert.doesNotMatch(lesson, /extractLessonLinks\\(selectedLesson\\.content\\)\\.join/, "Lesson sharing must not expose raw lesson URLs or content");

const audit = contents.get("artifacts/dallyletter/src/pages/admin/AdminAuditLogs.tsx");
assert.doesNotMatch(audit, /navigator\\.share/, "Confidential audit logs must not be exposed through public OS share targets");
assert.match(audit, /Copy summary/);

const nativeShareFiles = [...contents.entries()].filter(([, source]) => /(?:navigator\\.share|Share\\.share)/.test(source)).map(([path]) => path);
assert.deepEqual(nativeShareFiles.sort(), [webPath, mobileMediaPath, lessonPath].sort(), "Every remaining native share sheet must distribute a Dallyletter protected link");
console.log("PROTECTED_MEDIA_SHARE_CONTRACTS: PASS");
