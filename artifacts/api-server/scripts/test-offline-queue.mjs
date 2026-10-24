import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = await mkdtemp(join(tmpdir(), "dallyletter-offline-queue-tests-"));
try {
  const outfile = join(dir, "QueuedSubmissionStoreCore.test.mjs");
  await build({
    entryPoints: ["scripts/QueuedSubmissionStoreCore.test.ts"],
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
