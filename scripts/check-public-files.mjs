import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
// Defense in depth only; use Gitleaks and private identifier review as separate gates.
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
let findings = 0;
for (const f of files) {
  if (
    /(?:^|\/)(?:\.dev\.vars|\.env)$|\.(?:sqlite|db|log|cpuprofile)$|dpapi/i.test(
      f,
    )
  ) {
    findings++;
    continue;
  }
  const text = await readFile(f, "utf8");
  if (
    /https:\/\/[^\s/]+\.workers\.dev/.test(
      text.replaceAll(
        "https://REPLACE_WORKER.REPLACE_SUBDOMAIN.workers.dev",
        "",
      ),
    )
  )
    findings++;
  if (/[A-Za-z]:[\\/](?:Users|projects)[\\/]/i.test(text)) findings++;
}
console.log(
  "Tracked-file privacy guard: " +
    files.length +
    " files, " +
    findings +
    " findings. No matched values printed.",
);
if (findings) process.exitCode = 1;
