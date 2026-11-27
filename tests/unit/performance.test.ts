import { it, expect } from "vitest";
import { Scorer, MATCH_LIMITS } from "../../src/matching/scorer";
import {
  createRanker,
  decide,
  similarity,
  rank,
} from "../../src/matching/engine";
import type { Settings, Track } from "../../src/domain/model";
it("caps normalization profiles and flags expanded Unicode rather than trusting truncation", () => {
  const s = new Scorer();
  for (let i = 0; i < 300; i++) s.text(`profile${i}`);
  expect(s.diagnostics.profiles).toBe(MATCH_LIMITS.profiles);
  expect(s.limited).toBe(true);
  const expanded = new Scorer();
  expanded.text("\uFDFA".repeat(256));
  expect(expanded.limited).toBe(true);
});
const settings: Settings = {
  auto: true,
  threshold: 80,
  duplicates: true,
  locale: "en",
  minimumArtist: 75,
  margin: 8,
  playlist: "P".repeat(22),
};
it("prefix/suffix trimming preserves the original length denominator", () => {
  expect(similarity("a".repeat(255) + "b", "a".repeat(255) + "c")).toBeCloseTo(
    (100 * 255) / 256,
  );
  expect(similarity("abcXdef", "abcYZdef")).toBe(75);
});
it("a repeated artist pair is computed once", () => {
  const s = new Scorer();
  s.artist("a".repeat(255) + "b", Array(16).fill("a".repeat(255) + "c"));
  const before = s.diagnostics;
  s.artist("a".repeat(255) + "b", Array(16).fill("a".repeat(255) + "c"));
  expect(s.diagnostics).toEqual(before);
  expect(s.cells).toBe(1);
});
it("caches unchanged candidates across progressive searches", () => {
  const r = createRanker({
    title: "Northern Lights",
    artist: "Example Artist",
  });
  const t: Track = {
    id: "a",
    uri: "spotify:track:a",
    title: "Northern Lghts",
    artists: ["Example Artst"],
    available: true,
  };
  r.rank([t]);
  const before = r.diagnostics();
  r.rank([t]);
  expect(r.diagnostics()).toEqual(before);
});
it("bounds adversarial work and blocks automatic selection even when one candidate is exact", () => {
  const metadata = { title: "x".repeat(256), artist: "y".repeat(256) };
  const tracks: Track[] = Array.from({ length: 40 }, (_, i) => ({
    id: String(i),
    uri: `spotify:track:${i}`,
    title: i === 0 ? metadata.title : String.fromCharCode(65 + i).repeat(256),
    artists: [i === 0 ? metadata.artist : "z".repeat(256)],
    available: true,
  }));
  const r = createRanker(metadata),
    c = r.rank(tracks);
  expect(r.diagnostics().limited).toBe(true);
  expect(r.diagnostics().cells).toBeLessThanOrEqual(MATCH_LIMITS.cells);
  expect(r.diagnostics().comparisons).toBeLessThanOrEqual(
    MATCH_LIMITS.comparisons,
  );
  expect(decide(c, settings)).toBe("review");
  expect(c[0]!.computationLimited).toBe(true);
});
it("truncation and excess artist collections never grant automatic confidence", () => {
  const t: Track = {
    id: "a",
    uri: "spotify:track:a",
    title: "Song",
    artists: Array(30).fill("Artist"),
    available: true,
  };
  expect(decide(rank({ title: "Song", artist: "Artist" }, [t]), settings)).toBe(
    "review",
  );
  expect(
    decide(
      rank({ title: "a".repeat(257), artist: "Artist" }, [
        { ...t, title: "a".repeat(257), artists: ["Artist"] },
      ]),
      settings,
    ),
  ).toBe("review");
});
it("all availability states have explicit automatic policies", () => {
  for (const available of [true, false, undefined]) {
    const c = rank({ title: "Song", artist: "Artist" }, [
      {
        id: "a",
        uri: "spotify:track:a",
        title: "Song",
        artists: ["Artist"],
        available,
      },
    ]);
    expect(decide(c, settings)).toBe(available === true ? "auto" : "review");
  }
});
