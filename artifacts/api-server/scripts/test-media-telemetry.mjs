import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = await mkdtemp(join(tmpdir(), "dallyletter-media-telemetry-"));
try {
  const outfile = join(dir, "media-telemetry.test.cjs");
  await build({
    entryPoints: ["scripts/media-telemetry.test.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    sourcemap: "inline",
  });
  const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit", env: { ...process.env, NODE_ENV: "production" } });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
