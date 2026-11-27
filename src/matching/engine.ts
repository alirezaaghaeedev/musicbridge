import type {
  Metadata,
  Track,
  MatchCandidate,
  Settings,
} from "../domain/model";
import { normalize } from "./normalizer";
import { Scorer } from "./scorer";
const versionLabels = [
  "live",
  "acoustic",
  "remaster",
  "radio edit",
  "extended",
  "instrumental",
  "remix",
  "cover",
  "demo",
  "mono",
  "stereo",
  "sped up",
  "slowed",
  "nightcore",
  "karaoke",
];
const versionPatterns = versionLabels.map((label) => ({
  label,
  pattern: new RegExp(`\\b${label}(?:ed)?\\b`),
}));
export function similarity(a: string, b: string): number {
  return new Scorer().similarity(a, b);
}
export function durationSimilarity(
  seconds?: number,
  ms?: number,
): number | null {
  if (seconds === undefined || ms === undefined) return null;
  const delta = Math.abs(seconds - ms / 1000);
  const score =
    delta <= 2
      ? 100
      : delta <= 5
        ? 90
        : delta <= 10
          ? 70
          : delta <= 20
            ? 40
            : 0;
  return Math.abs(seconds - ms / 1000) / Math.max(seconds, ms / 1000, 1) > 0.15
    ? Math.min(score, 40)
    : score;
}
export function versions(title: string): string[] {
  const n = normalize(title);
  const found = versionPatterns
    .filter((v) => v.pattern.test(n))
    .map((v) => v.label);
  const part = n.match(/(?:^|\s)(?:part|pt|بخش|قسمت|جزء)\s*(\d+)\b/);
  if (part) found.push(`part ${part[1]}`);
  return found.sort();
}
export function versionMismatch(a: string, b: string): boolean {
  const av = versions(a),
    bv = versions(b);
  // Same broad label can still describe different performances/remixers/years.
  return (
    av.join("|") !== bv.join("|") ||
    (av.length > 0 && normalize(a) !== normalize(b))
  );
}
export function artistSimilarity(artist: string, artists: string[]): number {
  return new Scorer().artist(artist, artists);
}
export function createRanker(metadata: Metadata) {
  const scorer = new Scorer();
  const cache = new Map<string, MatchCandidate>();
  return {
    rank: (tracks: Track[]) => rank(metadata, tracks, scorer, cache),
    diagnostics: () => scorer.diagnostics,
  };
}
export function rank(
  metadata: Metadata,
  tracks: Track[],
  scorer = new Scorer(),
  cache = new Map<string, MatchCandidate>(),
): MatchCandidate[] {
  const mismatches = new Map<string, boolean>();
  const results = [
    ...new Map(tracks.slice(0, 40).map((t) => [t.id, t])).values(),
  ]
    .map((t) => {
      const key = JSON.stringify(t);
      const cached = cache.get(key);
      if (cached) return cached;
      const titleScore = scorer.similarity(metadata.title ?? "", t.title);
      const artistScore =
        metadata.artist && t.artists.length
          ? scorer.artist(metadata.artist, t.artists)
          : null;
      const durationScore = durationSimilarity(
        metadata.durationSeconds,
        t.durationMs,
      );
      let mismatch = mismatches.get(t.title);
      if (mismatch === undefined) {
        mismatch = versionMismatch(metadata.title ?? "", t.title);
        mismatches.set(t.title, mismatch);
      }
      const weight =
        0.5 +
        (artistScore === null ? 0 : 0.35) +
        (durationScore === null ? 0 : 0.15);
      const finalScore =
        Math.round(
          ((titleScore * 0.5 +
            (artistScore ?? 0) * 0.35 +
            (durationScore ?? 0) * 0.15) /
            weight) *
            100,
        ) / 100;
      const missingFields = [
        ...(artistScore === null ? ["artist"] : []),
        ...(durationScore === null ? ["duration"] : []),
      ];
      const candidate: MatchCandidate = {
        ...t,
        spotifyTrackId: t.id,
        spotifyTrackUri: t.uri,
        titleScore,
        artistScore,
        durationScore,
        finalScore,
        versionMismatch: mismatch,
        missingFields,
        warnings: [
          ...(mismatch ? ["Incompatible recording version"] : []),
          ...(t.available === false
            ? ["Track unavailable"]
            : t.available !== true
              ? ["Availability unknown"]
              : []),
        ],
        reasons: [
          `Title ${titleScore.toFixed(1)}`,
          `Artist ${artistScore?.toFixed(1) ?? "missing"}`,
          `Duration ${durationScore ?? "missing"}`,
          `Weights renormalized over available fields: ${weight}`,
        ],
      };
      cache.set(key, candidate);
      return candidate;
    })
    .sort(
      (a, b) =>
        b.finalScore - a.finalScore || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  // An unfinished rival must never make a fully scored candidate appear unambiguous.
  return results.map((c) => ({
    ...c,
    computationLimited: scorer.limited,
    warnings: [
      ...c.warnings,
      ...(scorer.limited
        ? ["Matching computation limit reached; automatic addition blocked"]
        : []),
    ],
  }));
}
export function equivalent(a: Track, b: Track): boolean {
  return (
    !!a.isrc &&
    a.isrc === b.isrc &&
    normalize(a.title) === normalize(b.title) &&
    [...a.artists].map(normalize).sort().join("|") ===
      [...b.artists].map(normalize).sort().join("|") &&
    a.durationMs !== undefined &&
    b.durationMs !== undefined &&
    Math.abs(a.durationMs - b.durationMs) <= 2000 &&
    !versionMismatch(a.title, b.title)
  );
}
export function decide(
  candidates: MatchCandidate[],
  s: Settings,
): "auto" | "review" | "none" {
  const best = candidates[0];
  if (candidates.some((c) => c.computationLimited))
    return candidates.length ? "review" : "none";
  if (!best || best.finalScore < 60) return "none";
  const rival = candidates.slice(1).find((c) => !equivalent(best, c));
  return s.auto &&
    !!s.playlist &&
    best.finalScore >= s.threshold &&
    best.titleScore >= 85 &&
    best.artistScore !== null &&
    best.artistScore >= s.minimumArtist &&
    !best.versionMismatch &&
    best.available === true &&
    (!rival || best.finalScore - rival.finalScore >= s.margin)
    ? "auto"
    : "review";
}
