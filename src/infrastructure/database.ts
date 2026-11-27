import type { Job, Settings, State, Submission } from "../domain/model";
import { transitions } from "../domain/model";
import { randomId } from "./security";
export class Database {
  queries = 0;
  constructor(public db: D1Database) {}
  stmt(sql: string, ...args: unknown[]) {
    this.queries++;
    return this.db.prepare(sql).bind(...args);
  }
  async one<T>(sql: string, ...args: unknown[]): Promise<T | null> {
    return this.stmt(sql, ...args).first<T>();
  }
  async all<T>(sql: string, ...args: unknown[]): Promise<T[]> {
    return (await this.stmt(sql, ...args).all<T>()).results;
  }
  async run(sql: string, ...args: unknown[]) {
    return this.stmt(sql, ...args).run();
  }
  async user(id: string, settings: Settings) {
    await this.db.batch([
      this.stmt("INSERT OR IGNORE INTO users VALUES (?,?)", id, Date.now()),
      this.stmt(
        "INSERT OR IGNORE INTO user_settings VALUES (?,?)",
        id,
        JSON.stringify(settings),
      ),
    ]);
  }
  async settings(id: string): Promise<Settings> {
    const r = await this.one<{ value: string }>(
      "SELECT value FROM user_settings WHERE user_id=?",
      id,
    );
    if (!r) throw new Error("Unknown user");
    return JSON.parse(r.value) as Settings;
  }
  async saveSettings(id: string, s: Settings) {
    await this.run(
      "UPDATE user_settings SET value=? WHERE user_id=?",
      JSON.stringify(s),
      id,
    );
  }
  job(kind: Job["kind"], payload: unknown, id = randomId()) {
    return this.stmt(
      "INSERT OR IGNORE INTO outbox_jobs (id,kind,payload,available_at,created_at) VALUES (?,?,?,?,?)",
      id,
      kind,
      JSON.stringify(payload),
      Date.now(),
      Date.now(),
    );
  }
  async enqueue(kind: Job["kind"], payload: unknown, id?: string) {
    await this.job(kind, payload, id).run();
  }
  async transition(id: string, to: State) {
    const from = await this.one<{ state: State }>(
      "SELECT state FROM audio_submissions WHERE id=?",
      id,
    );
    if (!from) throw new Error("Unknown submission");
    if (from.state === to) return;
    if (!transitions[from.state].includes(to))
      throw new Error(`Invalid state transition ${from.state} to ${to}`);
    const changed = await this.run(
      "UPDATE audio_submissions SET state=?,updated_at=? WHERE id=? AND state=?",
      to,
      Date.now(),
      id,
      from.state,
    );
    if (!changed.meta.changes) throw new Error("Concurrent state change");
  }
  async submission(id: string, user?: string) {
    return user
      ? this.one<Submission>(
          "SELECT * FROM audio_submissions WHERE id=? AND user_id=?",
          id,
          user,
        )
      : this.one<Submission>("SELECT * FROM audio_submissions WHERE id=?", id);
  }
  async callback(user: string, payload: unknown) {
    const id = randomId();
    await this.run(
      "INSERT INTO callback_actions VALUES (?,?,?,?,0)",
      id,
      user,
      JSON.stringify(payload),
      Date.now() + 900000,
    );
    return id;
  }
  async callbacks(user: string, payloads: unknown[]) {
    if (payloads.length > 20) throw new Error("Callback batch limit");
    const expires = Date.now() + 900000;
    const entries = payloads.map((payload) => ({ id: randomId(), payload }));
    if (entries.length)
      await this.db.batch(
        entries.map((entry) =>
          this.stmt(
            "INSERT INTO callback_actions VALUES (?,?,?,?,0)",
            entry.id,
            user,
            JSON.stringify(entry.payload),
            expires,
          ),
        ),
      );
    return entries.map((entry) => entry.id);
  }
  async consume(user: string, id: string, updateId: number) {
    return this.one<{ payload: string }>(
      "UPDATE callback_actions SET consumed=? WHERE id=? AND user_id=? AND (consumed=0 OR consumed=?) AND expires_at>? RETURNING payload",
      updateId + 1,
      id,
      user,
      updateId + 1,
      Date.now(),
    );
  }
  async session(user: string, value: unknown) {
    await this.run(
      "INSERT INTO conversation_sessions VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
      user,
      JSON.stringify(value),
      Date.now() + 1800000,
    );
  }
  async cleanup(days: number) {
    const now = Date.now();
    await this.db.batch([
      this.stmt("DELETE FROM oauth_sessions WHERE expires_at<?", now),
      this.stmt("DELETE FROM callback_actions WHERE expires_at<?", now),
      this.stmt("DELETE FROM conversation_sessions WHERE expires_at<?", now),
      this.stmt("DELETE FROM match_candidates WHERE expires_at<?", now),
      this.stmt(
        "DELETE FROM outbox_jobs WHERE status IN ('done','dead') AND created_at<?",
        now - days * 86400000,
      ),
      this.stmt(
        "DELETE FROM audio_submissions WHERE updated_at<? AND state IN ('ADDED','ALREADY_EXISTS','CANCELLED','FAILED','NO_MATCH') AND NOT EXISTS (SELECT 1 FROM playlist_operations p WHERE p.submission_id=audio_submissions.id AND p.status='uncertain')",
        now - days * 86400000,
      ),
      this.stmt(
        "DELETE FROM mutation_locks WHERE lease<? AND operation_id NOT IN (SELECT id FROM playlist_operations WHERE status IN ('uncertain','sending'))",
        now,
      ),
    ]);
  }
}
