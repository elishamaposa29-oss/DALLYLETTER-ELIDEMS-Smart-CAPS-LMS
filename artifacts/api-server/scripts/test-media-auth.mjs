import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = await mkdtemp(join(tmpdir(), "dallyletter-media-auth-tests-"));
try {
  const outfile = join(dir, "media-auth.test.mjs");
  await build({
    entryPoints: ["src/lib/media-auth.test.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    sourcemap: "inline",
  });
  const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
