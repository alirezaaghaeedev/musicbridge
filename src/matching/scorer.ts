import { normalize, artistParts } from "./normalizer";
export const MATCH_LIMITS = {
  cells: 65536,
  comparisons: 256,
  profiles: 256,
  characters: 256,
  artists: 16,
} as const;
// One scorer is scoped to one submission, including all progressive search stages.
export class Scorer {
  limited = false;
  cells = 0;
  comparisons = 0;
  private texts = new Map<string, string>();
  private scores = new Map<string, number>();
  private sorted = new Map<string, string>();
  private artistScores = new Map<string, number>();
  text(raw: string) {
    if (raw.length > MATCH_LIMITS.characters) this.limited = true;
    const input = raw.slice(0, MATCH_LIMITS.characters);
    const cached = this.texts.get(input);
    if (cached !== undefined) return cached;
    if (this.texts.size >= MATCH_LIMITS.profiles) {
      this.limited = true;
      return "";
    }
    const n = normalize(input);
    if (n.length > MATCH_LIMITS.characters) this.limited = true;
    const result = n.slice(0, MATCH_LIMITS.characters);
    this.texts.set(input, result);
    return result;
  }
  private sort(text: string) {
    let s = this.sorted.get(text);
    if (s === undefined) {
      s = text.split(" ").sort().join(" ");
      this.sorted.set(text, s);
    }
    return s;
  }
  private distanceScore(a: string, b: string) {
    if (a === b) return 100;
    if (!a || !b) return 0;
    const key = a < b ? `${a}\0${b}` : `${b}\0${a}`;
    const cached = this.scores.get(key);
    if (cached !== undefined) return cached;
    if (this.comparisons >= MATCH_LIMITS.comparisons) {
      this.limited = true;
      return 0;
    }
    this.comparisons++;
    const length = Math.max(a.length, b.length);
    // Equal prefixes/suffixes do not affect Levenshtein distance. Keep original denominator.
    let start = 0;
    while (start < Math.min(a.length, b.length) && a[start] === b[start])
      start++;
    let endA = a.length,
      endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
      endA--;
      endB--;
    }
    let x = a.slice(start, endA),
      y = b.slice(start, endB);
    let distance: number;
    if (!x.length || !y.length) distance = Math.max(x.length, y.length);
    else {
      const cost = x.length * y.length;
      if (this.cells + cost > MATCH_LIMITS.cells) {
        this.limited = true;
        return 0;
      }
      this.cells += cost;
      if (y.length > x.length) [x, y] = [y, x];
      let previous = new Uint16Array(y.length + 1),
        next = new Uint16Array(y.length + 1);
      for (let j = 0; j <= y.length; j++) previous[j] = j;
      for (let i = 1; i <= x.length; i++) {
        next[0] = i;
        const code = x.charCodeAt(i - 1);
        for (let j = 1; j <= y.length; j++)
          next[j] = Math.min(
            next[j - 1]! + 1,
            previous[j]! + 1,
            previous[j - 1]! + (code === y.charCodeAt(j - 1) ? 0 : 1),
          );
        [previous, next] = [next, previous];
      }
      distance = previous[y.length]!;
    }
    const score = 100 * (1 - distance / length);
    this.scores.set(key, score);
    return score;
  }
  similarity(a: string, b: string) {
    if (this.limited) return 0;
    a = this.text(a);
    b = this.text(b);
    if (!a || !b) return 0;
    if (a === b) return 100;
    const direct = this.distanceScore(a, b);
    if (direct === 100) return direct;
    return Math.max(direct, this.distanceScore(this.sort(a), this.sort(b)));
  }
  artist(artist: string, artists: string[]) {
    if (this.limited) return 0;
    if (artists.length > MATCH_LIMITS.artists) {
      this.limited = true;
      return 0;
    }
    const raw = artist.slice(0, MATCH_LIMITS.characters);
    if (raw.length !== artist.length) this.limited = true;
    const names = artists.slice(0, MATCH_LIMITS.artists);
    if (names.some((name) => name.length > MATCH_LIMITS.characters))
      this.limited = true;
    const artistKey = JSON.stringify([raw, names]);
    const cached = this.artistScores.get(artistKey);
    if (cached !== undefined) return cached;
    const joined = names.join(" ");
    const direct =
      joined.length <= MATCH_LIMITS.characters
        ? this.similarity(raw, joined)
        : 0;
    const expected = artistParts(raw);
    const actual = names.flatMap((name) =>
      artistParts(name.slice(0, MATCH_LIMITS.characters)),
    );
    if (
      actual.length > MATCH_LIMITS.artists ||
      expected.length > MATCH_LIMITS.artists
    )
      this.limited = true;
    const target = actual.slice(0, MATCH_LIMITS.artists);
    if (!target.length) return 0;
    const comma = raw.split(/\s*,\s*/).map((name) => this.text(name));
    const parts = (
      comma.length === target.length && comma.length > 1 ? comma : expected
    ).slice(0, MATCH_LIMITS.artists);
    if (!parts.length) return 0;
    // The symmetric pair cache avoids evaluating every pair again in the reverse direction.
    const mean = (a: string[], b: string[]) =>
      a.reduce(
        (sum, x) => sum + Math.max(...b.map((y) => this.similarity(x, y))),
        0,
      ) / a.length;
    const result = Math.max(
      direct,
      Math.min(mean(parts, target), mean(target, parts)),
    );
    if (this.artistScores.size < 40) this.artistScores.set(artistKey, result);
    return result;
  }
  get diagnostics() {
    return {
      cells: this.cells,
      comparisons: this.comparisons,
      profiles: this.texts.size,
      limited: this.limited,
    };
  }
}
