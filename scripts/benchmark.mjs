import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { performance } from "node:perf_hooks";
function load(root) {
  const urls = new Map();
  function moduleUrl(file) {
    if (urls.has(file)) return urls.get(file);
    let code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    code = code.replace(
      /from ["'](\.\/[\w-]+)["']/g,
      (_m, name) =>
        "from " +
        JSON.stringify(
          moduleUrl(path.resolve(path.dirname(file), name + ".ts")),
        ),
    );
    const url =
      "data:text/javascript;base64," + Buffer.from(code).toString("base64");
    urls.set(file, url);
    return url;
  }
  return import(moduleUrl(path.resolve(root, "engine.ts")));
}
const arg = process.argv.indexOf("--baseline");
const implementations = [
  ...(arg >= 0 ? [["before", process.argv[arg + 1]]] : []),
  ["after", "src/matching"],
];
const scenarios = [
  { name: "ordinary typo / 40", length: 24, artists: 1 },
  { name: "256 characters / 40", length: 256, artists: 1 },
  { name: "256 characters x 30 artists / 40", length: 256, artists: 30 },
  {
    name: "distinct adversarial / 40",
    length: 256,
    artists: 16,
    distinct: true,
  },
];
const report = [];
for (const [implementation, root] of implementations) {
  const engine = await load(root);
  for (const s of scenarios) {
    const metadata = {
      title: "a".repeat(s.length - 1) + "b",
      artist: "c".repeat(s.length - 1) + "d",
      durationSeconds: 240,
    };
    const tracks = Array.from({ length: 40 }, (_, i) => ({
      id: String(i),
      uri: "spotify:track:" + i,
      title: s.distinct
        ? String.fromCharCode(65 + i).repeat(256)
        : "a".repeat(s.length - 1) + "e",
      artists: Array.from({ length: s.artists }, () =>
        s.distinct
          ? String.fromCharCode(65 + i).repeat(256)
          : "c".repeat(s.length - 1) + "f",
      ),
      durationMs: 240000,
      available: true,
    }));
    const samples = [];
    let diagnostics;
    for (let run = 0; run < 3; run++) {
      const before = process.cpuUsage(),
        start = performance.now();
      if (engine.createRanker) {
        const r = engine.createRanker(metadata);
        r.rank(tracks);
        diagnostics = r.diagnostics();
      } else engine.rank(metadata, tracks);
      const cpu = process.cpuUsage(before);
      samples.push({
        wallMs: performance.now() - start,
        cpuMs: (cpu.user + cpu.system) / 1000,
      });
    }
    samples.sort((a, b) => a.wallMs - b.wallMs);
    report.push({
      implementation,
      scenario: s.name,
      medianWallMs: samples[1].wallMs,
      medianOrderedSampleCpuMs: samples[1].cpuMs,
      diagnostics,
    });
  }
}
console.log(
  JSON.stringify(
    {
      runtime: process.version,
      kind: "local Node measurements; not Cloudflare CPU",
      runsPerCase: 3,
      results: report,
    },
    null,
    2,
  ),
);
