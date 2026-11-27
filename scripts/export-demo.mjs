import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
await mkdir("docs/demo", { recursive: true });
const run = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", "tests/e2e/demo.test.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      MUSICBRIDGE_DEMO_EXPORT: resolve("docs/demo/transcript.json"),
    },
  },
);
if (run.status !== 0) process.exit(run.status ?? 1);
const data = JSON.parse(await readFile("docs/demo/transcript.json", "utf8"));
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const cards = data.messages
  .map(
    (m, i) =>
      '<article><span class="number">' +
      String(i + 1).padStart(2, "0") +
      '</span><pre dir="auto">' +
      esc(m.text) +
      '</pre><div class="buttons">' +
      m.buttons.map((b) => "<span>" + esc(b.text) + "</span>").join("") +
      "</div></article>",
  )
  .join("");
const html =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MusicBridge — actual mock transcript</title><style>body{margin:0;background:#101923;color:#e7f0f8;font:16px system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:48px 32px}header{border-bottom:1px solid #405568;padding-bottom:24px;margin-bottom:24px}h1{font-size:40px;margin:8px 0}p{color:#bfd0df;line-height:1.6}.tag{color:#71d5ed;text-transform:uppercase;letter-spacing:2px;font-size:13px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}article{background:#192a38;border:1px solid #344c60;border-radius:12px;padding:20px;overflow-wrap:anywhere}.number{color:#73d0e7;font:13px monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.6 system-ui,sans-serif}.buttons{display:flex;gap:6px;flex-wrap:wrap}.buttons span{border:1px solid #4e6a80;padding:5px 9px;border-radius:5px;font-size:12px;color:#c1ddeb}@media(max-width:700px){.grid{grid-template-columns:1fr}main{padding:24px}}</style><main><header><span class="tag">Synthetic demo · actual handler output</span><h1>MusicBridge</h1><p>Encrypted OAuth confirmation → playlist selection → automatic match → duplicate prevention → ambiguous review → manual choice → bilingual settings.</p><p>Local D1 and mock providers. No real messages or playlist writes. This is a transcript viewer, not a Telegram client screenshot. Numbered cards preserve actual output order; button callback payloads and OAuth URLs are intentionally omitted.</p></header><section class="grid">' +
  cards +
  "</section></main></html>";
await writeFile("docs/demo/index.html", html);
console.log(
  "Exported synthetic handler transcript and static viewer; no live providers used.",
);
