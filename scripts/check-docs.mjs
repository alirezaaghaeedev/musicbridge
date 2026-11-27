import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
const skip = new Set([
  "node_modules",
  ".git",
  ".wrangler",
  ".npm-cache",
  "coverage",
  "dist",
]);
async function files(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p)));
    else if (extname(p) === ".md") out.push(p);
  }
  return out;
}
let count = 0;
let failed = 0;
for (const f of await files(".")) {
  const text = (await readFile(f, "utf8")).replace(/```[\s\S]*?```/g, "");
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let ref = match[1].split(/\s+"/)[0];
    if (/^(?:https?:|mailto:|#)/.test(ref)) continue;
    ref = ref.split("#")[0];
    if (!ref) continue;
    count++;
    try {
      await stat(resolve(dirname(f), decodeURIComponent(ref)));
    } catch {
      failed++;
      console.error(
        "Broken local documentation target in " +
          f.split(/[\\/]/).slice(-2).join("/") +
          ": " +
          ref,
      );
    }
  }
}
console.log(
  "Checked " +
    count +
    " local Markdown targets; " +
    failed +
    " missing. External URLs and anchors require separate review.",
);
if (failed) process.exitCode = 1;
