import { describe, it, expect } from "vitest";
import { normalize, parseFilename } from "../../src/matching/normalizer";
import {
  similarity,
  artistSimilarity,
  durationSimilarity,
  versions,
  rank,
  decide,
  equivalent,
} from "../../src/matching/engine";
import type { Settings, Track } from "../../src/domain/model";
export const settings: Settings = {
  auto: true,
  threshold: 80,
  duplicates: true,
  locale: "en",
  minimumArtist: 75,
  margin: 8,
  playlist: "P".repeat(22),
};
export const track: Track = {
  id: "a",
  uri: "spotify:track:a",
  title: "Northern Lights",
  artists: ["Example Artist"],
  durationMs: 240000,
  available: true,
};
describe("normalization and metadata", () => {
  it.each([
    ["Beyoncé", "beyonce"],
    ["İSTANBUL", "istanbul"],
    ["علي كاظم", "علی کاظم"],
    ["01 - Song [320kbps].mp3", "song"],
    ["Straße", "strasse"],
  ])("normalizes %s", (a, b) => expect(normalize(a)).toBe(b));
  it.each([
    "Artist - Track.mp3",
    "01 - Artist - Track.mp3",
    "Artist - Track [320kbps].mp3",
    "Artist - Track (Official Audio).mp3",
    "Artist - Track [Telegram Channel].mp3",
  ])("parses %s", (name) =>
    expect(parseFilename(name)).toEqual({
      artist: "Artist",
      title: "Track",
      ambiguous: false,
    }),
  );
  it("asks about underscore boundaries", () =>
    expect(parseFilename("Artist_Track.mp3").ambiguous).toBe(true));
  it("retains meaningful versions", () =>
    expect(normalize("Song (Live Part 2)")).toContain("live part 2"));
});
describe("scores and policy", () => {
  it("detects Persian and Arabic numbered parts", () => {
    expect(versions("آهنگ بخش ۲")).toEqual(["part 2"]);
    expect(versions("Song Part ١")).toEqual(["part 1"]);
    expect(
      decide(
        rank({ title: "آهنگ بخش ۱", artist: "هنرمند" }, [
          { ...track, title: "آهنگ بخش ۲", artists: ["هنرمند"] },
        ]),
        settings,
      ),
    ).toBe("review");
  });
  it("typos tolerate edit distance", () =>
    expect(similarity("Northern Lghts", "Northern Lights")).toBeGreaterThan(
      90,
    ));
  it("weak substrings are weak", () =>
    expect(similarity("Love", "Love in a distant country")).toBeLessThan(40));
  it("supports reordered artist collections", () =>
    expect(artistSimilarity("Beta feat. Alpha", ["Alpha", "Beta"])).toBe(100));
  it("preserves punctuation in band names", () =>
    expect(artistSimilarity("Earth, Wind & Fire", ["Earth, Wind & Fire"])).toBe(
      100,
    ));
  it.each([
    [0, 100],
    [2, 100],
    [3, 90],
    [5, 90],
    [6, 70],
    [10, 70],
    [11, 40],
    [20, 40],
    [21, 0],
  ])("duration delta %s", (d, s) =>
    expect(durationSimilarity(240, 240000 + d * 1000)).toBe(s),
  );
  it("missing duration is null", () =>
    expect(durationSimilarity(undefined, 240000)).toBeNull());
  it("short duration relative mismatch", () =>
    expect(durationSimilarity(4, 6000)).toBe(40));
  it("versions identify numbered parts", () =>
    expect(versions("Song - Part 2 (Live)")).toEqual(["live", "part 2"]));
  it("auto adds exact match", () =>
    expect(
      decide(
        rank(
          {
            title: track.title,
            artist: "Example Artist",
            durationSeconds: 240,
          },
          [track],
        ),
        settings,
      ),
    ).toBe("auto"));
  it("requires artist", () =>
    expect(decide(rank({ title: track.title }, [track]), settings)).toBe(
      "review",
    ));
  it("requires confirmed availability", () =>
    expect(
      decide(
        rank({ title: track.title, artist: "Example Artist" }, [
          { ...track, available: undefined },
        ]),
        settings,
      ),
    ).toBe("review"));
  it("missing duration renormalizes weights explicitly", () => {
    const c = rank({ title: track.title, artist: "Example Artist" }, [
      track,
    ])[0]!;
    expect(c.durationScore).toBeNull();
    expect(c.missingFields).toContain("duration");
    expect(c.finalScore).toBe(100);
  });
  it("blocks live mismatch", () =>
    expect(
      decide(
        rank({ title: "Northern Lights (Live)", artist: "Example Artist" }, [
          track,
        ]),
        settings,
      ),
    ).toBe("review"));
  it("blocks differently named remixes", () =>
    expect(
      decide(
        rank(
          { title: "Northern Lights (Alice Remix)", artist: "Example Artist" },
          [{ ...track, title: "Northern Lights (Bob Remix)" }],
        ),
        settings,
      ),
    ).toBe("review"));
  it("blocks numbered-part mismatch", () =>
    expect(
      decide(
        rank({ title: "Untouchable Part 1", artist: "Band" }, [
          { ...track, title: "Untouchable Part 2", artists: ["Band"] },
        ]),
        settings,
      ),
    ).toBe("review"));
  it("requires margin between distinct recordings", () =>
    expect(
      decide(
        rank({ title: track.title, artist: "Example Artist" }, [
          track,
          { ...track, id: "b" },
        ]),
        settings,
      ),
    ).toBe("review"));
  it("groups only corroborated recordings", () => {
    const a = { ...track, isrc: "recording" };
    expect(equivalent(a, { ...a, id: "b" })).toBe(true);
    expect(equivalent(track, { ...track, id: "b" })).toBe(false);
  });
  it("threshold boundary is inclusive", () => {
    const cs = rank({ title: track.title, artist: "Example Artist" }, [track]);
    cs[0]!.finalScore = 80;
    expect(decide(cs, settings)).toBe("auto");
    cs[0]!.finalScore = 79.99;
    expect(decide(cs, settings)).toBe("review");
  });
  it("disabled auto and absent playlist require review", () => {
    const c = rank({ title: track.title, artist: "Example Artist" }, [track]);
    expect(decide(c, { ...settings, auto: false })).toBe("review");
    expect(decide(c, { ...settings, playlist: undefined })).toBe("review");
  });
  it("empty results do not select", () =>
    expect(decide([], settings)).toBe("none"));
  it("deduplicates IDs and breaks ties deterministically", () =>
    expect(
      rank({ title: track.title }, [{ ...track, id: "b" }, track, track]).map(
        (c) => c.id,
      ),
    ).toEqual(["a", "b"]));
});
