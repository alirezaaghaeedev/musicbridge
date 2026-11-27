import { writeFile } from "node:fs/promises";
import { it, expect } from "vitest";
import { harness } from "../helpers";
import worker, { app } from "../../src/index";
it("demonstrates real handlers, D1, outbox, queue, OAuth confirmation, auto addition, duplicate and manual selection", async () => {
  const h = await harness();
  try {
    // Use the actual exported Queue consumer, not a disconnected demo service.
    async function drain() {
      for (let n = 0; n < 30; n++) {
        await h.runtime.publish();
        const ids = h.queued.splice(0);
        if (!ids.length) break;
        await worker.queue(
          {
            queue: "local",
            messages: ids.map((jobId) => ({
              body: { jobId },
              ack() {},
              retry() {},
              id: jobId,
              timestamp: new Date(),
              attempts: 1,
            })),
            ackAll() {},
            retryAll() {},
          } as unknown as MessageBatch<{ jobId: string }>,
          h.env,
        );
      }
    }
    await h.webhook({
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 123 },
        chat: { id: 123, type: "private" },
        text: "/connect",
      },
    });
    await drain();
    const link = await h.runtime.db.one<{ keyboard: string }>(
      "SELECT keyboard FROM mock_messages ORDER BY id DESC LIMIT 1",
    );
    const auth = new URL(
      JSON.parse(link!.keyboard).inline_keyboard[0][0].url as string,
    );
    const tasks: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(p: Promise<unknown>) {
        tasks.push(p);
      },
    } as ExecutionContext;
    const response = await app.request(
      auth.pathname + auth.search,
      {},
      h.env,
      ctx,
    );
    await Promise.all(tasks);
    expect(response.status).toBe(200);
    await drain();
    expect(
      await h.runtime.db.one("SELECT * FROM spotify_connections"),
    ).toBeNull();
    const confirm = await h.runtime.db.one<{ keyboard: string }>(
      "SELECT keyboard FROM mock_messages ORDER BY id DESC LIMIT 1",
    );
    await h.callback(
      JSON.parse(confirm!.keyboard).inline_keyboard[0][0]
        .callback_data as string,
      2,
    );
    await drain();
    expect(
      await h.runtime.db.one("SELECT * FROM spotify_connections"),
    ).not.toBeNull();
    await h.send("/playlist PPPPPPPPPPPPPPPPPPPPPP", 3);
    await h.audio("Northern Lights", "Example Artist", 4);
    expect((await h.runtime.db.submission("update-4"))!.state).toBe("ADDED");
    await h.audio("Northern Lights", "Example Artist", 5);
    expect((await h.runtime.db.submission("update-5"))!.state).toBe(
      "ALREADY_EXISTS",
    );
    await h.audio("Distant Shore", "Example Artist", 6);
    expect((await h.runtime.db.submission("update-6"))!.state).toBe(
      "REVIEW_REQUIRED",
    );
    const review = await h.runtime.db.one<{ keyboard: string }>(
      "SELECT keyboard FROM mock_messages ORDER BY id DESC LIMIT 1",
    );
    await h.callback(
      JSON.parse(review!.keyboard).inline_keyboard[0][0]
        .callback_data as string,
      7,
    );
    expect((await h.runtime.db.submission("update-6"))!.state).toBe("ADDED");
    const items = await h.runtime.db.all("SELECT * FROM mock_playlist_items");
    expect(items).toHaveLength(2);
    const sent = await h.runtime.db.all<{ text: string }>(
      "SELECT text FROM mock_messages",
    );
    expect(sent.every((m) => m.text.startsWith("[MOCK]"))).toBe(true);
    if (process.env.MUSICBRIDGE_DEMO_EXPORT) {
      await h.send("/settings", 8);
      await h.send("/playlist", 9);
      await h.send("/language fa", 10);
      await h.send("/start", 11);
      await h.send("/settings", 12);
      await h.send("/language en", 13);
      const rows = await h.runtime.db.all<{
        text: string;
        keyboard: string | null;
      }>("SELECT text,keyboard FROM mock_messages ORDER BY id");
      const transcript = rows.map((row) => ({
        text: row.text,
        buttons: row.keyboard
          ? (
              JSON.parse(row.keyboard).inline_keyboard as {
                text: string;
                url?: string;
              }[][]
            )
              .flat()
              .map((b) => ({
                text: b.text,
                ...(b.url && b.url.startsWith("https://open.spotify.com/")
                  ? { url: b.url }
                  : {}),
              }))
          : [],
      }));
      await writeFile(
        process.env.MUSICBRIDGE_DEMO_EXPORT,
        JSON.stringify(
          {
            mode: "mock",
            provenance:
              "Actual Hono/Queue handlers, local D1, synthetic providers; not a Telegram screenshot",
            playlistItems: items.length,
            messages: transcript,
          },
          null,
          2,
        ),
      );
    }
    console.log(
      JSON.stringify({
        demo: "PASS",
        oauthConfirmed: true,
        autoAdded: 1,
        duplicate: 1,
        manualAdded: 1,
        playlistItems: items.length,
        notifications: sent.length,
      }),
    );
  } finally {
    await h.dispose();
  }
});
