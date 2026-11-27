import { it, expect, vi } from "vitest";
import { SpotifyClient, parseTrack } from "../../src/integrations/spotify";
import { TelegramClient } from "../../src/integrations/telegram";
import { config } from "../../src/infrastructure/config";
import { testConfig } from "../helpers";
import { ProviderError } from "../../src/integrations/providers";
const c = config(testConfig);
const track = {
  id: "a",
  uri: "spotify:track:a",
  name: "Song",
  artists: [{ name: "Artist" }],
  duration_ms: 200000,
  is_playable: true,
};
it.each(["exchange", "refresh"] as const)(
  "retains provider-granted scopes during %s",
  async (operation) => {
    const client = new SpotifyClient(
      c,
      async () =>
        new Response(
          JSON.stringify({
            access_token: "synthetic-access",
            refresh_token: "synthetic-refresh",
            expires_in: 3600,
            scope: "playlist-read-private playlist-modify-private",
          }),
        ),
    );
    const result = await client[operation]("synthetic-input");
    expect(result.scope).toBe("playlist-read-private playlist-modify-private");
  },
);
it("stops playlist pagination after the first twenty owned choices, preserving order", async () => {
  const lists = Array.from({ length: 50 }, (_, i) => ({
    id: String(i).padStart(22, "P"),
    name: `Synthetic ${i}`,
    owner: { id: i < 35 ? "other" : "owner" },
  }));
  const more = Array.from({ length: 20 }, (_, i) => ({
    id: String(i + 50).padStart(22, "P"),
    name: `Synthetic ${i + 50}`,
    owner: { id: "owner" },
  }));
  const http = transport([
    { items: lists, next: "more" },
    { items: more, next: "more" },
  ]);
  const result = await new SpotifyClient(c, http).playlists(
    "synthetic",
    "owner",
    20,
  );
  expect(result.map((p) => p.id)).toEqual(
    [...lists, ...more]
      .filter((p) => p.owner.id === "owner")
      .slice(0, 20)
      .map((p) => p.id),
  );
  expect(http).toHaveBeenCalledTimes(2);
});
it("does not fetch a second playlist page when the visible owned choices are complete", async () => {
  const http = transport([
    {
      items: Array.from({ length: 30 }, (_, i) => ({
        id: String(i).padStart(22, "P"),
        name: `Synthetic ${i}`,
        owner: { id: "owner" },
      })),
      next: "more",
    },
  ]);
  expect(
    await new SpotifyClient(c, http).playlists("synthetic", "owner", 20),
  ).toHaveLength(20);
  expect(http).toHaveBeenCalledTimes(1);
});
const transport = (responses: unknown[]) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify(responses.shift()), {
        headers: { "Content-Type": "application/json" },
      }),
  );
it("accepts removed optional Spotify fields and null album/duration", () => {
  expect(
    parseTrack({ ...track, album: null, duration_ms: null }),
  ).toMatchObject({ title: "Song", available: true, durationMs: undefined });
  expect(parseTrack({ ...track, is_playable: undefined })!.available).toBe(
    undefined,
  );
  expect(parseTrack(null)).toBeNull();
  expect(parseTrack({ id: "bad" })).toBeNull();
});
it.each([
  [true, true],
  [false, false],
  [undefined, undefined],
])("preserves availability state %s", (playable, expected) => {
  expect(parseTrack({ ...track, is_playable: playable })!.available).toBe(
    expected,
  );
});
it("restrictions override a playable flag", () =>
  expect(
    parseTrack({ ...track, restrictions: { reason: "market" } })!.available,
  ).toBe(false));
