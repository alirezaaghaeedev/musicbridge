// NFKD + mark removal is a pragmatic case-fold equivalent, not transliteration.
export function normalize(value: string): string {
  return value
    .slice(0, 256)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ς/g, "σ")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[۰-۹٠-٩]/g, (digit) =>
      String(digit.charCodeAt(0) - (digit >= "۰" ? 0x6f0 : 0x660)),
    )
    .replace(/\.(mp3|m4a|flac|wav|ogg|aac|opus)$/i, "")
    .replace(/^\s*\d{1,3}\s*[-_.]\s*/, "")
    .replace(/\[\s*(?:\d{2,4}\s*kbps|telegram[^\]]*|@[^\]]*)\]/gi, " ")
    .replace(/\b(?:128|192|256|320)\s*kbps\b/gi, " ")
    .replace(/\(?official (?:audio|video)\)?/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
export function parseFilename(name: string): {
  title?: string;
  artist?: string;
  ambiguous: boolean;
} {
  const clean = name
    .slice(0, 256)
    .replace(/\.(mp3|m4a|flac|wav|ogg|aac|opus)$/i, "")
    .replace(/^\s*\d{1,3}\s*[-_.]\s*/, "")
    .replace(/\[(?:\d{2,4}\s*kbps|Telegram[^\]]*|@[^\]]*)\]/gi, "")
    .replace(/\(Official (?:Audio|Video)\)/gi, "")
    .trim();
  const parts = clean.split(/\s+-\s+/);
  if (parts.length === 2 && parts.every((p) => p.trim()))
    return {
      artist: parts[0]!.trim(),
      title: parts[1]!.trim(),
      ambiguous: false,
    };
  // Underscores and multiple hyphens have no reliable artist/title boundary.
  return { title: clean.replace(/_/g, " "), ambiguous: true };
}
export function artistParts(value: string): string[] {
  return value
    .split(/\s+(?:feat\.?|ft\.?|featuring|&)\s+|\s*;\s*/i)
    .map(normalize)
    .filter(Boolean);
}
