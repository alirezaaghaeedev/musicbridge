import type { Bindings } from "../infrastructure/config";
import { Dispatcher } from "./dispatch";
import { SpotifyClient } from "../integrations/spotify";
import { TelegramClient } from "../integrations/telegram";
import { MockSpotify, MockTelegram } from "../integrations/mock";
import type { Spotify, Telegram, Keyboard } from "../integrations/providers";
import { ProviderError } from "../integrations/providers";
import type { Job } from "../domain/model";
import type { Update } from "../integrations/telegram";
import { Connections } from "./connections";
import { Music } from "./music";
import { Bot } from "../presentation/bot";
import { log } from "../infrastructure/logging";
import { messages } from "../presentation/messages";
export class Runtime extends Dispatcher {
  spotify: Spotify;
  telegram: Telegram;
  connections: Connections;
  music: Music;
  bot: Bot;
  constructor(
    env: Bindings,
    providers?: { spotify: Spotify; telegram: Telegram },
  ) {
    super(env);
    this.spotify =
      providers?.spotify ??
      (this.c.APP_MODE === "mock"
        ? new MockSpotify(env.DB, this.c.PUBLIC_BASE_URL)
        : new SpotifyClient(this.c));
    this.telegram =
      providers?.telegram ??
      (this.c.APP_MODE === "mock"
        ? new MockTelegram(env.DB)
        : new TelegramClient(
            this.c.TELEGRAM_BOT_TOKEN,
            this.c.REQUEST_TIMEOUT_MS,
          ));
    this.connections = new Connections(this.db, this.c, this.spotify);
    this.music = new Music(this.db, this.c, this.spotify, this.connections);
    this.bot = new Bot(
      this.db,
      this.c,
      this.spotify,
      this.telegram,
      this.connections,
      this.music,
    );
  }
  async process(jobId: string) {
    if (!this.c.PROCESSING_ENABLED) return;
    const start = Date.now();
    const job = await this.db.one<Job>(
      "UPDATE outbox_jobs SET status='processing',attempts=attempts+1,lease=? WHERE id=? AND attempts<5 AND available_at<=? AND (status='pending' OR (status='processing' AND lease<?)) RETURNING *",
      start + 900000,
      jobId,
      start,
      start,
    );
    if (!job) return;
    let userLock: string | undefined;
    try {
      const payload = JSON.parse(job.payload) as {
        submissionId?: string;
        chat?: string;
        text?: string;
        review?: string;
        user?: string;
        keyboard?: Keyboard;
        attribution?: boolean;
      };
      if (job.kind === "update") {
        const update = JSON.parse(job.payload) as Update;
        const user = String(
          update.callback_query?.from.id ?? update.message?.from?.id,
        );
        userLock = `user:${user}`;
        await this.db.run(
          "INSERT INTO mutation_locks VALUES (?,?,?) ON CONFLICT(playlist_id) DO UPDATE SET operation_id=excluded.operation_id,lease=excluded.lease WHERE mutation_locks.lease<?",
          userLock,
          jobId,
          start + 900000,
          start,
        );
        const lock = await this.db.one<{ operation_id: string }>(
          "SELECT operation_id FROM mutation_locks WHERE playlist_id=?",
          userLock,
        );
        if (lock?.operation_id !== jobId)
          throw new ProviderError("USER_BUSY", 429, 5);
        await this.bot.update(update);
      } else if (job.kind === "music" && payload.submissionId) {
        userLock = `submission:${payload.submissionId}`;
        await this.db.run(
          "INSERT INTO mutation_locks VALUES (?,?,?) ON CONFLICT(playlist_id) DO UPDATE SET operation_id=excluded.operation_id,lease=excluded.lease WHERE mutation_locks.lease<?",
          userLock,
          jobId,
          start + 900000,
          start,
        );
        const lock = await this.db.one<{ operation_id: string }>(
          "SELECT operation_id FROM mutation_locks WHERE playlist_id=?",
          userLock,
        );
        if (lock?.operation_id !== jobId)
          throw new ProviderError("SUBMISSION_BUSY", 429, 30);
        await this.music.process(payload.submissionId);
      } else if (job.kind === "notify" && payload.chat) {
        if (payload.review && payload.user)
          await this.bot.review(payload.user, payload.review);
        else
          await this.telegram.send(
            payload.chat,
            payload.text ?? "",
            payload.keyboard,
            payload.attribution,
          );
      }
      await this.db.run(
        "UPDATE outbox_jobs SET status='done',lease=0 WHERE id=?",
        jobId,
      );
      if (this.c.LOG_LEVEL !== "silent")
        log("job_completed", {
          job_id: jobId,
          submission_id: payload.submissionId,
          duration_ms: Date.now() - start,
          retry_count: job.attempts - 1,
          status: "done",
        });
    } catch (e) {
      const p =
        e instanceof ProviderError ? e : new ProviderError("INTERNAL", 500);
      const retry = p.retryable && job.attempts < 5;
      const delay = Math.max(
        p.retryAfter,
        Math.min(3600, 2 ** job.attempts * 5 + Math.floor(Math.random() * 5)),
      );
      await this.db.run(
        "UPDATE outbox_jobs SET status=?,lease=0,published_at=0,available_at=? WHERE id=?",
        retry ? "pending" : "dead",
        Date.now() + delay * 1000,
        jobId,
      );
      if (job.kind === "music" && p.code !== "SUBMISSION_BUSY") {
        const { submissionId } = JSON.parse(job.payload) as {
          submissionId: string;
        };
        const sub = await this.db.submission(submissionId);
        if (sub) {
          if (p.status === 401) await this.connections.invalidate(sub.user_id);
          const op = await this.db.one<{ status: string }>(
            "SELECT status FROM playlist_operations WHERE submission_id=?",
            sub.id,
          );
          const state =
            op && ["sending", "uncertain"].includes(op.status)
              ? "RECONCILIATION_REQUIRED"
              : p.status === 401
                ? "REAUTH_REQUIRED"
                : retry
                  ? "RETRY_PENDING"
                  : "FAILED";
          await this.db.run(
            "UPDATE audio_submissions SET state=?,error=?,updated_at=? WHERE id=? AND state NOT IN ('ADDED','ALREADY_EXISTS','CANCELLED')",
            state,
            p.code,
            Date.now(),
            sub.id,
          );
          if (!retry) {
            const s = await this.db.settings(sub.user_id);
            await this.db.enqueue(
              "notify",
              {
                chat: sub.chat_id,
                text:
                  state === "REAUTH_REQUIRED"
                    ? messages[s.locale].reauth
                    : state === "RECONCILIATION_REQUIRED"
                      ? messages[s.locale].uncertain
                      : p.code === "QUOTA_EXCEEDED"
                        ? messages[s.locale].quota
                        : messages[s.locale].failed,
              },
              `error-${jobId}`,
            );
          }
        }
      } else if (job.kind === "update" && !retry) {
        const u = JSON.parse(job.payload) as Update;
        const m = u.callback_query?.message ?? u.message;
        if (m) {
          const user = String(u.callback_query?.from.id ?? m.from?.id);
          const s = await this.db.settings(user);
          await this.db.enqueue(
            "notify",
            {
              chat: String(m.chat.id),
              text:
                p.status === 401
                  ? messages[s.locale].reauth
                  : p.code === "QUOTA_EXCEEDED"
                    ? messages[s.locale].quota
                    : messages[s.locale].failed,
            },
            `error-${jobId}`,
          );
        }
      }
      if (this.c.LOG_LEVEL !== "silent")
        log(
          "job_failed",
          {
            job_id: jobId,
            error_code: p.code,
            retry_count: job.attempts,
            status: retry ? "retry" : "dead",
          },
          "error",
        );
    } finally {
      if (userLock)
        await this.db.run(
          "DELETE FROM mutation_locks WHERE playlist_id=? AND operation_id=?",
          userLock,
          jobId,
        );
    }
  }
}
