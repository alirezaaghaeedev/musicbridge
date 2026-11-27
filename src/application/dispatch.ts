import { Database } from "../infrastructure/database";
import {
  config,
  defaults,
  type Bindings,
  type Config,
} from "../infrastructure/config";
import type { Job } from "../domain/model";
import { extractMetadata, type Update } from "../integrations/telegram";
import { log } from "../infrastructure/logging";
import { messages } from "../presentation/messages";
// Durable acceptance/publication/recovery without provider or matching services.
export class Dispatcher {
  db: Database;
  constructor(
    public env: Bindings,
    public c: Config = config(env),
  ) {
    this.db = new Database(env.DB);
  }
  allowed(update: Update) {
    const m = update.callback_query?.message ?? update.message;
    const user = String(update.callback_query?.from.id ?? m?.from?.id ?? "");
    return (
      !!m &&
      m.chat.type === "private" &&
      this.c.ALLOWED_TELEGRAM_USER_IDS.split(",")
        .map((x) => x.trim())
        .includes(user)
    );
  }
  async ingest(update: Update): Promise<string | null> {
    if (!this.allowed(update)) return null;
    const user = String(
      update.callback_query?.from.id ?? update.message!.from!.id,
    );
    const metadata = extractMetadata(update);
    const now = Date.now();
    const statements = [
      this.db.stmt("INSERT OR IGNORE INTO users VALUES (?,?)", user, now),
      this.db.stmt(
        "INSERT OR IGNORE INTO user_settings VALUES (?,?)",
        user,
        JSON.stringify(defaults(this.c)),
      ),
      this.db.stmt(
        "INSERT OR IGNORE INTO processed_updates VALUES (?,?,?)",
        update.update_id,
        user,
        now,
      ),
    ];
    let jobId: string;
    if (metadata && update.message) {
      const id = "update-" + update.update_id;
      jobId = "music-" + id;
      // Capture the persisted settings inside the same transaction as acceptance.
      statements.push(
        this.db.stmt(
          "INSERT OR IGNORE INTO audio_submissions (id,user_id,chat_id,message_id,metadata,settings,state,created_at,updated_at) SELECT ?,?,?,?, ?,value,'QUEUED',?,? FROM user_settings WHERE user_id=?",
          id,
          user,
          String(update.message.chat.id),
          update.message.message_id,
          JSON.stringify(metadata),
          now,
          now,
          user,
        ),
        this.db.job("music", { submissionId: id }, jobId),
      );
    } else {
      jobId = "update-" + update.update_id;
      statements.push(this.db.job("update", update, jobId));
    }
    const results = await this.db.db.batch(statements);
    return results.at(-1)!.meta.changes ? jobId : null;
  }
  async publishOne(jobId: string) {
    if (!this.c.PROCESSING_ENABLED) return;
    // Only a newly inserted durable job is passed here. Recovery handles failures.
    try {
      await this.env.MUSIC_QUEUE.send({ jobId });
      await this.db.run(
        "UPDATE outbox_jobs SET published_at=? WHERE id=? AND status='pending'",
        Date.now(),
        jobId,
      );
    } catch {
      if (this.c.LOG_LEVEL !== "silent")
        log(
          "queue_publish_failed",
          { job_id: jobId, error_code: "QUEUE_UNAVAILABLE" },
          "error",
        );
    }
  }
  async publish(limit = 5) {
    if (!this.c.PROCESSING_ENABLED) return;
    const now = Date.now();
    const rows = await this.db.all<Pick<Job, "id">>(
      "SELECT id FROM outbox_jobs WHERE ((status='pending' AND available_at<=?) OR (status='processing' AND lease<?)) AND published_at<? ORDER BY created_at LIMIT ?",
      now,
      now,
      now - 60000,
      Math.max(1, Math.min(5, limit)),
    );
    const published: D1PreparedStatement[] = [];
    for (const row of rows) {
      try {
        await this.env.MUSIC_QUEUE.send({ jobId: row.id });
        published.push(
          this.db.stmt(
            "UPDATE outbox_jobs SET published_at=? WHERE id=?",
            now,
            row.id,
          ),
        );
      } catch {
        if (this.c.LOG_LEVEL !== "silent")
          log(
            "queue_publish_failed",
            { job_id: row.id, error_code: "QUEUE_UNAVAILABLE" },
            "error",
          );
      }
    }
    if (published.length) {
      try {
        await this.db.db.batch(published);
      } catch {
        // Sent hints may be repeated by recovery; job leases/dedup remain authoritative.
        if (this.c.LOG_LEVEL !== "silent")
          log(
            "queue_publish_failed",
            { error_code: "QUEUE_UNAVAILABLE" },
            "error",
          );
      }
    }
  }
  async recover() {
    if (!this.c.PROCESSING_ENABLED) return;
    // Even repeated Worker termination has a finite processing budget.
    const exhausted = await this.db.all<Job>(
      "SELECT * FROM outbox_jobs WHERE status='processing' AND lease<? AND attempts>=5 LIMIT 3",
      Date.now(),
    );
    for (const job of exhausted) {
      if (job.kind === "music") {
        const { submissionId } = JSON.parse(job.payload) as {
          submissionId: string;
        };
        const sub = await this.db.submission(submissionId);
        if (
          sub &&
          !["ADDED", "ALREADY_EXISTS", "CANCELLED"].includes(sub.state)
        ) {
          const op = await this.db.one<{ status: string }>(
            "SELECT status FROM playlist_operations WHERE submission_id=?",
            sub.id,
          );
          const state =
            op && ["sending", "uncertain"].includes(op.status)
              ? "RECONCILIATION_REQUIRED"
              : "FAILED";
          const s = await this.db.settings(sub.user_id);
          await this.db.db.batch([
            this.db.stmt(
              "UPDATE audio_submissions SET state=?,error=?,updated_at=? WHERE id=?",
              state,
              "LEASE_BUDGET_EXHAUSTED",
              Date.now(),
              sub.id,
            ),
            this.db.job(
              "notify",
              {
                chat: sub.chat_id,
                text:
                  state === "RECONCILIATION_REQUIRED"
                    ? messages[s.locale].uncertain
                    : messages[s.locale].failed,
              },
              `exhausted-${job.id}`,
            ),
          ]);
        }
      }
      await this.db.run(
        "UPDATE outbox_jobs SET status='dead',lease=0 WHERE id=?",
        job.id,
      );
    }
    await this.publish();
    await this.db.cleanup(this.c.RETENTION_DAYS);
  }
}
