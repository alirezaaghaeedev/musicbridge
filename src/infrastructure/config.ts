import { z } from "zod";
export interface Bindings {
  DB: D1Database;
  MUSIC_QUEUE: Queue<{ jobId: string }>;
  [key: string]: unknown;
}
const bool = z.enum(["true", "false"]).transform((x) => x === "true");
const schema = z
  .object({
    APP_NAME: z.string().default("MusicBridge"),
    APP_ENV: z.enum(["development", "production"]).default("development"),
    APP_MODE: z.enum(["mock", "live"]).default("mock"),
    PUBLIC_BASE_URL: z.string().url().default("http://127.0.0.1:8787"),
    SPOTIFY_CLIENT_ID: z.string().default(""),
    SPOTIFY_CLIENT_SECRET: z.string().default(""),
    SPOTIFY_REDIRECT_URI: z.string().default(""),
    TELEGRAM_BOT_TOKEN: z.string().default(""),
    TELEGRAM_WEBHOOK_SECRET: z.string().min(16),
    TOKEN_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
    BOT_ACCESS_MODE: z.literal("private").default("private"),
    ALLOWED_TELEGRAM_USER_IDS: z
      .string()
      .min(1)
      .refine((x) => x.split(",").every((id) => /^\d+$/.test(id.trim()))),
    DEFAULT_LOCALE: z.enum(["fa", "en"]).default("fa"),
    DEFAULT_AUTO_ADD_ENABLED: bool.default(true),
    DEFAULT_MATCH_THRESHOLD: z.coerce.number().min(60).max(100).default(80),
    DEFAULT_MINIMUM_ARTIST_SCORE: z.coerce
      .number()
      .min(75)
      .max(100)
      .default(75),
    DEFAULT_MINIMUM_CANDIDATE_MARGIN: z.coerce
      .number()
      .min(8)
      .max(100)
      .default(8),
    REQUEST_TIMEOUT_MS: z.coerce.number().min(100).max(20000).default(8000),
    SEARCH_MAX_REQUESTS: z.coerce.number().int().min(1).max(4).default(4),
    PLAYLIST_MAX_PAGES: z.coerce.number().int().min(1).max(8).default(5),
    RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    PROCESSING_ENABLED: bool.default(true),
    LOG_LEVEL: z.enum(["info", "error", "silent"]).default("info"),
  })
  .superRefine((c, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const base = new URL(c.PUBLIC_BASE_URL);
    if (
      c.APP_ENV === "production" &&
      (c.APP_MODE !== "live" || base.protocol !== "https:")
    )
      fail("Production requires live mode and HTTPS");
    if (c.APP_MODE === "live") {
      if (
        !c.SPOTIFY_CLIENT_ID ||
        !c.SPOTIFY_CLIENT_SECRET ||
        !/^\d+:[\w-]+$/.test(c.TELEGRAM_BOT_TOKEN)
      )
        fail("Live credentials required");
      if (
        c.SPOTIFY_REDIRECT_URI !==
        `${c.PUBLIC_BASE_URL.replace(/\/$/, "")}/oauth/callback`
      )
        fail("Redirect must exactly equal public callback URL");
      if (
        base.protocol !== "https:" &&
        !["127.0.0.1", "[::1]"].includes(base.hostname)
      )
        fail("HTTPS or loopback IP required");
    }
  });
export type Config = z.infer<typeof schema>;
const configKeys = Object.keys(schema.shape);
let lastValidated: { values: unknown[]; value: Config } | undefined;
export function config(env: Record<string, unknown>): Config {
  // Compare every schema input, including secrets and pause/access flags. Never
  // rely on env object identity: bindings can change between invocations.
  const values = configKeys.map((key) => env[key]);
  const cacheable = values.every(
    (value) =>
      value === undefined ||
      ["string", "number", "boolean"].includes(typeof value),
  );
  if (
    cacheable &&
    lastValidated &&
    values.every((value, index) =>
      Object.is(value, lastValidated!.values[index]),
    )
  )
    return lastValidated.value;
  const value = Object.freeze(schema.parse(env));
  if (cacheable) lastValidated = { values, value };
  return value;
}
export function defaults(c: Config) {
  return {
    auto: c.DEFAULT_AUTO_ADD_ENABLED,
    threshold: c.DEFAULT_MATCH_THRESHOLD,
    duplicates: true,
    locale: c.DEFAULT_LOCALE,
    minimumArtist: c.DEFAULT_MINIMUM_ARTIST_SCORE,
    margin: c.DEFAULT_MINIMUM_CANDIDATE_MARGIN,
  };
}
