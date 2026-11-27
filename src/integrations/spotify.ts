import { z } from "zod";
import type { Config } from "../infrastructure/config";
import type { Spotify, Tokens, Playlist } from "./providers";
import { ProviderError } from "./providers";
import { request, type Transport } from "./http";
import type { Track } from "../domain/model";
export const trackSchema = z.object({
  id: z.string(),
  uri: z.string().regex(/^spotify:track:[A-Za-z0-9]+$/),
  name: z.string().max(256),
  artists: z.array(z.object({ name: z.string().max(256) })).max(30),
  album: z.object({ name: z.string() }).nullish(),
  duration_ms: z.number().nonnegative().nullish(),
  is_playable: z.boolean().optional(),
  restrictions: z.object({ reason: z.string() }).optional(),
  external_ids: z.object({ isrc: z.string().optional() }).optional(),
});
export function parseTrack(value: unknown): Track | null {
  const r = trackSchema.safeParse(value);
  if (!r.success) return null;
  const t = r.data;
  return {
    id: t.id,
    uri: t.uri,
    title: t.name,
    artists: t.artists.map((a) => a.name),
    album: t.album?.name,
    durationMs: t.duration_ms ?? undefined,
    available:
      t.restrictions || t.is_playable === false
        ? false
        : t.is_playable === true
          ? true
          : undefined,
    isrc: t.external_ids?.isrc,
  };
}
const playlistSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.object({ id: z.string() }),
  collaborative: z.boolean().optional(),
});
const parsePlaylist = (v: unknown): Playlist => {
  const p = playlistSchema.parse(v);
  return {
    id: p.id,
    name: p.name,
    ownerId: p.owner.id,
    collaborative: p.collaborative ?? false,
  };
};
const scopes = [
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-private",
  "playlist-modify-public",
];
export class SpotifyClient implements Spotify {
  constructor(
    private c: Config,
    private transport: Transport = fetch,
  ) {}
  authorize(state: string) {
    const url = new URL("https://accounts.spotify.com/authorize");
    url.search = new URLSearchParams({
      client_id: this.c.SPOTIFY_CLIENT_ID,
      response_type: "code",
      redirect_uri: this.c.SPOTIFY_REDIRECT_URI,
      state,
      scope: scopes.join(" "),
    }).toString();
    return url.toString();
  }
  private async token(
    params: Record<string, string>,
    old?: string,
  ): Promise<Tokens> {
    const raw = await request(
      this.transport,
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${this.c.SPOTIFY_CLIENT_ID}:${this.c.SPOTIFY_CLIENT_SECRET}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params),
      },
      this.c.REQUEST_TIMEOUT_MS,
    );
    const t = z
      .object({
        access_token: z.string(),
        refresh_token: z.string().optional(),
        expires_in: z.number().positive(),
        scope: z.string().max(4096).optional(),
      })
      .parse(raw);
    if (!t.refresh_token && !old)
      throw new ProviderError("MISSING_REFRESH_TOKEN", 400);
    return { ...t, refresh_token: t.refresh_token ?? old! };
  }
  exchange(code: string) {
    return this.token({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.c.SPOTIFY_REDIRECT_URI,
    });
  }
  refresh(token: string) {
    return this.token(
      { grant_type: "refresh_token", refresh_token: token },
      token,
    );
  }
  async api(
    token: string,
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<unknown> {
    return request(
      this.transport,
      `https://api.spotify.com/v1${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      this.c.REQUEST_TIMEOUT_MS,
      method === "POST",
    );
  }
  async identity(token: string) {
    return z.object({ id: z.string() }).parse(await this.api(token, "/me"));
  }
  async search(token: string, query: string) {
    const raw = z
      .object({ tracks: z.object({ items: z.array(z.unknown()) }) })
      .parse(
        await this.api(
          token,
          `/search?${new URLSearchParams({ q: query, type: "track", limit: "10" })}`,
        ),
      );
    return raw.tracks.items
      .map(parseTrack)
      .filter((t): t is Track => t !== null);
  }
  async playlists(token: string, ownerId?: string, limit?: number) {
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > 20)
    )
      throw new Error("Playlist display limit");
    const out: Playlist[] = [];
    for (let page = 0; page < 3; page++) {
      const raw = z
        .object({ items: z.array(z.unknown()), next: z.string().nullable() })
        .parse(
          await this.api(token, `/me/playlists?limit=50&offset=${page * 50}`),
        );
      for (const p of raw.items) {
        const parsed = playlistSchema.safeParse(p);
        if (
          parsed.success &&
          (ownerId === undefined || parsed.data.owner.id === ownerId)
        ) {
          out.push(parsePlaylist(parsed.data));
          if (limit !== undefined && out.length >= limit) return out;
        }
      }
      if (!raw.next) break;
    }
    return out;
  }
  async playlist(token: string, id: string) {
    return parsePlaylist(
      await this.api(token, `/playlists/${encodeURIComponent(id)}`),
    );
  }
  async contains(token: string, id: string, track: string) {
    for (let page = 0; page < this.c.PLAYLIST_MAX_PAGES; page++) {
      const raw = z
        .object({
          items: z.array(z.object({ item: z.unknown().nullable() })),
          next: z.string().nullable(),
        })
        .parse(
          await this.api(
            token,
            `/playlists/${encodeURIComponent(id)}/items?limit=50&offset=${page * 50}`,
          ),
        );
      if (
        raw.items.some((row) => {
          const t = parseTrack(row.item);
          return t?.id === track;
        })
      )
        return true;
      if (!raw.next) return false;
    }
    throw new ProviderError("PLAYLIST_SCAN_LIMIT", 400);
  }
  async add(token: string, id: string, uri: string) {
    const raw = await this.api(
      token,
      `/playlists/${encodeURIComponent(id)}/items`,
      "POST",
      { uris: [uri] },
    );
    const result = z.object({ snapshot_id: z.string().min(1) }).safeParse(raw);
    if (!result.success)
      throw new ProviderError("INVALID_MUTATION_RESPONSE", 502, 0, true);
    return result.data.snapshot_id;
  }
}
