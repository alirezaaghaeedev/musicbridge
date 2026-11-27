import { it, expect } from "vitest";
import { harness } from "../helpers";
import { ProviderError } from "../../src/integrations/providers";
import { syntheticTracks } from "../../src/integrations/mock";
import { decrypt, encrypt } from "../../src/infrastructure/security";
import type { Tokens } from "../../src/integrations/providers";
it("preserves a known scope grant inside encrypted storage when refresh omits scope", async () => {
  const h = await harness();
  try {
    await h.connect();
    const granted = "playlist-read-private playlist-modify-private";
    const encrypted = await encrypt(
      {
        access_token: "synthetic-access",
        refresh_token: "synthetic-refresh",
        expires_in: 3600,
        scope: granted,
      },
      h.runtime.c.TOKEN_ENCRYPTION_KEY,
      "123",
    );
    await h.runtime.db.run(
      "UPDATE spotify_connections SET encrypted=?,expires_at=0 WHERE user_id='123'",
      encrypted,
    );
    h.runtime.spotify.refresh = async () => ({
      access_token: "synthetic-new",
      refresh_token: "synthetic-rotated",
      expires_in: 3600,
    });
    await h.runtime.connections.get("123");
    const row = await h.runtime.db.one<{ encrypted: string }>(
      "SELECT encrypted FROM spotify_connections WHERE user_id='123'",
    );
    expect(row!.encrypted).not.toContain(granted);
    expect(
      (
        await decrypt<Tokens>(
          row!.encrypted,
          h.runtime.c.TOKEN_ENCRYPTION_KEY,
          "123",
        )
      ).scope,
    ).toBe(granted);
  } finally {
    await h.dispose();
  }
});
it("attributes playlist picker metadata with a Spotify link for every destination", async () => {
  const h = await harness();
  try {
    await h.connect();
    const choices = Array.from({ length: 20 }, (_, i) => ({
      id: "S".repeat(20) + String(i).padStart(2, "0"),
      name: `Synthetic playlist ${i}`,
      ownerId: "synthetic-owner",
      collaborative: false,
    }));
    h.runtime.spotify.playlists = async () => [
      { ...choices[0]!, ownerId: "synthetic-other-owner" },
      ...choices,
    ];
    await h.send("/playlist", 901000);
    const message = await h.runtime.db.one<{ text: string; keyboard: string }>(
      "SELECT text,keyboard FROM mock_messages ORDER BY id DESC LIMIT 1",
    );
    expect(message!.text).toContain("[Spotify logo]");
    const rows = JSON.parse(message!.keyboard).inline_keyboard as {
      callback_data?: string;
      url?: string;
    }[][];
    expect(rows).toHaveLength(20);
    const actions = await h.runtime.db.all<{
      id: string;
      user_id: string;
      expires_at: number;
      consumed: number;
      payload: string;
    }>("SELECT id,user_id,expires_at,consumed,payload FROM callback_actions");
    const indexed = new Map(actions.map((action) => [action.id, action]));
    for (const row of rows) {
      expect(row[0]!.callback_data).toBeTruthy();
      const action = indexed.get(row[0]!.callback_data!)!;
      expect(action.user_id).toBe("123");
      expect(action.consumed).toBe(0);
      expect(action.expires_at).toBeGreaterThan(Date.now());
      expect(action.expires_at).toBeLessThanOrEqual(Date.now() + 900000);
      expect(JSON.parse(action.payload).id).toBe(
        choices[rows.indexOf(row)]!.id,
      );
      expect(row[1]!.url).toMatch(
        /^https:\/\/open\.spotify\.com\/playlist\/[A-Za-z0-9]{22}$/,
      );
    }
    expect(
      await h.runtime.db.consume("456", rows[0]![0]!.callback_data!, 901001),
    ).toBeNull();
  } finally {
    await h.dispose();
  }
});
it("quota exhaustion stops after one attempt and sends an actionable notification", async () => {
  const h = await harness();
  try {
    await h.connect();
    h.runtime.spotify.search = async () => {
      throw new ProviderError(
        "QUOTA_EXCEEDED",
        429,
        600,
        false,
        "QUOTA_EXCEEDED",
      );
    };
    await h.audio("Northern Lights", "Example Artist", 10);
    expect(
      await h.runtime.db.one(
        "SELECT status,attempts FROM outbox_jobs WHERE id='music-update-10'",
      ),
    ).toMatchObject({ status: "dead", attempts: 1 });
    expect((await h.runtime.db.submission("update-10"))!.error).toBe(
      "QUOTA_EXCEEDED",
    );
    const rows = await h.runtime.db.all<{ text: string }>(
      "SELECT text FROM mock_messages",
    );
    expect(rows.some((r) => r.text.includes("quota is exhausted"))).toBe(true);
  } finally {
    await h.dispose();
  }
});
it.each([false, undefined])(
  "unknown/unavailable candidates are reviewable through Spotify links but cannot be selected (%s)",
  async (available) => {
    const h = await harness();
    try {
      await h.connect();
      h.runtime.spotify.search = async () => [
        { ...syntheticTracks[0]!, available },
      ];
      await h.audio("Northern Lights", "Example Artist", 10);
      expect((await h.runtime.db.submission("update-10"))!.state).toBe(
        "REVIEW_REQUIRED",
      );
      const message = await h.runtime.db.one<{
        text: string;
        keyboard: string;
      }>("SELECT * FROM mock_messages ORDER BY id DESC LIMIT 1");
      expect(message!.text).toContain("[Spotify logo]");
      const rows = JSON.parse(message!.keyboard).inline_keyboard as {
        text: string;
        url?: string;
        callback_data?: string;
      }[][];
      expect(
        rows
          .flat()
          .some((b) => b.url?.startsWith("https://open.spotify.com/track/")),
      ).toBe(true);
      expect(rows.flat().some((b) => b.text.startsWith("Choose"))).toBe(false);
      // Even a stale/forged server-side selection cannot bypass the worker's availability gate.
      const c = JSON.parse(
        (await h.runtime.db.one<{ value: string }>(
          "SELECT value FROM match_candidates WHERE submission_id='update-10'",
        ))!.value,
      )[0];
      await h.runtime.bot.requeue("123", "update-10", c);
      await h.drain();
      expect((await h.runtime.db.submission("update-10"))!.state).toBe(
        "FAILED",
      );
      expect(
        await h.runtime.db.all("SELECT * FROM mock_playlist_items"),
      ).toHaveLength(0);
    } finally {
      await h.dispose();
    }
  },
);
it("review captions stay within Telegram photo limits for five long candidates", async () => {
  const h = await harness();
  try {
    await h.connect();
    await h.send("/auto off", 3);
    h.runtime.spotify.search = async () =>
      Array.from({ length: 5 }, (_, i) => ({
        ...syntheticTracks[0]!,
        id: `candidate${i}`,
        title: "Northern Lights",
        artists: ["Example Artist"],
        album: "ب".repeat(256),
      }));
    await h.audio("Northern Lights", "Example Artist", 10);
    const msg = await h.runtime.db.one<{ text: string; keyboard: string }>(
      "SELECT * FROM mock_messages ORDER BY id DESC LIMIT 1",
    );
    expect(msg!.text.length).toBeLessThanOrEqual(1024);
    const buttons = JSON.parse(msg!.keyboard).inline_keyboard.flat() as {
      url?: string;
    }[];
    expect(buttons.filter((b) => b.url)).toHaveLength(5);
  } finally {
    await h.dispose();
  }
});
