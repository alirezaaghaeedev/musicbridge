import { readFile } from "node:fs/promises";
import ts from "typescript";
const action = process.argv[2];
const base = process.env.PUBLIC_BASE_URL;
const mutate = ["register", "remove", "commands"].includes(action);
if (mutate && !process.argv.includes("--execute-remote"))
  throw new Error("Explicit --execute-remote is required for remote mutations");
if (
  !["register", "remove", "commands", "inspect", "smoke", "validate"].includes(
    action,
  )
)
  throw new Error("Unknown operation");
if (action === "validate") {
  const parsed = ts.parseConfigFileTextToJson(
    "wrangler.jsonc",
    await readFile("wrangler.jsonc", "utf8"),
  );
  if (parsed.error) throw new Error("Invalid Wrangler JSONC");
  const cfg = parsed.config;
  const p = cfg.env.production;
  const placeholders = JSON.stringify(p).includes("REPLACE");
  if (placeholders) {
    console.error(
      "Production placeholders remain. See docs/deployment.md; no remote action performed.",
    );
    process.exitCode = 1;
  } else {
    if (
      p.vars.APP_MODE !== "live" ||
      p.vars.APP_ENV !== "production" ||
      !/^\d+(,\s*\d+)*$/.test(p.vars.ALLOWED_TELEGRAM_USER_IDS) ||
      !p.vars.PUBLIC_BASE_URL.startsWith("https://") ||
      p.vars.SPOTIFY_REDIRECT_URI !== `${p.vars.PUBLIC_BASE_URL}/oauth/callback`
    )
      throw new Error("Invalid production configuration");
    console.log(
      "Production non-secret configuration is valid. Worker secrets are checked at runtime.",
    );
  }
} else if (action === "smoke") {
  if (!base || new URL(base).protocol !== "https:")
    throw new Error("PUBLIC_BASE_URL must be HTTPS");
  for (const path of ["/healthz", "/readyz"]) {
    const r = await fetch(new URL(path, base), {
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`Smoke check failed: ${path}`);
    console.log(`${path}: ${r.status}`);
  }
} else {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token)
    throw new Error(
      "Set TELEGRAM_BOT_TOKEN in your shell, never in command arguments",
    );
  const method =
    action === "register"
      ? "setWebhook"
      : action === "remove"
        ? "deleteWebhook"
        : action === "commands"
          ? "setMyCommands"
          : "getWebhookInfo";
  const body = {};
  if (action === "commands")
    Object.assign(body, {
      commands: [
        ["start", "شروع / Start"],
        ["help", "راهنما / Help"],
        ["connect", "اتصال اسپاتیفای / Connect Spotify"],
        ["disconnect", "قطع اتصال / Disconnect"],
        ["settings", "تنظیمات / Settings"],
        ["playlist", "پلی‌لیست / Playlist"],
        ["history", "تاریخچه / History"],
        ["pending", "در انتظار بررسی / Pending"],
        ["stats", "آمار / Statistics"],
        ["cancel", "لغو / Cancel"],
      ].map(([command, description]) => ({ command, description })),
    });
  if (action === "register") {
    if (
      !base ||
      new URL(base).protocol !== "https:" ||
      !process.env.TELEGRAM_WEBHOOK_SECRET
    )
      throw new Error("HTTPS base URL and webhook secret required");
    Object.assign(body, {
      url: new URL("/telegram/webhook", base).toString(),
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json();
    if (!r.ok || !data.ok) throw new Error("Telegram operation failed");
    console.log(
      JSON.stringify({
        operation: action,
        ok: true,
        ...(action === "inspect"
          ? {
              pendingUpdates: data.result.pending_update_count,
              hasError: !!data.result.last_error_date,
            }
          : {}),
      }),
    );
  } catch {
    throw new Error(
      "Telegram operation failed; credentials and provider response suppressed",
    );
  }
}
