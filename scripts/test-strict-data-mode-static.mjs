import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const webMedia = readFileSync("artifacts/dallyletter/src/components/AuthenticatedMedia.tsx", "utf8");
const mobileMedia = readFileSync("artifacts/dallyletter-mobile/components/AuthenticatedMediaPreview.tsx", "utf8");
const sharedMedia = readFileSync("artifacts/dallyletter/src/pages/SharedMedia.tsx", "utf8");
const lessonPreview = readFileSync("artifacts/dallyletter/src/pages/LessonPreview.tsx", "utf8");
const apiLessons = readFileSync("artifacts/api-server/src/routes/lessons.ts", "utf8");

assert.match(webMedia, /const requiresExplicitRequest = type === "video" \|\| type === "audio"/);
assert.match(webMedia, /if \(requiresExplicitRequest && !mediaRequested\)/);
assert.match(webMedia, /setRequestedMediaKey\(\`\$\{type\}:\$\{url\}\`\)/);
assert.match(mobileMedia, /useVideoPlayer\(null,/);
assert.match(mobileMedia, /if \(!looksVideo \|\| !videoRequested\) return/);
assert.match(mobileMedia, /Load video and play/);
assert.match(lessonPreview, /externalVideoRequested/);
assert.match(lessonPreview, /Video preview paused to save mobile data/);
assert.match(sharedMedia, /shareToken=\{shareToken\}/);
assert.match(sharedMedia, /Invite classmates/);
assert.match(sharedMedia, /register\?source=shared-resource/);
assert.match(apiLessons, /const mediaAccess =/);
assert.match(apiLessons, /router.get\("\/lessons\/media\/:storageKey", mediaAccess/);
assert.match(apiLessons, /const range = req.headers.range/);

console.log("Strict data-saving and shared-resource growth regression checks passed.");
