import { Hono } from "hono";
import type { Bindings } from "./infrastructure/config";
import { config } from "./infrastructure/config";
import { safeEqual } from "./infrastructure/security";
import { updateSchema } from "./integrations/telegram";
import { Runtime } from "./application/runtime";
import { Dispatcher } from "./application/dispatch";
import { messages } from "./presentation/messages";
const app = new Hono<{ Bindings: Bindings }>();
app.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Content-Type-Options", "nosniff");
  await next();
});
app.get("/healthz", (c) => c.json({ status: "ok" }));
app.get("/readyz", async (c) => {
  try {
    config(c.env);
    if (!c.env.MUSIC_QUEUE || !c.env.DB) throw new Error("bindings");
    await c.env.DB.prepare("SELECT 1 FROM outbox_jobs LIMIT 1").first();
    return c.json({ status: "ready" });
  } catch {
    return c.json({ status: "unavailable" }, 503);
  }
});
app.post("/telegram/webhook", async (c) => {
  const cfg = config(c.env);
  let raw: unknown;
  try {
    const reader = c.req.raw.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 32768) {
            await reader.cancel();
            return c.json({ error: "too large" }, 413);
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (
      !(await safeEqual(
        c.req.header("X-Telegram-Bot-Api-Secret-Token") ?? "",
        cfg.TELEGRAM_WEBHOOK_SECRET,
      ))
    )
      return c.json({ error: "unauthorized" }, 401);
    if (!cfg.PROCESSING_ENABLED) return c.json({ error: "paused" }, 503);
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return c.json({ error: "invalid JSON" }, 400);
  }
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: "invalid update" }, 400);
  const dispatcher = new Dispatcher(c.env, cfg);
  const jobId = await dispatcher.ingest(parsed.data);
  if (jobId) c.executionCtx.waitUntil(dispatcher.publishOne(jobId));
  return c.json({ ok: true });
});
app.get("/oauth/callback", async (c) => {
  if (c.req.url.length > 4096) return c.text("Invalid authorization", 400);
  const r = new Runtime(c.env);
  try {
    if (c.req.query("error"))
      return c.text(
        "Authorization declined. Return to Telegram and use /connect.",
        400,
      );
    const linked = await r.connections.callback(
      c.req.query("state") ?? "",
      c.req.query("code") ?? "",
    );
    const s = await r.db.settings(linked.user);
    const button = await r.bot.button(linked.user, "Confirm / تأیید", {
      kind: "confirm",
      id: linked.stateHash,
    });
    await r.db.enqueue(
      "notify",
      {
        chat: linked.user,
        text: `${messages[s.locale].confirm}\n${linked.identity}`,
        keyboard: { inline_keyboard: [[button]] },
      },
      `oauth-${linked.stateHash}`,
    );
    // The confirmation message is durable; notification jobs carry its keyboard.
    c.executionCtx.waitUntil(r.publishOne(`oauth-${linked.stateHash}`));
    return c.text("Return to Telegram to confirm the Spotify account.");
  } catch {
    return c.text(
      "Authorization failed or expired. Return to Telegram and use /connect.",
      400,
    );
  }
});
app.onError((_e, c) => c.json({ error: "service unavailable" }, 503));
export { app };
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<{ jobId: string }>, env: Bindings) {
    const r = new Runtime(env);
    for (const m of batch.messages) {
      try {
        await r.process(m.body.jobId);
        m.ack();
      } catch {
        m.retry({ delaySeconds: 60 });
      }
    }
    await r.publish(1);
  },
  async scheduled(
    _event: ScheduledEvent,
    env: Bindings,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(new Dispatcher(env).recover());
  },
};
