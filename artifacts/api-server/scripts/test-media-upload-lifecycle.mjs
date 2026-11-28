import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for media upload lifecycle integration tests.");
  process.exit(2);
}
const dir = await mkdtemp(join(tmpdir(), "dallyletter-media-upload-tests-"));
try {
  const outfile = join(dir, "media-upload-lifecycle.test.cjs");
  await build({
    entryPoints: ["scripts/media-upload-lifecycle.test.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    sourcemap: "inline",
  });
  const result = spawnSync(process.execPath, ["--test", outfile], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
