import { describe, it, expect } from "vitest";
import { harness } from "../helpers";
import { ProviderError } from "../../src/integrations/providers";
describe("persisted workflows", () => {
  it("rejects forged webhooks and unauthorized / group users before persistence", async () => {
    const h = await harness();
    try {
      const u = {
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: 999 },
          chat: { id: 999, type: "private" },
          text: "/start",
        },
      };
      expect((await h.webhook(u, "wrong")).status).toBe(401);
      expect((await h.webhook(u)).status).toBe(200);
      expect(await h.runtime.db.all("SELECT * FROM users")).toHaveLength(0);
      u.message.from.id = 123;
      u.message.chat.type = "group";
      await h.webhook(u);
      expect(await h.runtime.db.all("SELECT * FROM users")).toHaveLength(0);
    } finally {
      await h.dispose();
    }
  });
  it("deduplicates webhook and queue deliveries, with reproducible migrations", async () => {
    const h = await harness();
    try {
      await h.connect();
      await h.audio("Northern Lights", "Example Artist", 10);
      await h.audio("Northern Lights", "Example Artist", 10);
      await Promise.all([
        h.runtime.process("music-update-10"),
        h.runtime.process("music-update-10"),
      ]);
      expect(
        await h.runtime.db.all("SELECT * FROM audio_submissions"),
      ).toHaveLength(1);
      expect(
        await h.runtime.db.all("SELECT * FROM mock_playlist_items"),
      ).toHaveLength(1);
      expect(
        await h.runtime.db.all("SELECT * FROM playlist_operations"),
      ).toHaveLength(1);
      await expect(
        h.runtime.db.run("INSERT INTO user_settings VALUES ('unknown','{}')"),
      ).rejects.toThrow();
    } finally {
      await h.dispose();
    }
  });
  it("recovers publication failure and expired job leases", async () => {
    const h = await harness();
    try {
      await h.send("/start", 1);
      await h.runtime.db.enqueue(
        "notify",
        { chat: "123", text: "recovery" },
        "recover",
      );
      const send = h.env.MUSIC_QUEUE.send;
      h.env.MUSIC_QUEUE.send = async () => {
        throw new Error("offline");
      };
      await h.runtime.publish();
      expect(
        (await h.runtime.db.one<{ status: string }>(
          "SELECT status FROM outbox_jobs WHERE id=?",
          "recover",
        ))!.status,
      ).toBe("pending");
      h.env.MUSIC_QUEUE.send = send;
      await h.runtime.db.run(
        "UPDATE outbox_jobs SET status='processing',lease=1 WHERE id='recover'",
      );
      await h.drain();
      expect(
        (await h.runtime.db.one<{ status: string }>(
          "SELECT status FROM outbox_jobs WHERE id=?",
          "recover",
        ))!.status,
      ).toBe("done");
    } finally {
      await h.dispose();
    }
  });
  it("OAuth rejects replay, expiry and cross-user confirmation; refresh is encrypted", async () => {
    const h = await harness();
    try {
      await h.send("/start", 1);
      const url = new URL(await h.runtime.connections.begin("123"));
      const state = url.searchParams.get("state")!;
      const r = await h.runtime.connections.callback(state, "synthetic-code");
      await expect(
        h.runtime.connections.callback(state, "synthetic-code"),
      ).rejects.toThrow();
      await h.runtime.db.user("456", await h.runtime.db.settings("123"));
      expect(await h.runtime.connections.confirm("456", r.stateHash)).toBe(
        false,
      );
      expect(
        await h.runtime.db.one("SELECT * FROM spotify_connections"),
      ).toBeNull();
      await h.runtime.connections.confirm("123", r.stateHash);
      const c = await h.runtime.connections.get("123");
      expect(c.identity).toBe("synthetic-owner");
      const row = await h.runtime.db.one<{
        encrypted: string;
        version: number;
      }>("SELECT * FROM spotify_connections");
      expect(row!.encrypted).not.toContain("synthetic-access");
      expect(row!.version).toBe(2);
      const expired = new URL(await h.runtime.connections.begin("123"));
      await h.runtime.db.run("UPDATE oauth_sessions SET expires_at=0");
      await expect(
        h.runtime.connections.callback(
          expired.searchParams.get("state")!,
          "code",
        ),
      ).rejects.toThrow();
    } finally {
      await h.dispose();
    }
  });
  it("stores settings and captured destination across new runtime requests", async () => {
    const h = await harness();
    try {
      await h.connect();
      await h.send("/threshold 95", 3);
      await h.send("/auto off", 4);
      const id = await h.runtime.music.create("123", "123", 10, {
        title: "Northern Lights",
        artist: "Example Artist",
      });
      await h.send("/playlist QQQQQQQQQQQQQQQQQQQQQQ", 5);
      expect(
        JSON.parse((await h.runtime.db.submission(id))!.settings).playlist,
      ).toBe("P".repeat(22));
      expect((await h.runtime.db.settings("123")).threshold).toBe(95);
    } finally {
      await h.dispose();
    }
  });
  it("metadata conversation survives requests and corrections override extracted values", async () => {
    const h = await harness();
    try {
      await h.connect();
      await h.webhook({
        update_id: 3,
        message: {
          message_id: 3,
          from: { id: 123 },
          chat: { id: 123, type: "private" },
          document: {
            file_id: "f",
            file_unique_id: "u",
            file_name: "ambiguous_file.mp3",
            mime_type: "audio/mpeg",
          },
        },
      });
      await h.drain();
      expect((await h.runtime.db.submission("update-3"))!.state).toBe(
        "METADATA_REQUIRED",
      );
      await h.send("Northern Lights | Example Artist", 4);
      expect((await h.runtime.db.submission("update-3"))!.state).toBe("ADDED");
    } finally {
      await h.dispose();
    }
  });
  it("rejects callback ownership, expiry and repeated actions", async () => {
    const h = await harness();
    try {
      await h.connect();
      await h.audio("Distant Shore", "Example Artist", 3);
      const row = await h.runtime.db.one<{ keyboard: string }>(
        "SELECT keyboard FROM mock_messages ORDER BY id DESC LIMIT 1",
      );
      const data = JSON.parse(row!.keyboard).inline_keyboard[0][0]
        .callback_data as string;
      await h.callback(data, 4, 456);
      expect((await h.runtime.db.submission("update-3"))!.state).toBe(
        "REVIEW_REQUIRED",
      );
      await h.callback(data, 5);
      await h.callback(data, 6);
      expect(
        await h.runtime.db.all("SELECT * FROM playlist_operations"),
      ).toHaveLength(1);
      const expired = await h.runtime.db.callback("123", {
        kind: "setting",
        id: "auto",
        value: "false",
      });
      await h.runtime.db.run(
        "UPDATE callback_actions SET expires_at=0 WHERE id=?",
        expired,
      );
      await h.callback(expired, 7);
      expect((await h.runtime.db.settings("123")).auto).toBe(true);
    } finally {
      await h.dispose();
    }
  });
  it("serializes concurrent playlist mutations and recovers busy work", async () => {
    const h = await harness();
    try {
      await h.connect();
      const a = await h.runtime.music.create("123", "123", 10, {
        title: "Northern Lights",
        artist: "Example Artist",
      });
      const b = await h.runtime.music.create("123", "123", 11, {
        title: "Northern Lights",
        artist: "Example Artist",
      });
      await Promise.all([
        h.runtime.process(`music-${a}`),
        h.runtime.process(`music-${b}`),
      ]);
      await h.runtime.db.run(
        "UPDATE outbox_jobs SET available_at=0,published_at=0 WHERE status='pending'",
      );
      await h.drain();
      expect(
        await h.runtime.db.all("SELECT * FROM mock_playlist_items"),
      ).toHaveLength(1);
      expect((await h.runtime.db.submission(a))!.state).toMatch(
        /ADDED|ALREADY_EXISTS/,
      );
      expect((await h.runtime.db.submission(b))!.state).toMatch(
        /ADDED|ALREADY_EXISTS/,
      );
    } finally {
      await h.dispose();
    }
  });
  it("reconciles accepted mutation after network failure without another POST", async () => {
    const h = await harness();
    try {
      await h.connect();
      const add = h.runtime.spotify.add.bind(h.runtime.spotify);
      let calls = 0;
      h.runtime.spotify.add = async (...args) => {
        calls++;
        await add(...args);
        throw new ProviderError("NETWORK", 0, 0, true);
      };
      await h.audio("Northern Lights", "Example Artist", 3);
      expect((await h.runtime.db.submission("update-3"))!.state).toBe(
        "RECONCILIATION_REQUIRED",
      );
      await h.runtime.bot.requeue("123", "update-3");
      await h.drain();
      expect((await h.runtime.db.submission("update-3"))!.state).toBe("ADDED");
      expect(calls).toBe(1);
    } finally {
      await h.dispose();
    }
  });
  it("keeps absent uncertain mutation unresolved and blocks blind repeats", async () => {
    const h = await harness();
    try {
      await h.connect();
      let calls = 0;
      h.runtime.spotify.add = async () => {
        calls++;
        throw new ProviderError("NETWORK", 0, 0, true);
      };
      await h.audio("Northern Lights", "Example Artist", 3);
      await h.runtime.bot.requeue("123", "update-3");
      await h.drain();
      expect((await h.runtime.db.submission("update-3"))!.state).toBe(
        "RECONCILIATION_REQUIRED",
      );
      expect(calls).toBe(1);
    } finally {
      await h.dispose();
    }
  });
  it("respects Retry-After and terminates revoked authorization", async () => {
    const h = await harness();
    try {
      await h.connect();
      h.runtime.spotify.search = async () => {
        throw new ProviderError("RATE_LIMITED", 429, 120);
      };
      const start = Date.now();
      await h.audio("Northern Lights", "Example Artist", 3);
      const job = await h.runtime.db.one<{
        available_at: number;
        status: string;
      }>("SELECT * FROM outbox_jobs WHERE id=?", "music-update-3");
      expect(job!.status).toBe("pending");
      expect(job!.available_at).toBeGreaterThanOrEqual(start + 120000);
      await h.runtime.db.run("UPDATE spotify_connections SET expires_at=0");
      h.runtime.spotify.refresh = async () => {
        throw new ProviderError("invalid_grant", 400);
      };
      await h.audio("Northern Lights", "Example Artist", 4);
      expect((await h.runtime.db.submission("update-4"))!.state).toBe(
        "REAUTH_REQUIRED",
      );
      expect(
        await h.runtime.db.one("SELECT * FROM spotify_connections"),
      ).toBeNull();
    } finally {
      await h.dispose();
    }
  });
  it("no playlist gives setup guidance, auto disabled gives review and terminal states stay closed", async () => {
    const h = await harness();
    try {
      await h.send("/start", 1);
      await h.audio("Northern Lights", "Example Artist", 2);
      expect((await h.runtime.db.submission("update-2"))!.state).toBe(
        "REAUTH_REQUIRED",
      );
      await h.connect();
      await h.send("/auto off", 4);
      await h.audio("Northern Lights", "Example Artist", 5);
      expect((await h.runtime.db.submission("update-5"))!.state).toBe(
        "REVIEW_REQUIRED",
      );
      await h.runtime.db.transition("update-5", "CANCELLED");
      await expect(
        h.runtime.db.transition("update-5", "QUEUED"),
      ).rejects.toThrow();
    } finally {
      await h.dispose();
    }
  });
});
