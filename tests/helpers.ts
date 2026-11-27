import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { vi } from "vitest";
import type { Bindings } from "../src/infrastructure/config";
import { Runtime } from "../src/application/runtime";
import { app } from "../src/index";
import type { Update } from "../src/integrations/telegram";
import type { Spotify, Telegram } from "../src/integrations/providers";
export const testConfig = {
  APP_ENV: "development",
  APP_MODE: "mock",
  PUBLIC_BASE_URL: "http://127.0.0.1:8787",
  TELEGRAM_WEBHOOK_SECRET: "synthetic-webhook-secret",
  TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
  ALLOWED_TELEGRAM_USER_IDS: "123,456",
  DEFAULT_LOCALE: "en",
  LOG_LEVEL: "silent",
};
export async function harness(providers?: {
  spotify: Spotify;
  telegram: Telegram;
}) {
  // Catch accidental real-provider traffic. Miniflare's internal transport is independent.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("External network forbidden in tests");
    }),
  );
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("local");}}',
    compatibilityDate: "2026-07-01",
    d1Databases: ["DB"],
  });
  const db = await mf.getD1Database("DB");
  for (const file of ["0001_initial.sql", "0002_local_mock.sql"]) {
    const sql = await readFile(
      new URL(`../migrations/${file}`, import.meta.url),
      "utf8",
    );
    for (const statement of sql
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
  }
  const queued: string[] = [];
  const env = {
    ...testConfig,
    DB: db,
    MUSIC_QUEUE: {
      async send(body: { jobId: string }) {
        queued.push(body.jobId);
      },
    },
  } as unknown as Bindings;
  const runtime = new Runtime(env, providers);
  async function drain() {
    for (let round = 0; round < 30; round++) {
      await runtime.publish();
      const ids = queued.splice(0);
      if (!ids.length) break;
      for (const id of ids) await runtime.process(id);
    }
  }
  async function webhook(
    update: Update,
    secret = testConfig.TELEGRAM_WEBHOOK_SECRET,
  ) {
    const tasks: Promise<unknown>[] = [];
    const ctx = {
      waitUntil(p: Promise<unknown>) {
        tasks.push(p);
      },
      passThroughOnException() {},
    } as ExecutionContext;
    const response = await app.request(
      "/telegram/webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": secret,
        },
        body: JSON.stringify(update),
      },
      env,
      ctx,
    );
    await Promise.all(tasks);
    return response;
  }
  async function send(text: string, id: number, user = 123) {
    await webhook({
      update_id: id,
      message: {
        message_id: id,
        from: { id: user },
        chat: { id: user, type: "private" },
        text,
      },
    });
    await drain();
  }
  async function audio(title: string, artist: string | undefined, id: number) {
    await webhook({
      update_id: id,
      message: {
        message_id: id,
        from: { id: 123 },
        chat: { id: 123, type: "private" },
        audio: {
          file_id: "synthetic",
          file_unique_id: `unique-${id}`,
          title,
          performer: artist,
          duration: 240,
        },
      },
    });
    await drain();
  }
  async function callback(data: string, id: number, user = 123) {
    await webhook({
      update_id: id,
      callback_query: {
        id: `callback-${id}`,
        from: { id: user },
        data,
        message: { message_id: id, chat: { id: user, type: "private" } },
      },
    });
    await drain();
  }
  async function connect() {
    await send("/connect", 900001);
    const rows = await runtime.db.all<{ keyboard: string }>(
      "SELECT keyboard FROM mock_messages WHERE keyboard IS NOT NULL ORDER BY id DESC LIMIT 1",
    );
    const k = JSON.parse(rows[0]!.keyboard) as {
      inline_keyboard: { url: string }[][];
    };
    const url = new URL(k.inline_keyboard[0]![0]!.url);
    const result = await runtime.connections.callback(
      url.searchParams.get("state")!,
      "synthetic-code",
    );
    await runtime.connections.confirm("123", result.stateHash);
    await send("/playlist PPPPPPPPPPPPPPPPPPPPPP", 900002);
  }
  return {
    mf,
    env,
    runtime,
    queued,
    drain,
    webhook,
    send,
    audio,
    callback,
    connect,
    dispose: async () => {
      await mf.dispose();
      vi.unstubAllGlobals();
    },
  };
}
