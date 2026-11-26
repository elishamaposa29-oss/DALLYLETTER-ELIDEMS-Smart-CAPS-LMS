import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const projectRoot = process.cwd();
const source = path.join(projectRoot, "public", "founder", "IMG_20260706_100838.jpg");
const outputDir = path.join(projectRoot, "dist", "public", "founder");
if (!fs.existsSync(source)) throw new Error("Original founder photograph is missing: " + source);
fs.mkdirSync(outputDir, { recursive: true });

const widths = [480, 768, 1200];
const formats = [
  { name: "avif", quality: 52 },
  { name: "webp", quality: 80 },
  { name: "jpeg", extension: "jpg", quality: 82 }
];
for (const format of formats) {
  for (const width of widths) {
    const extension = format.extension || format.name;
    const output = path.join(outputDir, "elisha-maposa-origin-" + width + "." + extension);
    execFileSync("pnpm", [
      "dlx", "sharp-cli@6.1.0",
      "--input", source,
      "--output", output,
      "--format", format.name,
      "--quality", String(format.quality),
      "resize", String(width)
    ], { stdio: "inherit" });
    if (!fs.existsSync(output) || fs.statSync(output).size === 0) {
      throw new Error("Image derivative was not generated: " + output);
    }
  }
}
const originalBytes = fs.statSync(source).size;
const variants = formats.flatMap(format => widths.map(width => {
  const file = path.join(outputDir, "elisha-maposa-origin-" + width + "." + format.name);
  return { file: path.basename(file), bytes: fs.statSync(file).size };
}));
console.log(JSON.stringify({ originalBytes, variants }, null, 2));
