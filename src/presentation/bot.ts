import { z } from "zod";
import { Database } from "../infrastructure/database";
import type { Config } from "../infrastructure/config";
import { playlistId } from "../infrastructure/security";
import type { MatchCandidate, Metadata, Settings } from "../domain/model";
import { terminal } from "../domain/model";
import type { Spotify, Telegram, Keyboard } from "../integrations/providers";
import { ProviderError } from "../integrations/providers";
import { extractMetadata, type Update } from "../integrations/telegram";
import { Connections } from "../application/connections";
import { Music } from "../application/music";
import { messages } from "./messages";
import {
  candidateLabel,
  trackUrl,
  playlistUrl,
  short,
} from "./spotify-display";
const actionSchema = z.object({
  kind: z.enum([
    "confirm",
    "playlist",
    "select",
    "more",
    "edit",
    "retry",
    "cancel",
    "setting",
  ]),
  id: z.string().max(128).optional(),
  value: z.string().max(256).optional(),
  index: z.number().int().nonnegative().max(40).optional(),
});
type Action = z.infer<typeof actionSchema>;
export class Bot {
  constructor(
    private db: Database,
    private c: Config,
    private spotify: Spotify,
    private telegram: Telegram,
    private connections: Connections,
    private music: Music,
  ) {}
  async button(user: string, text: string, action: Action) {
    return { text, callback_data: await this.db.callback(user, action) };
  }
  async review(user: string, id: string, offset = 0) {
    const sub = await this.db.submission(id, user);
    if (!sub) return;
    const s = await this.db.settings(user);
    const t = messages[s.locale];
    const row = await this.db.one<{ value: string }>(
      "SELECT value FROM match_candidates WHERE submission_id=? AND expires_at>?",
      id,
      Date.now(),
    );
    const candidates = row ? (JSON.parse(row.value) as MatchCandidate[]) : [];
    const suitable = candidates.filter((c) => c.finalScore >= 60);
    const text = [
      suitable.length ? t.review : t.none,
      ...(candidates.some((c) => c.computationLimited)
        ? [short(t.limited, 120)]
        : []),
      ...suitable
        .slice(offset, offset + 5)
        .map((c, i) => candidateLabel(c, offset + i)),
    ].join("\n\n");
    const rows: Keyboard["inline_keyboard"] = [];
    for (let i = offset; i < Math.min(offset + 5, suitable.length); i++)
      rows.push([
        ...(suitable[i]!.available === true
          ? [
              await this.button(user, `${t.choose} ${i + 1}`, {
                kind: "select",
                id,
                value: suitable[i]!.id,
              }),
            ]
          : []),
        { text: `Open Spotify ${i + 1}`, url: trackUrl(suitable[i]!.id) },
      ]);
    if (offset + 5 < suitable.length)
      rows.push([
        await this.button(user, t.more, {
          kind: "more",
          id,
          index: offset + 5,
        }),
      ]);
    rows.push([
      await this.button(user, t.title, { kind: "edit", id, value: "title" }),
      await this.button(user, t.artist, { kind: "edit", id, value: "artist" }),
    ]);
    rows.push([
      await this.button(user, t.retry, { kind: "retry", id }),
      await this.button(user, t.cancelButton, { kind: "cancel", id }),
    ]);
    await this.telegram.send(
      sub.chat_id,
      text,
      { inline_keyboard: rows },
      true,
    );
  }
  async playlist(user: string, input: string) {
    const id = playlistId(input);
    const conn = await this.connections.get(user);
    const p = await this.spotify.playlist(conn.token, id);
    if (p.ownerId !== conn.identity)
      throw new ProviderError("PLAYLIST_NOT_OWNED", 403);
    await this.db.run(
      "INSERT INTO playlists VALUES (?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name",
      user,
      id,
      p.name,
    );
    const s = await this.db.settings(user);
    s.playlist = id;
    s.playlistName = p.name;
    await this.db.saveSettings(user, s);
  }
  async requeue(
    user: string,
    id: string,
    candidate?: MatchCandidate,
    metadata?: Metadata,
  ) {
    const sub = await this.db.submission(id, user);
    if (!sub || terminal.includes(sub.state)) return;
    if (
      ![
        "REVIEW_REQUIRED",
        "NO_MATCH",
        "METADATA_REQUIRED",
        "REAUTH_REQUIRED",
        "FAILED",
        "RECONCILIATION_REQUIRED",
      ].includes(sub.state)
    )
      return;
    const settings = JSON.parse(sub.settings) as Settings;
    // Existing destinations are immutable. Only an unconfigured submission may adopt a first destination.
    if (!settings.playlist) {
      const current = await this.db.settings(user);
      settings.playlist = current.playlist;
      settings.playlistName = current.playlistName;
    }
    await this.db.db.batch([
      this.db.stmt(
        "UPDATE audio_submissions SET state='QUEUED',selected=?,metadata=?,settings=?,error=NULL,updated_at=? WHERE id=? AND user_id=? AND state=?",
        candidate ? JSON.stringify(candidate) : null,
        JSON.stringify(metadata ?? JSON.parse(sub.metadata)),
        JSON.stringify(settings),
        Date.now(),
        id,
        user,
        sub.state,
      ),
      this.db.job("music", { submissionId: id }),
    ]);
  }
  async action(user: string, chat: string, a: Action) {
    const s = await this.db.settings(user);
    const t = messages[s.locale];
    if (a.kind === "confirm" && a.id) {
      const connected = await this.connections.confirm(user, a.id);
      await this.telegram.send(chat, connected ? t.connected : t.expired);
      return;
    }
    if (a.kind === "playlist" && a.id) {
      await this.playlist(user, a.id);
      await this.telegram.send(chat, t.saved);
      return;
    }
    if (a.kind === "setting" && a.id) {
      if (a.id === "auto") s.auto = a.value === "true";
      if (a.id === "duplicates") s.duplicates = a.value === "true";
      if (a.id === "locale") s.locale = a.value === "en" ? "en" : "fa";
      if (
        a.id === "threshold" &&
        a.value &&
        Number(a.value) >= 60 &&
        Number(a.value) <= 100
      )
        s.threshold = Number(a.value);
      await this.db.saveSettings(user, s);
      await this.telegram.send(chat, messages[s.locale].saved);
      return;
    }
    if (!a.id) return;
    const sub = await this.db.submission(a.id, user);
    if (!sub) {
      await this.telegram.send(chat, t.expired);
      return;
    }
    if (a.kind === "more") {
      await this.review(user, a.id, a.index ?? 0);
      return;
    }
    if (a.kind === "cancel") {
      if (
        [
          "QUEUED",
          "REVIEW_REQUIRED",
          "METADATA_REQUIRED",
          "NO_MATCH",
          "FAILED",
          "REAUTH_REQUIRED",
          "RETRY_PENDING",
        ].includes(sub.state)
      )
        await this.db.transition(a.id, "CANCELLED");
      await this.telegram.send(chat, t.cancel);
      return;
    }
    if (
      a.kind === "edit" &&
      ["REVIEW_REQUIRED", "METADATA_REQUIRED", "NO_MATCH"].includes(sub.state)
    ) {
      await this.db.session(user, {
        kind: a.value === "artist" ? "artist" : "title",
        submission: a.id,
      });
      await this.telegram.send(
        chat,
        a.value === "artist" ? t.enterArtist : t.enterTitle,
      );
      return;
    }
    if (a.kind === "retry") {
      await this.requeue(user, a.id);
      return;
    }
    if (a.kind === "select" && sub.state === "REVIEW_REQUIRED") {
      const r = await this.db.one<{ value: string }>(
        "SELECT value FROM match_candidates WHERE submission_id=? AND expires_at>?",
        a.id,
        Date.now(),
      );
      const candidate = r
        ? (JSON.parse(r.value) as MatchCandidate[]).find(
            (c) => c.id === a.value && c.finalScore >= 60,
          )
        : undefined;
      if (candidate) await this.requeue(user, a.id, candidate);
      else await this.telegram.send(chat, t.expired);
    }
  }
  async update(update: Update) {
    const callback = update.callback_query;
    const m = callback?.message ?? update.message;
    const user = String(callback?.from.id ?? m?.from?.id ?? "");
    const chat = String(m?.chat.id ?? "");
    if (
      !m ||
      m.chat.type !== "private" ||
      !this.c.ALLOWED_TELEGRAM_USER_IDS.split(",")
        .map((x) => x.trim())
        .includes(user)
    )
      return;
    const s = await this.db.settings(user);
    const t = messages[s.locale];
    if (callback) {
      await this.telegram.answer(callback.id);
      const record = callback.data
        ? await this.db.consume(user, callback.data, update.update_id)
        : null;
      if (!record) {
        await this.telegram.send(chat, t.expired);
        return;
      }
      await this.action(
        user,
        chat,
        actionSchema.parse(JSON.parse(record.payload)),
      );
      return;
    }
    const meta = extractMetadata(update);
    if (meta) {
      await this.music.create(
        user,
        chat,
        m.message_id,
        meta,
        `update-${update.update_id}`,
      );
      return;
    }
    const text = m.text?.trim() ?? "";
    const [command, ...args] = text.split(/\s+/);
    const arg = args.join(" ");
    switch (command?.split("@")[0]) {
      case "/start":
      case "/help":
        await this.telegram.send(
          chat,
          command === "/start" ? t.welcome : t.help,
        );
        return;
      case "/connect": {
        const url = await this.connections.begin(user);
        await this.telegram.send(chat, t.connect, {
          inline_keyboard: [[{ text: "Spotify", url }]],
        });
        return;
      }
      case "/disconnect":
        await this.connections.disconnect(user);
        await this.telegram.send(chat, t.disconnected);
        return;
      case "/settings": {
        await this.telegram.send(
          chat,
          `${t.settings}\n${t.auto}: ${s.auto}\n${t.threshold}: ${s.threshold}\n${t.duplicates}: ${s.duplicates}\n${t.language}: ${s.locale}\n${s.playlistName ?? t.playlist}`,
          {
            inline_keyboard: [
              [
                await this.button(user, t.auto, {
                  kind: "setting",
                  id: "auto",
                  value: String(!s.auto),
                }),
                await this.button(user, t.duplicates, {
                  kind: "setting",
                  id: "duplicates",
                  value: String(!s.duplicates),
                }),
              ],
              [
                await this.button(user, "فارسی / English", {
                  kind: "setting",
                  id: "locale",
                  value: s.locale === "fa" ? "en" : "fa",
                }),
              ],
              [
                await this.button(user, "−5", {
                  kind: "setting",
                  id: "threshold",
                  value: String(Math.max(60, s.threshold - 5)),
                }),
                await this.button(user, "+5", {
                  kind: "setting",
                  id: "threshold",
                  value: String(Math.min(100, s.threshold + 5)),
                }),
              ],
            ],
          },
        );
        return;
      }
      case "/auto":
      case "/duplicates":
      case "/threshold":
      case "/language": {
        if (command === "/threshold") {
          if (!/^\d+$/.test(arg) || Number(arg) < 60 || Number(arg) > 100)
            throw new ProviderError("INVALID_THRESHOLD", 400);
          s.threshold = Number(arg);
        }
        if (command === "/auto" || command === "/duplicates") {
          if (!["on", "off"].includes(arg))
            throw new ProviderError("INVALID_SETTING", 400);
          if (command === "/auto") s.auto = arg === "on";
          else s.duplicates = arg === "on";
        }
        if (command === "/language") {
          if (arg !== "en" && arg !== "fa")
            throw new ProviderError("INVALID_LANGUAGE", 400);
          s.locale = arg;
        }
        await this.db.saveSettings(user, s);
        await this.telegram.send(chat, messages[s.locale].saved);
        return;
      }
      case "/playlist": {
        if (arg) {
          await this.playlist(user, arg);
          await this.telegram.send(chat, t.saved);
          return;
        }
        const conn = await this.connections.get(user);
        const lists = (
          await this.spotify.playlists(conn.token, conn.identity, 20)
        )
          .filter((p) => p.ownerId === conn.identity)
          .slice(0, 20);
        const actions = await this.db.callbacks(
          user,
          lists.map((p) => ({ kind: "playlist", id: p.id })),
        );
        const rows = lists.map((p, i) => [
          { text: p.name, callback_data: actions[i]! },
          { text: "Open Spotify", url: playlistUrl(p.id) },
        ]);
        await this.telegram.send(
          chat,
          t.playlist,
          { inline_keyboard: rows },
          true,
        );
        return;
      }
      case "/history":
      case "/pending": {
        const rows = await this.db.all<{
          id: string;
          state: string;
          metadata: string;
        }>(
          "SELECT id,state,metadata FROM audio_submissions WHERE user_id=? " +
            (command === "/pending"
              ? "AND state IN ('REVIEW_REQUIRED','METADATA_REQUIRED','REAUTH_REQUIRED','RECONCILIATION_REQUIRED') "
              : "") +
            "ORDER BY created_at DESC LIMIT 10",
          user,
        );
        if (!rows.length) {
          await this.telegram.send(chat, t.empty);
          return;
        }
        for (const row of rows) {
          if (["REVIEW_REQUIRED", "NO_MATCH"].includes(row.state))
            await this.review(user, row.id);
          else
            await this.telegram.send(
              chat,
              `${(JSON.parse(row.metadata) as Metadata).title ?? "?"} · ${row.state}`,
              {
                inline_keyboard: [
                  [
                    await this.button(user, t.retry, {
                      kind: "retry",
                      id: row.id,
                    }),
                    await this.button(user, t.cancelButton, {
                      kind: "cancel",
                      id: row.id,
                    }),
                  ],
                ],
              },
            );
        }
        return;
      }
      case "/stats": {
        const counts = await this.db.all<{ state: string; total: number }>(
          "SELECT state,COUNT(*) AS total FROM audio_submissions WHERE user_id=? GROUP BY state",
          user,
        );
        const operations = await this.db.all<{ manual: number; total: number }>(
          "SELECT p.manual,COUNT(*) AS total FROM playlist_operations p JOIN audio_submissions s ON s.id=p.submission_id WHERE s.user_id=? AND p.status='confirmed' GROUP BY p.manual",
          user,
        );
        await this.telegram.send(
          chat,
          [
            counts
              .filter(
                (r) => !["QUEUED", "PROCESSING", "SEARCHING"].includes(r.state),
              )
              .reduce((n, r) => n + r.total, 0),
            operations.find((r) => r.manual === 0)?.total ?? 0,
            operations.find((r) => r.manual === 1)?.total ?? 0,
            counts.find((r) => r.state === "ALREADY_EXISTS")?.total ?? 0,
            counts.find((r) => r.state === "REVIEW_REQUIRED")?.total ?? 0,
            counts.find((r) => r.state === "FAILED")?.total ?? 0,
            counts.find((r) => r.state === "NO_MATCH")?.total ?? 0,
          ]
            .map((count, i) => `${t.statistics[i]}: ${count}`)
            .join("\n"),
        );
        return;
      }
      case "/cancel": {
        const row = await this.db.one<{ value: string }>(
          "SELECT value FROM conversation_sessions WHERE user_id=?",
          user,
        );
        if (row) {
          const session = JSON.parse(row.value) as { submission: string };
          await this.action(user, chat, {
            kind: "cancel",
            id: session.submission,
          });
        } else await this.telegram.send(chat, t.empty);
        await this.db.run(
          "DELETE FROM conversation_sessions WHERE user_id=?",
          user,
        );
        return;
      }
      case "/search": {
        const [title, artist] = arg
          .split("|")
          .map((x) => x.trim().slice(0, 256));
        if (!title) throw new ProviderError("TITLE_REQUIRED", 400);
        await this.music.create(
          user,
          chat,
          m.message_id,
          { title, artist },
          `update-${update.update_id}`,
        );
        return;
      }
    }
    const row = await this.db.one<{ value: string }>(
      "SELECT value FROM conversation_sessions WHERE user_id=? AND expires_at>?",
      user,
      Date.now(),
    );
    if (row && text && text.length <= 513) {
      const session = JSON.parse(row.value) as {
        kind: string;
        submission: string;
      };
      const sub = await this.db.submission(session.submission, user);
      if (sub) {
        const metadata = JSON.parse(sub.metadata) as Metadata;
        if (session.kind === "title") metadata.title = text.slice(0, 256);
        else if (session.kind === "artist")
          metadata.artist = text.slice(0, 256);
        else {
          const [title, artist] = text.split("|").map((x) => x.trim());
          if (!title || !artist) {
            await this.telegram.send(chat, t.metadata);
            return;
          }
          metadata.title = title.slice(0, 256);
          metadata.artist = artist.slice(0, 256);
        }
        metadata.ambiguous = false;
        await this.requeue(user, sub.id, undefined, metadata);
      }
      await this.db.run(
        "DELETE FROM conversation_sessions WHERE user_id=?",
        user,
      );
      return;
    }
    await this.telegram.send(chat, t.help);
  }
}
