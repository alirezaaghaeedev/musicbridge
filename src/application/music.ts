import type { Config } from "../infrastructure/config";
import { Database } from "../infrastructure/database";
import type {
  Metadata,
  Settings,
  Track,
  MatchCandidate,
} from "../domain/model";
import { terminal } from "../domain/model";
import { normalize } from "../matching/normalizer";
import { createRanker, decide } from "../matching/engine";
import { randomId } from "../infrastructure/security";
import { Connections } from "./connections";
import type { Spotify } from "../integrations/providers";
import { ProviderError } from "../integrations/providers";
import { messages } from "../presentation/messages";
import { operationCaption } from "../presentation/spotify-display";
export class Music {
  constructor(
    private db: Database,
    private c: Config,
    private spotify: Spotify,
    private connections: Connections,
  ) {}
  async create(
    user: string,
    chat: string,
    message: number,
    metadata: Metadata,
    id = randomId(),
  ) {
    const settings = await this.db.settings(user);
    const now = Date.now();
    await this.db.db.batch([
      this.db.stmt(
        "INSERT OR IGNORE INTO audio_submissions (id,user_id,chat_id,message_id,metadata,settings,state,created_at,updated_at) VALUES (?,?,?,?,?,?,'QUEUED',?,?)",
        id,
        user,
        chat,
        message,
        JSON.stringify(metadata),
        JSON.stringify(settings),
        now,
        now,
      ),
      this.db.job("music", { submissionId: id }, `music-${id}`),
    ]);
    return id;
  }
  async process(id: string) {
    const sub = await this.db.submission(id);
    if (!sub || terminal.includes(sub.state)) return;
    if (
      [
        "REVIEW_REQUIRED",
        "METADATA_REQUIRED",
        "NO_MATCH",
        "REAUTH_REQUIRED",
        "FAILED",
      ].includes(sub.state)
    )
      return;
    const s = JSON.parse(sub.settings) as Settings;
    const metadata = JSON.parse(sub.metadata) as Metadata;
    const t = messages[s.locale];
    const notify = async (text: string) =>
      this.db.enqueue(
        "notify",
        { chat: sub.chat_id, text },
        `result-${id}-${sub.updated_at}-${text.includes(t.uncertain) ? "uncertain" : text.includes(t.reauth) ? "reauth" : "status"}`,
      );
    const op = await this.db.one<{
      id: string;
      status: string;
      track_id: string;
      playlist_id: string;
    }>("SELECT * FROM playlist_operations WHERE submission_id=?", id);
    if (op?.status === "confirmed") {
      await this.db.run(
        "UPDATE audio_submissions SET state='ADDED',updated_at=? WHERE id=?",
        Date.now(),
        id,
      );
      return;
    }
    if (op && ["sending", "uncertain"].includes(op.status)) {
      const conn = await this.connections.get(sub.user_id);
      if (
        await this.spotify.contains(conn.token, op.playlist_id, op.track_id)
      ) {
        await this.db.db.batch([
          this.db.stmt(
            "UPDATE playlist_operations SET status='confirmed' WHERE id=?",
            op.id,
          ),
          this.db.stmt(
            "UPDATE audio_submissions SET state='ADDED',updated_at=? WHERE id=?",
            Date.now(),
            id,
          ),
          this.db.stmt(
            "DELETE FROM mutation_locks WHERE operation_id=?",
            op.id,
          ),
          this.db.job(
            "notify",
            {
              chat: sub.chat_id,
              text: `${t.added}\nSpotify\nhttps://open.spotify.com/track/${op.track_id}\nhttps://open.spotify.com/playlist/${op.playlist_id}`,
              attribution: true,
            },
            `reconciled-${id}`,
          ),
        ]);
      } else {
        await this.db.run(
          "UPDATE audio_submissions SET state='RECONCILIATION_REQUIRED',updated_at=? WHERE id=?",
          Date.now(),
          id,
        );
        await notify(t.uncertain);
      }
      return;
    }
    if (
      sub.state === "QUEUED" ||
      sub.state === "RETRY_PENDING" ||
      sub.state === "RECONCILIATION_REQUIRED"
    )
      await this.db.transition(id, "PROCESSING");
    else if (["READY_TO_ADD", "ADDING"].includes(sub.state))
      await this.db.run(
        "UPDATE audio_submissions SET state='PROCESSING',updated_at=? WHERE id=?",
        Date.now(),
        id,
      );
    if (!metadata.title || metadata.ambiguous) {
      await this.db.db.batch([
        this.db.stmt(
          "UPDATE audio_submissions SET state='METADATA_REQUIRED',updated_at=? WHERE id=?",
          Date.now(),
          id,
        ),
        this.db.stmt(
          "INSERT INTO conversation_sessions VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
          sub.user_id,
          JSON.stringify({ kind: "metadata", submission: id }),
          Date.now() + 1800000,
        ),
        this.db.job(
          "notify",
          { chat: sub.chat_id, text: t.metadata },
          `metadata-${id}-${sub.updated_at}`,
        ),
      ]);
      return;
    }
    if (!s.playlist) {
      await this.db.db.batch([
        this.db.stmt(
          "UPDATE audio_submissions SET state='REAUTH_REQUIRED',updated_at=? WHERE id=?",
          Date.now(),
          id,
        ),
        this.db.job(
          "notify",
          { chat: sub.chat_id, text: t.setup },
          `setup-${id}`,
        ),
      ]);
      return;
    }
    const connection = await this.connections.get(sub.user_id);
    let candidates: MatchCandidate[] = [];
    if (sub.selected) {
      candidates = [JSON.parse(sub.selected) as MatchCandidate];
    } else {
      if ((await this.db.submission(id))?.state !== "SEARCHING")
        await this.db.transition(id, "SEARCHING");
      const clean = (v: string) => v.replace(/[":]/g, " ").slice(0, 256);
      const queries = [
        metadata.artist
          ? `track:${clean(metadata.title)} artist:${clean(metadata.artist)}`
          : `track:${clean(metadata.title)}`,
        `${metadata.artist ?? ""} ${metadata.title}`,
        `${normalize(metadata.artist ?? "")} ${normalize(metadata.title)}`,
        normalize(metadata.title),
      ];
      const tracks = new Map<string, Track>();
      const ranker = createRanker(metadata);
      for (const q of [...new Set(queries.map((q) => q.trim()))].slice(
        0,
        this.c.SEARCH_MAX_REQUESTS,
      )) {
        for (const track of await this.spotify.search(connection.token, q))
          if (tracks.size < 40) tracks.set(track.id, track);
        candidates = ranker.rank([...tracks.values()]);
        if (candidates.some((c) => c.computationLimited)) break;
        if (decide(candidates, s) === "auto" && candidates[0]!.finalScore >= 95)
          break;
      }
      await this.db.run(
        "INSERT INTO match_candidates VALUES (?,?,?) ON CONFLICT(submission_id) DO UPDATE SET value=excluded.value,expires_at=excluded.expires_at",
        id,
        JSON.stringify(candidates),
        Date.now() + 86400000,
      );
      const decision = decide(candidates, s);
      if (decision !== "auto") {
        await this.db.db.batch([
          this.db.stmt(
            "UPDATE audio_submissions SET state=?,updated_at=? WHERE id=?",
            decision === "none" ? "NO_MATCH" : "REVIEW_REQUIRED",
            Date.now(),
            id,
          ),
          this.db.job(
            "notify",
            { chat: sub.chat_id, review: id, user: sub.user_id },
            `review-${id}-${sub.updated_at}`,
          ),
        ]);
        return;
      }
    }
    const best = candidates[0];
    if (!best || best.available !== true) {
      await this.db.transition(id, "FAILED");
      await notify(
        !best
          ? t.failed
          : best.available === false
            ? t.unavailable
            : t.availabilityUnknown,
      );
      return;
    }
    if ((await this.db.submission(id))?.state !== "READY_TO_ADD")
      await this.db.transition(id, "READY_TO_ADD");
    const playlist = await this.spotify.playlist(connection.token, s.playlist);
    if (playlist.ownerId !== connection.identity)
      throw new ProviderError("PLAYLIST_NOT_OWNED", 403);
    const operationId = op?.id ?? randomId();
    await this.db.run(
      "INSERT INTO mutation_locks VALUES (?,?,?) ON CONFLICT(playlist_id) DO UPDATE SET operation_id=excluded.operation_id,lease=excluded.lease WHERE mutation_locks.lease<? AND mutation_locks.operation_id NOT IN (SELECT id FROM playlist_operations WHERE status IN ('sending','uncertain'))",
      s.playlist,
      operationId,
      Date.now() + 900000,
      Date.now(),
    );
    const lock = await this.db.one<{ operation_id: string }>(
      "SELECT operation_id FROM mutation_locks WHERE playlist_id=?",
      s.playlist,
    );
    if (lock?.operation_id !== operationId)
      throw new ProviderError("PLAYLIST_BUSY", 429, 30);
    try {
      if (
        s.duplicates &&
        (await this.spotify.contains(connection.token, s.playlist, best.id))
      ) {
        await this.db.db.batch([
          this.db.stmt(
            "UPDATE audio_submissions SET state='ALREADY_EXISTS',updated_at=? WHERE id=?",
            Date.now(),
            id,
          ),
          this.db.job(
            "notify",
            {
              chat: sub.chat_id,
              text: operationCaption(t.duplicate, best, best.finalScore, s),
              attribution: true,
            },
            `duplicate-${id}`,
          ),
        ]);
        return;
      }
      await this.db.run(
        "INSERT INTO playlist_operations (id,submission_id,playlist_id,track_id,status,manual,created_at) VALUES (?,?,?,?,'prepared',?,?) ON CONFLICT(submission_id) DO UPDATE SET status='prepared'",
        operationId,
        id,
        s.playlist,
        best.id,
        sub.selected ? 1 : 0,
        Date.now(),
      );
      await this.db.transition(id, "ADDING");
      await this.db.run(
        "UPDATE playlist_operations SET status='sending' WHERE id=?",
        operationId,
      );
      let snapshot: string;
      try {
        snapshot = await this.spotify.add(
          connection.token,
          s.playlist,
          best.uri,
        );
      } catch (e) {
        const uncertain = !(e instanceof ProviderError) || e.uncertain;
        await this.db.run(
          "UPDATE playlist_operations SET status=? WHERE id=?",
          uncertain ? "uncertain" : "rejected",
          operationId,
        );
        if (uncertain) {
          await this.db.transition(id, "RECONCILIATION_REQUIRED");
          await notify(t.uncertain);
          return;
        }
        throw e;
      }
      await this.db.db.batch([
        this.db.stmt(
          "UPDATE playlist_operations SET status='confirmed',snapshot=? WHERE id=?",
          snapshot,
          operationId,
        ),
        this.db.stmt(
          "UPDATE audio_submissions SET state='ADDED',updated_at=? WHERE id=? AND state='ADDING'",
          Date.now(),
          id,
        ),
        this.db.job(
          "notify",
          {
            chat: sub.chat_id,
            text: operationCaption(t.added, best, best.finalScore, {
              ...s,
              playlistName: playlist.name,
            }),
            attribution: true,
          },
          `added-${id}`,
        ),
      ]);
    } finally {
      await this.db.run(
        "DELETE FROM mutation_locks WHERE operation_id=? AND NOT EXISTS (SELECT 1 FROM playlist_operations WHERE id=? AND status IN ('sending','uncertain'))",
        operationId,
        operationId,
      );
    }
  }
}
