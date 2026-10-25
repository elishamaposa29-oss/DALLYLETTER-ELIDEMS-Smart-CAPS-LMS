import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = await mkdtemp(join(tmpdir(), "dallyletter-auth-tests-"));
try {
  await build({
    entryPoints: ["src/lib/role-access.test.ts", "src/lib/signed-token.test.ts", "src/lib/password-hash.test.ts"],
    outdir: dir,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    sourcemap: "inline",
  });
  const result = spawnSync(process.execPath, ["--test", join(dir, "role-access.test.mjs"), join(dir, "signed-token.test.mjs"), join(dir, "password-hash.test.mjs")], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
