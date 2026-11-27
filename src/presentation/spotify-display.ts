import type { MatchCandidate, Settings, Track } from "../domain/model";
export const short = (text: string, max: number) =>
  text.length <= max
    ? text
    : text.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, "") + "…";
export const trackUrl = (id: string) =>
  `https://open.spotify.com/track/${encodeURIComponent(id)}`;
export const playlistUrl = (id: string) =>
  `https://open.spotify.com/playlist/${encodeURIComponent(id)}`;
export function candidateLabel(c: MatchCandidate, index: number) {
  return `${index + 1}. ${short(c.title, 40)} — ${short(c.artists.join(", "), 40)}\n${short(c.album ?? "", 20)} · ${c.durationMs === undefined ? "?" : Math.round(c.durationMs / 1000)}s · ${c.finalScore}/100${c.versionMismatch ? " ⚠" : ""}\nSpotify: ${c.available === true ? "✓" : c.available === false ? "unavailable" : "unknown"}`;
}
export function operationCaption(
  status: string,
  t: Track,
  score: number,
  s: Settings,
) {
  return `${status}\nSpotify\n${short(t.title, 120)}\n${short(t.artists.join(", "), 120)}\n${short(t.album ?? "", 80)}\n${t.durationMs === undefined ? "?" : Math.round(t.durationMs / 1000)}s · ${score}/100\n${short(s.playlistName ?? "", 80)}\n${trackUrl(t.id)}\n${s.playlist ? playlistUrl(s.playlist) : ""}`;
}
