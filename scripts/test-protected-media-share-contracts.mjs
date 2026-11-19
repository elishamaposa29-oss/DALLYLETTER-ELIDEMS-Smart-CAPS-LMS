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
assert.ok(helper.includes('page.searchParams.set("k", data.shareToken)'));
assert.ok(helper.includes('page.searchParams.set("m", match[1])'));
assert.ok(helper.includes("DEFAULT_DALLYLETTER_WEB_URL"));

const webPath = "artifacts/dallyletter/src/components/AuthenticatedMedia.tsx";
const web = contents.get(webPath);
assert.ok(web.includes("createProtectedMediaShareLink"));
assert.ok(web.includes("navigator.share"));
assert.ok(web.includes("navigator.clipboard?.writeText"));
assert.ok(web.includes("brandedShare && shareToken"));
assert.ok(web.includes('path.startsWith("/api/lessons/media/")'));
assert.ok(web.includes('mediaRequestUrl.searchParams.set("shareToken", shareToken)'), "Public viewer must pass its signed token to the protected media endpoint");
assert.ok(web.includes("Stream public media directly"), "Shared media must stream without downloading a complete blob first");
assert.ok(web.includes("downloadBrandedImage") && web.includes('logo.src = "/icons/icon-192.png"'), "Exported shared images must carry the Dallyletter app-logo watermark");
assert.ok(web.includes("data-dallyletter-shared-image"), "The displayed source image must be used for watermarked export without a second download");
assert.ok(web.includes('preload="none"'), "Audio and video must not preload large files on low-data connections");
assert.ok(!web.includes("files:[file]"), "Web must never bypass protected links by sharing raw media files");
assert.equal((web.match(/supportsProtectedShare && <Button/g) || []).length, 4, "Every supported web media type must use the same protected share control");
assert.ok(!web.includes("supportsProtectedShare && {"), "Share controls must not contain duplicated conditional wrappers");

const mobileMediaPath = "artifacts/dallyletter-mobile/components/OfflineMediaDownload.tsx";
const mobileMedia = contents.get(mobileMediaPath);
assert.ok(mobileMedia.includes("createProtectedMediaShareLink"));
assert.ok(mobileMedia.includes("DEFAULT_DALLYLETTER_WEB_URL"));
assert.ok(mobileMedia.includes("Share.share"));
assert.ok(!mobileMedia.includes("shared-media?url="), "Mobile must not maintain a second protected-link URL builder");

const lessonPath = "artifacts/dallyletter-mobile/app/(student)/lessons.tsx";
const lesson = contents.get(lessonPath);
assert.ok(lesson.includes("AuthenticatedMediaPreview"));
assert.ok(!lesson.includes("Share.share") && !lesson.includes("createProtectedMediaShareLink"), "Lesson details must not add a second share system; per-media protected sharing is reused");
assert.ok(!lesson.includes("extractLessonLinks(selectedLesson.content).join"), "Lesson sharing must not expose raw lesson URLs or content");

const apiLessons = readFileSync(join(root, "artifacts/api-server/src/routes/lessons.ts"), "utf8");
assert.ok(apiLessons.includes('digest().subarray(0, 16).toString("base64url")'), "New signing keys must be compact 128-bit base64url values");
assert.ok(apiLessons.includes('|[A-Za-z0-9_-]{22}'), "Server must accept compact share keys");
assert.ok(apiLessons.includes('|[a-f0-9]{64}'), "Server must continue accepting existing long share keys");
assert.ok(apiLessons.includes('Content-Disposition'), "A protected direct-file download fallback must be available");
assert.ok(apiLessons.includes('Accept-Ranges'), "Media endpoints must advertise byte-range support");

const sharedPage = contents.get("artifacts/dallyletter/src/pages/SharedMedia.tsx");
assert.ok(sharedPage.includes("shareToken={shareToken}"), "Shared-media page must pass the signed token into the viewer");
assert.ok(sharedPage.includes('params.get("k")'), "Compact share key must be supported");
assert.ok(sharedPage.includes('params.get("shareToken")'), "Legacy long-key share URLs must remain supported");

const audit = contents.get("artifacts/dallyletter/src/pages/admin/AdminAuditLogs.tsx");
assert.ok(!audit.includes("navigator.share"), "Confidential audit logs must not be exposed through public OS share targets");
assert.ok(audit.includes("Copy summary"));

const nativeShareFiles = [...contents.entries()].filter(([, source]) => source.includes("navigator.share") || source.includes("Share.share")).map(([path]) => path);
assert.deepEqual(nativeShareFiles.sort(), [webPath, mobileMediaPath].sort(), "Every remaining native share sheet must distribute a Dallyletter protected link");
console.log("PROTECTED_MEDIA_SHARE_CONTRACTS: PASS");
