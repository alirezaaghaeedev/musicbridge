import type { Metadata, Track } from "../../src/domain/model";
export interface Scenario {
  name: string;
  input: Metadata;
  tracks: Track[];
  expected: "auto" | "review" | "none";
  safety: boolean;
  correctId?: string;
}
const pairs = [
  ["Northern Lights", "Example Artist"],
  ["دریای آبی", "هنرمند نمونه"],
  ["ليلة جميلة", "فنان عربي"],
  ["İstanbul Rüyası", "Örnek Şarkıcı"],
  ["Café Étoile", "Émilie"],
  ["東京の夜", "架空の歌手"],
  ["Новый день", "Пример"],
  ["Mañana", "Artista Ficticio"],
  ["Über den Wolken", "Beispiel"],
  ["별빛", "가상 가수"],
];
const make = (title: string, artist: string, id = "a"): Track => ({
  id,
  uri: `spotify:track:${id}`,
  title,
  artists: [artist],
  durationMs: 240000,
  available: true,
});
export const scenarios: Scenario[] = [];
for (const [title, artist] of pairs) {
  scenarios.push({
    name: `Exact ${title}`,
    input: { title, artist, durationSeconds: 240 },
    tracks: [make(title!, artist!)],
    expected: "auto",
    safety: false,
    correctId: "a",
  });
  scenarios.push({
    name: `Missing artist ${title}`,
    input: { title, durationSeconds: 240 },
    tracks: [make(title!, artist!)],
    expected: "review",
    safety: true,
  });
  scenarios.push({
    name: `Wrong artist ${title}`,
    input: {
      title,
      artist: "Completely unrelated performer",
      durationSeconds: 240,
    },
    tracks: [make(title!, artist!)],
    expected: "review",
    safety: true,
  });
  scenarios.push({
    name: `Live mismatch ${title}`,
    input: { title, artist, durationSeconds: 240 },
    tracks: [make(`${title} (Live)`, artist!)],
    expected: "review",
    safety: true,
  });
  scenarios.push({
    name: `Ambiguous recording ${title}`,
    input: { title, artist, durationSeconds: 240 },
    tracks: [make(title!, artist!, "a"), make(title!, artist!, "b")],
    expected: "review",
    safety: true,
  });
  scenarios.push({
    name: `No results ${title}`,
    input: { title, artist },
    tracks: [],
    expected: "none",
    safety: true,
  });
}
scenarios.push(
  {
    name: "Small title typo",
    input: { title: "Northern Lghts", artist: "Example Artist" },
    tracks: [make("Northern Lights", "Example Artist")],
    expected: "auto",
    safety: false,
    correctId: "a",
  },
  {
    name: "Numbered part negative",
    input: { title: "Untouchable Part 1", artist: "Band" },
    tracks: [make("Untouchable Part 2", "Band")],
    expected: "review",
    safety: true,
  },
  {
    name: "Missing duration",
    input: { title: "Northern Lights", artist: "Example Artist" },
    tracks: [make("Northern Lights", "Example Artist")],
    expected: "auto",
    safety: false,
    correctId: "a",
  },
  {
    name: "Weak substring",
    input: { title: "Love", artist: "Band" },
    tracks: [make("Love in a distant country", "Band")],
    expected: "none",
    safety: true,
  },
);
