import { describe, it, expect } from "vitest";
import { performance } from "node:perf_hooks";
import { scenarios } from "../fixtures/evaluation";
import { rank, decide } from "../../src/matching/engine";
import type { Settings } from "../../src/domain/model";
const settings: Settings = {
  auto: true,
  threshold: 80,
  duplicates: true,
  locale: "en",
  minimumArtist: 75,
  margin: 8,
  playlist: "P".repeat(22),
};
describe("synthetic matching safety dataset", () => {
  for (const s of scenarios)
    it(s.name, () => {
      const c = rank(s.input, s.tracks);
      const d = decide(c, settings);
      expect(d).toBe(s.expected);
      if (s.safety) expect(d).not.toBe("auto");
      if (d === "auto") expect(c[0]!.id).toBe(s.correctId);
    });
  it("reports evaluation and bounded ranking measurements", () => {
    const counts = {
      dataset: scenarios.length,
      correctAutomatic: 0,
      incorrectAutomatic: 0,
      manualReview: 0,
      falsePositive: 0,
      falseNegative: 0,
      unmatched: 0,
    };
    for (const s of scenarios) {
      const c = rank(s.input, s.tracks);
      const d = decide(c, settings);
      if (d === "auto") {
        if (s.expected === "auto" && c[0]!.id === s.correctId)
          counts.correctAutomatic++;
        else {
          counts.incorrectAutomatic++;
          counts.falsePositive++;
        }
      }
      if (d === "review") counts.manualReview++;
      if (d === "none") counts.unmatched++;
      if (s.expected === "auto" && d !== "auto") counts.falseNegative++;
    }
    const sample = scenarios[0]!;
    const candidates = Array.from({ length: 40 }, (_, i) => ({
      ...sample.tracks[0]!,
      id: String(i),
    }));
    const start = performance.now();
    for (let i = 0; i < 100; i++) rank(sample.input, candidates);
    const ms = (performance.now() - start) / 100;
    console.log(
      JSON.stringify({ syntheticEvaluation: counts, localMeanRanking40Ms: ms }),
    );
    expect(counts.falsePositive).toBe(0);
    expect(counts.dataset).toBeGreaterThanOrEqual(50);
  });
});
