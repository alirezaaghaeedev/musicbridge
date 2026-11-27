import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
// Secrets are written only to a gitignored local file, never stdout.
let text = await readFile(".dev.vars.example", "utf8");
text = text
  .replace(
    "TELEGRAM_WEBHOOK_SECRET=GENERATE_WITH_NPM_RUN_SECRETS_GENERATE",
    `TELEGRAM_WEBHOOK_SECRET=${randomBytes(32).toString("hex")}`,
  )
  .replace(
    "TOKEN_ENCRYPTION_KEY=GENERATE_WITH_NPM_RUN_SECRETS_GENERATE",
    `TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`,
  );
try {
  await writeFile(".dev.vars", text, { flag: "wx", mode: 0o600 });
  console.log(
    "Created .dev.vars with new development secrets. Values are not printed.",
  );
} catch (e) {
  if (e.code === "EEXIST") {
    console.error(".dev.vars already exists; preserved it.");
    process.exitCode = 1;
  } else throw e;
}