it("quota exhaustion preserves code and Retry-After but is not automatically retried", async () => {
  const client = new SpotifyClient(
    c,
    async () =>
      new Response(
        JSON.stringify({
          error: {
            status: 429,
            reason: "QUOTA_EXCEEDED",
            message: "sensitive response must not be retained",
          },
        }),
        { status: 429, headers: { "Retry-After": "600" } },
      ),
  );
  try {
    await client.search("synthetic", "song");
    throw new Error("Expected rejection");
  } catch (e) {
    expect(e).toMatchObject({
      code: "QUOTA_EXCEEDED",
      providerCode: "QUOTA_EXCEEDED",
      status: 429,
      retryAfter: 600,
      retryable: false,
    });
    expect(JSON.stringify(e)).not.toContain("sensitive response");
  }
});
it.each([
  "{",
  "x".repeat(5000),
  JSON.stringify({ error: { reason: "untrusted-token-looking-text" } }),
])(
  "handles malformed/oversized/unrecognized provider errors safely",
  async (body) => {
    const client = new SpotifyClient(
      c,
      async () =>
        new Response(body, {
          status: 429,
          headers: { "Retry-After": "invalid" },
        }),
    );
    await expect(client.search("synthetic", "song")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      retryAfter: 0,
      retryable: true,
      providerCode: undefined,
    });
  },
);
it("uses current item wrapper and bounded offset pagination without following arbitrary next URLs", async () => {
  const urls: string[] = [];
  const responses = [
    { items: [{ item: null }], next: "https://evil.invalid/" },
    { items: [{ item: track }], next: null },
  ];
  const http = vi.fn(async (url: RequestInfo | URL) => {
    urls.push(String(url));
    return new Response(JSON.stringify(responses.shift()));
  });
  const client = new SpotifyClient(c, http);
  expect(await client.contains("synthetic", "P".repeat(22), "a")).toBe(true);
  expect(http.mock.calls).toHaveLength(2);
  expect(urls[0]).toContain("limit=50&offset=0");
  expect(urls[1]).toContain("limit=50&offset=50");
  expect(
    urls.every((url) => url.startsWith("https://api.spotify.com/v1/")),
  ).toBe(true);
});
it("fails closed on incomplete playlist scan", async () => {
  const http = transport([{ items: [], next: "more" }]);
  const client = new SpotifyClient({ ...c, PLAYLIST_MAX_PAGES: 1 }, http);
  await expect(
    client.contains("synthetic", "P".repeat(22), "a"),
  ).rejects.toMatchObject({ code: "PLAYLIST_SCAN_LIMIT" });
});
it("search uses 10 result limit and ignores malformed/null tracks", async () => {
  const calls: string[] = [];
  const client = new SpotifyClient(c, async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ tracks: { items: [null, track] } }));
  });
  expect(await client.search("synthetic", "track:Song")).toHaveLength(1);
  expect(calls[0]).toContain("limit=10");
});
it("mutates /items with one URI and requires snapshot confirmation", async () => {
  let body = "";
  let url = "";
  const client = new SpotifyClient(c, async (u, init) => {
    url = String(u);
    body = String(init?.body);
    return new Response(JSON.stringify({ snapshot_id: "confirmed" }));
  });
  expect(await client.add("synthetic", "P".repeat(22), "spotify:track:a")).toBe(
    "confirmed",
  );
  expect(url).toContain("/items");
  expect(JSON.parse(body)).toEqual({ uris: ["spotify:track:a"] });
  const invalid = new SpotifyClient(c, transport([{}]));
  await expect(
    invalid.add("synthetic", "P".repeat(22), "spotify:track:a"),
  ).rejects.toMatchObject({ uncertain: true });
});
it("refresh preserves existing token when omitted and accepts rotation", async () => {
  const client = new SpotifyClient(
    c,
    transport([
      { access_token: "new", expires_in: 3600 },
      { access_token: "newer", refresh_token: "rotated", expires_in: 3600 },
    ]),
  );
  expect((await client.refresh("original")).refresh_token).toBe("original");
  expect((await client.refresh("original")).refresh_token).toBe("rotated");
});
it.each([400, 401, 403, 404, 429, 500])(
  "classifies provider HTTP %s",
  async (status) => {
    const client = new SpotifyClient(
      c,
      async () =>
        new Response("{}", { status, headers: { "Retry-After": "120" } }),
    );
    try {
      await client.search("synthetic", "song");
      throw new Error("Expected rejection");
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderError);
      expect((e as ProviderError).status).toBe(status);
      expect((e as ProviderError).retryable).toBe(
        status === 429 || status >= 500,
      );
      if (status === 429) expect((e as ProviderError).retryAfter).toBe(120);
    }
  },
);
it("network failure on mutation is uncertain", async () => {
  const client = new SpotifyClient(c, async () => {
    throw new Error("timeout");
  });
  await expect(
    client.add("synthetic", "P".repeat(22), "spotify:track:a"),
  ).rejects.toMatchObject({ uncertain: true });
});
it("Telegram sends plain text without HTML parsing and acknowledges callbacks", async () => {
  const bodies: Record<string, unknown>[] = [];
  const client = new TelegramClient("synthetic", 100, async (_u, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response('{"ok":true,"result":{}}');
  });
  await client.send("123", "<script> & _untrusted_");
  await client.answer("cb");
  expect(bodies[0]!.text).toBe("<script> & _untrusted_");
  expect(bodies[0]!.parse_mode).toBeUndefined();
  expect(bodies[1]!.callback_query_id).toBe("cb");
});
it("uploads the official attribution image with a bounded plain-text caption", async () => {
  let method = "",
    payload: FormData | undefined;
  const client = new TelegramClient("synthetic", 100, async (url, init) => {
    method = String(url);
    payload = init?.body as FormData;
    return new Response('{"ok":true}');
  });
  await client.send(
    "123",
    "Spotify\nhttps://open.spotify.com/track/a",
    { inline_keyboard: [] },
    true,
  );
  expect(method.endsWith("/sendPhoto")).toBe(true);
  expect(payload!.get("caption")).toContain("Spotify");
  const file = payload!.get("photo") as File;
  expect(file.type).toBe("image/png");
  expect(file.size).toBeGreaterThan(1000);
  await expect(
    client.send("123", "x".repeat(1025), undefined, true),
  ).rejects.toThrow("caption");
});
