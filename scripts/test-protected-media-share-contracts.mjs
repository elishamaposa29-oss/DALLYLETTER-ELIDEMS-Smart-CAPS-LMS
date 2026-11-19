import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function sourceFiles(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
    return [".ts", ".tsx", ".js", ".jsx"].includes(entry.name.slice(entry.name.lastIndexOf("."))) ? [path] : [];
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
assert.ok(helper.includes('method: "POST"'));
assert.ok(helper.includes("/api/lessons/media/"));
assert.ok(helper.includes("/shared-media"));
assert.ok(helper.includes("shareToken"));

const webPath = "artifacts/dallyletter/src/components/AuthenticatedMedia.tsx";
const web = contents.get(webPath);
assert.ok(web.includes("createProtectedMediaShareLink"));
assert.ok(web.includes("navigator.share"));
assert.ok(web.includes("navigator.clipboard?.writeText"));
assert.ok(!web.includes("files:[file]"), "Web must never bypass protected links by sharing raw media files");

const mobileMediaPath = "artifacts/dallyletter-mobile/components/OfflineMediaDownload.tsx";
const mobileMedia = contents.get(mobileMediaPath);
assert.ok(mobileMedia.includes("createProtectedMediaShareLink"));
assert.ok(mobileMedia.includes("Share.share"));
assert.ok(!mobileMedia.includes("shared-media?url="), "Mobile must not maintain a second protected-link URL builder");

const lessonPath = "artifacts/dallyletter-mobile/app/(student)/lessons.tsx";
const lesson = contents.get(lessonPath);
assert.ok(lesson.includes("createProtectedMediaShareLink"));
assert.ok(lesson.includes("Share.share"));
assert.ok(!lesson.includes("extractLessonLinks(selectedLesson.content).join"), "Lesson sharing must not expose raw lesson URLs or content");

const audit = contents.get("artifacts/dallyletter/src/pages/admin/AdminAuditLogs.tsx");
assert.ok(!audit.includes("navigator.share"), "Confidential audit logs must not be exposed through public OS share targets");
assert.ok(audit.includes("Copy summary"));

const nativeShareFiles = [...contents.entries()].filter(([, source]) => source.includes("navigator.share") || source.includes("Share.share")).map(([path]) => path);
assert.deepEqual(nativeShareFiles.sort(), [webPath, mobileMediaPath, lessonPath].sort(), "Every remaining native share sheet must distribute a Dallyletter protected link");
console.log("PROTECTED_MEDIA_SHARE_CONTRACTS: PASS");
