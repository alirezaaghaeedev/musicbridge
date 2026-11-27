import { it, expect } from "vitest";
import { harness } from "../helpers";
import { ProviderError } from "../../src/integrations/providers";
import { Runtime } from "../../src/application/runtime";
it("edits one field from review and reports localized owner statistics", async () => {
  const h = await harness();
  try {
    await h.connect();
    await h.send("/auto off", 3);
    await h.audio("Northern Lights", "Example Artist", 4);
    const button = await h.runtime.db.callback("123", {
      kind: "edit",
      id: "update-4",
      value: "title",
    });
    await h.callback(button, 5);
    await h.send("Distant Shore", 6);
    const metadata = JSON.parse(
      (await h.runtime.db.submission("update-4"))!.metadata,
    ) as { title: string; artist: string };
    expect(metadata).toMatchObject({
      title: "Distant Shore",
      artist: "Example Artist",
    });
    await h.send("/stats", 7);
    const last = await h.runtime.db.one<{ text: string }>(
      "SELECT text FROM mock_messages ORDER BY id DESC LIMIT 1",
    );
    expect(last!.text).toContain("Pending review: 1");
  } finally {
    await h.dispose();
  }
});
it("closes repeatedly abandoned processing jobs after the lease budget", async () => {
  const h = await harness();
  try {
    await h.send("/start", 1);
    const id = await h.runtime.music.create("123", "123", 2, {
      title: "Song",
      artist: "Artist",
    });
    await h.runtime.db.run(
      "UPDATE outbox_jobs SET status='processing',attempts=5,lease=0 WHERE id=?",
      `music-${id}`,
    );
    await h.runtime.recover();
    expect((await h.runtime.db.submission(id))!.state).toBe("FAILED");
    expect(
      (await h.runtime.db.one<{ status: string }>(
        "SELECT status FROM outbox_jobs WHERE id=?",
        `music-${id}`,
      ))!.status,
    ).toBe("dead");
  } finally {
    await h.dispose();
  }
});
it("refresh lease admits one request and preserves the rotated authorization", async () => {
  const h = await harness();
  try {
    await h.connect();
    await h.runtime.db.run("UPDATE spotify_connections SET expires_at=0");
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refresh = h.runtime.spotify.refresh.bind(h.runtime.spotify);
    h.runtime.spotify.refresh = async (token) => {
      await gate;
      return refresh(token);
    };
    const first = h.runtime.connections.get("123");
    await new Promise((resolve) => setTimeout(resolve, 40));
    await expect(h.runtime.connections.get("123")).rejects.toMatchObject({
      code: "REFRESH_BUSY",
    });
    release();
    await first;
    expect((await h.runtime.connections.get("123")).identity).toBe(
      "synthetic-owner",
    );
  } finally {
    await h.dispose();
  }
});
it("bounds attempts and permanently fails exhausted quota work", async () => {
  const h = await harness();
  try {
    await h.connect();
    h.runtime.spotify.search = async () => {
      throw new ProviderError("RATE_LIMITED", 429, 3600);
    };
    await h.audio("Northern Lights", "Example Artist", 5);
    for (let i = 0; i < 5; i++) {
      await h.runtime.db.run(
        "UPDATE outbox_jobs SET available_at=0,published_at=0 WHERE id='music-update-5' AND status='pending'",
      );
      await h.runtime.process("music-update-5");
    }
    expect(
      await h.runtime.db.one<{ status: string; attempts: number }>(
        "SELECT * FROM outbox_jobs WHERE id='music-update-5'",
      ),
    ).toMatchObject({ status: "dead", attempts: 5 });
    expect((await h.runtime.db.submission("update-5"))!.state).toBe("FAILED");
  } finally {
    await h.dispose();
  }
});
it("restores settings and connections in a separate runtime and cleans expired temporary data", async () => {
  const h = await harness();
  try {
    await h.connect();
    await h.send("/language fa", 3);
    const fresh = new Runtime(h.env);
    expect((await fresh.db.settings("123")).locale).toBe("fa");
    expect((await fresh.connections.get("123")).identity).toBe(
      "synthetic-owner",
    );
    await fresh.db.callback("123", { kind: "cancel" });
    await fresh.db.run("UPDATE callback_actions SET expires_at=0");
    await fresh.db.session("123", { kind: "title" });
    await fresh.db.run("UPDATE conversation_sessions SET expires_at=0");
    await fresh.db.cleanup(30);
    expect(await fresh.db.all("SELECT * FROM callback_actions")).toHaveLength(
      0,
    );
    expect(
      await fresh.db.all("SELECT * FROM conversation_sessions"),
    ).toHaveLength(0);
  } finally {
    await h.dispose();
  }
});
it("bounds external search calls and measures local D1 statement count per music job", async () => {
  const h = await harness();
  try {
    await h.connect();
    let searches = 0;
    const search = h.runtime.spotify.search.bind(h.runtime.spotify);
    h.runtime.spotify.search = async (...args) => {
      searches++;
      return search(...args);
    };
    const id = await h.runtime.music.create("123", "123", 20, {
      title: "Northern Lights",
      artist: "Example Artist",
      durationSeconds: 240,
    });
    const before = h.runtime.db.queries;
    const start = performance.now();
    await h.runtime.process(`music-${id}`);
    const count = h.runtime.db.queries - before;
    console.log(
      JSON.stringify({
        localMusicJobWallMs: performance.now() - start,
        d1Statements: count,
        searchRequests: searches,
      }),
    );
    expect(searches).toBeLessThanOrEqual(4);
    expect(searches).toBe(1);
    expect(count).toBeLessThan(40);
    expect((await h.runtime.db.submission(id))!.state).toBe("ADDED");
  } finally {
    await h.dispose();
  }
});
it("webhook captures submission before queue execution and rejects oversized updates", async () => {
  const h = await harness();
  try {
    const u = {
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 123 },
        chat: { id: 123, type: "private" },
        audio: {
          file_id: "f",
          file_unique_id: "u",
          title: "Song",
          performer: "Artist",
        },
      },
    };
    await h.webhook(u);
    expect((await h.runtime.db.submission("update-1"))!.state).toBe("QUEUED");
    const { app } = await import("../../src/index");
    const response = await app.request(
      "/telegram/webhook",
      { method: "POST", body: "x".repeat(32769) },
      h.env,
    );
    expect(response.status).toBe(413);
  } finally {
    await h.dispose();
  }
});
it("disconnect clears encrypted and pending authorizations and destination data", async () => {
  const h = await harness();
  try {
    await h.connect();
    await h.runtime.connections.begin("123");
    await h.runtime.connections.disconnect("123");
    expect(
      await h.runtime.db.all("SELECT * FROM spotify_connections"),
    ).toHaveLength(0);
    expect(await h.runtime.db.all("SELECT * FROM oauth_sessions")).toHaveLength(
      0,
    );
    expect((await h.runtime.db.settings("123")).playlist).toBeUndefined();
  } finally {
    await h.dispose();
  }
});
