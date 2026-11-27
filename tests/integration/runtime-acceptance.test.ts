import { beforeAll, afterAll, expect, it } from "vitest";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { app } from "../../src/index";
import { config } from "../../src/infrastructure/config";
import { testConfig } from "../helpers";
import type { Bindings } from "../../src/infrastructure/config";
let mf: Miniflare;
let db: D1Database;
const command = (id: number, user = 123) => ({
  update_id: id,
  message: {
    message_id: id,
    from: { id: user },
    chat: { id: user, type: "private" },
    text: "/help",
  },
});
async function send(payload: unknown) {
  const response = await mf.dispatchFetch(
    "https://local.test/telegram/webhook",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": testConfig.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    },
  );
  await response.text();
  return response;
}
beforeAll(async () => {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import worker from './src/index.ts'; export default {async fetch(req,env){const tasks=[];const local={...env,MUSIC_QUEUE:{async send(){throw Error('synthetic queue outage')}}};if(new URL(req.url).pathname==='/recover'){await worker.scheduled({}, {...local,MUSIC_QUEUE:{async send(){}}}, {waitUntil(p){tasks.push(p)}});await Promise.all(tasks);return new Response('ok');}const r=await worker.fetch(req,local,{waitUntil(p){tasks.push(p)},passThroughOnException(){}});await Promise.all(tasks);return r;}};`,
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  mf = new Miniflare({
    modules: true,
    script: bundle.outputFiles[0]!.text,
    compatibilityDate: "2026-07-01",
    d1Databases: ["DB"],
    bindings: { ...testConfig, DEFAULT_AUTO_ADD_ENABLED: "false" },
    outboundService: () => {
      throw Error("Unexpected provider request");
    },
  });
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for (const file of ["0001_initial.sql", "0002_local_mock.sql"])
    for (const sql of (await readFile("migrations/" + file, "utf8"))
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
});
afterAll(async () => {
  await mf?.dispose();
});
it("retains durable acceptance through Queue failure and scheduled republication", async () => {
  expect((await send(command(50))).status).toBe(200);
  const row = await db
    .prepare("SELECT published_at,status FROM outbox_jobs WHERE id='update-50'")
    .first<{ published_at: number; status: string }>();
  expect(row).toEqual({ published_at: 0, status: "pending" });
  expect(
    await db.prepare("SELECT id FROM processed_updates WHERE id=50").first(),
  ).not.toBeNull();
  expect((await mf.dispatchFetch("https://local.test/recover")).status).toBe(
    200,
  );
  expect(
    (await db
      .prepare("SELECT published_at FROM outbox_jobs WHERE id='update-50'")
      .first<{ published_at: number }>())!.published_at,
  ).toBeGreaterThan(0);
});
it("rolls back the entire acceptance transaction and returns 503 when the outbox insert fails", async () => {
  await db
    .prepare(
      "CREATE TRIGGER fail_accept BEFORE INSERT ON outbox_jobs WHEN NEW.id='update-70' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END",
    )
    .run();
  try {
    expect((await send(command(70, 456))).status).toBe(503);
    expect(
      await db.prepare("SELECT id FROM users WHERE id='456'").first(),
    ).toBeNull();
    expect(
      await db.prepare("SELECT id FROM processed_updates WHERE id=70").first(),
    ).toBeNull();
    expect(
      await db
        .prepare("SELECT id FROM outbox_jobs WHERE id='update-70'")
        .first(),
    ).toBeNull();
  } finally {
    await db.prepare("DROP TRIGGER fail_accept").run();
  }
});
it("captures persisted settings atomically and deduplicates audio without overwriting metadata or captured settings", async () => {
  await send(command(80));
  const settings = {
    auto: false,
    threshold: 90,
    duplicates: true,
    locale: "en",
    minimumArtist: 80,
    margin: 12,
    playlist: "P".repeat(22),
  };
  await db
    .prepare("UPDATE user_settings SET value=? WHERE user_id='123'")
    .bind(JSON.stringify(settings))
    .run();
  const payload = {
    update_id: 81,
    message: {
      ...command(81).message,
      audio: {
        file_id: "synthetic",
        file_unique_id: "unique",
        title: "Original",
        performer: "Artist",
        duration: 200,
      },
    },
  };
  expect((await send(payload)).status).toBe(200);
  await db
    .prepare("UPDATE user_settings SET value=? WHERE user_id='123'")
    .bind(JSON.stringify({ ...settings, threshold: 99 }))
    .run();
  payload.message.audio.title = "Changed replay";
  expect((await send(payload)).status).toBe(200);
  const row = await db
    .prepare(
      "SELECT metadata,settings FROM audio_submissions WHERE id='update-81'",
    )
    .first<{ metadata: string; settings: string }>();
  expect(JSON.parse(row!.metadata).title).toBe("Original");
  expect(JSON.parse(row!.settings)).toEqual(settings);
  expect(
    (await db
      .prepare(
        "SELECT count(*) AS count FROM outbox_jobs WHERE id='music-update-81'",
      )
      .first<{ count: number }>())!.count,
  ).toBe(1);
});
it("enforces actual streamed UTF-8 byte limits even with a misleading content-length", async () => {
  const env = {
    ...testConfig,
    DB: db,
    MUSIC_QUEUE: { async send() {} },
  } as unknown as Bindings;
  const data = JSON.stringify(command(90));
  const exact =
    data.slice(0, -1) +
    ',"padding":"' +
    "x".repeat(32768 - new TextEncoder().encode(data).length - 13) +
    '"}';
  expect(new TextEncoder().encode(exact).byteLength).toBe(32768);
  const tasks: Promise<unknown>[] = [];
  const ctx = {
    waitUntil(p: Promise<unknown>) {
      tasks.push(p);
    },
    passThroughOnException() {},
  } as ExecutionContext;
  const request = async (body: string) =>
    app.request(
      "/telegram/webhook",
      {
        method: "POST",
        headers: {
          "X-Telegram-Bot-Api-Secret-Token": testConfig.TELEGRAM_WEBHOOK_SECRET,
          "Content-Length": "1",
        },
        body,
      },
      env,
      ctx,
    );
  expect((await request(exact)).status).toBe(200);
  await Promise.all(tasks);
  expect((await request(exact + " ")).status).toBe(413);
  expect(
    (
      await request(
        JSON.stringify({ ...command(91), padding: "é".repeat(17000) }),
      )
    ).status,
  ).toBe(413);
  expect((await request("{")).status).toBe(400);
});
it("revalidates cached configuration on security-sensitive binding changes and prevents mutation", () => {
  const env = { ...testConfig };
  const first = config(env);
  expect(config({ ...env })).toBe(first);
  expect(Object.isFrozen(first)).toBe(true);
  expect(() => Object.assign(first, { PROCESSING_ENABLED: false })).toThrow();
  expect(
    config({ ...env, PROCESSING_ENABLED: "false" }).PROCESSING_ENABLED,
  ).toBe(false);
  expect(
    config({ ...env, TELEGRAM_WEBHOOK_SECRET: "different-synthetic-secret" })
      .TELEGRAM_WEBHOOK_SECRET,
  ).toBe("different-synthetic-secret");
  expect(
    config({ ...env, ALLOWED_TELEGRAM_USER_IDS: "789" })
      .ALLOWED_TELEGRAM_USER_IDS,
  ).toBe("789");
  for (const changes of [
    { TOKEN_ENCRYPTION_KEY: "invalid" },
    { ALLOWED_TELEGRAM_USER_IDS: "" },
    { APP_ENV: "production" },
    { APP_MODE: "live" },
    { PROCESSING_ENABLED: "invalid" },
  ])
    expect(() => config({ ...env, ...changes })).toThrow();
  expect(config(env).PROCESSING_ENABLED).toBe(true);
});

it("publishes only the OAuth notification from HTTP even with an unrelated backlog", async () => {
  const { harness } = await import("../helpers");
  const h = await harness();
  try {
    await h.send("/start", 700);
    const url = new URL(await h.runtime.connections.begin("123"));
    for (let i = 0; i < 5; i++)
      await h.runtime.db.enqueue(
        "notify",
        { chat: "123", text: "unrelated" },
        "unrelated-" + i,
      );
    const tasks: Promise<unknown>[] = [];
    const response = await app.request(
      "/oauth/callback?state=" +
        url.searchParams.get("state") +
        "&code=synthetic",
      { method: "GET" },
      h.env,
      {
        waitUntil(p: Promise<unknown>) {
          tasks.push(p);
        },
        passThroughOnException() {},
      } as ExecutionContext,
    );
    await Promise.all(tasks);
    expect(response.status).toBe(200);
    expect(h.queued).toHaveLength(1);
    expect(h.queued[0]).toMatch(/^oauth-/);
    const rows = await h.runtime.db.all<{ published_at: number }>(
      "SELECT published_at FROM outbox_jobs WHERE id LIKE 'unrelated-%'",
    );
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.published_at === 0)).toBe(true);
  } finally {
    await h.dispose();
  }
});
it("marks only successful Queue hints in a batch and preserves failed hints for recovery", async () => {
  const { harness } = await import("../helpers");
  const h = await harness();
  try {
    for (const id of ["hint-a", "hint-b", "hint-c"])
      await h.runtime.db.enqueue(
        "notify",
        { chat: "123", text: "synthetic" },
        id,
      );
    const send = h.env.MUSIC_QUEUE.send;
    h.env.MUSIC_QUEUE.send = async (body) => {
      if (body.jobId === "hint-b") throw Error("synthetic queue outage");
      return send(body);
    };
    await h.runtime.publish();
    const rows = await h.runtime.db.all<{ id: string; published_at: number }>(
      "SELECT id,published_at FROM outbox_jobs ORDER BY id",
    );
    expect(rows.find((row) => row.id === "hint-b")!.published_at).toBe(0);
    expect(
      rows
        .filter((row) => row.id !== "hint-b")
        .every((row) => row.published_at > 0),
    ).toBe(true);
    h.env.MUSIC_QUEUE.send = send;
    await h.runtime.publish();
    expect(h.queued).toEqual(["hint-a", "hint-c", "hint-b"]);
  } finally {
    await h.dispose();
  }
});
