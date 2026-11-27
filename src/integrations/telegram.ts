import { z } from "zod";
import type { Telegram, Keyboard } from "./providers";
import { request, type Transport } from "./http";
import type { Metadata } from "../domain/model";
import { parseFilename } from "../matching/normalizer";
import { spotifyLogoBase64 } from "./spotify-logo";
const user = z.object({ id: z.number().int().positive() });
const media = z.object({
  file_id: z.string().max(512),
  file_unique_id: z.string().max(256),
  file_name: z.string().max(256).optional(),
  mime_type: z.string().max(128).optional(),
  file_size: z.number().nonnegative().optional(),
  title: z.string().max(256).optional(),
  performer: z.string().max(256).optional(),
  duration: z.number().nonnegative().optional(),
});
const message = z.object({
  message_id: z.number().int(),
  from: user.optional(),
  chat: z.object({ id: z.number().int(), type: z.string() }),
  text: z.string().max(2000).optional(),
  audio: media.optional(),
  document: media.optional(),
});
export const updateSchema = z.object({
  update_id: z.number().int().nonnegative(),
  message: message.optional(),
  callback_query: z
    .object({
      id: z.string().max(256),
      from: user,
      data: z.string().max(64).optional(),
      message: message.optional(),
    })
    .optional(),
});
export type Update = z.infer<typeof updateSchema>;
export function extractMetadata(update: Update): Metadata | null {
  const m = update.message;
  const a = m?.audio ?? m?.document;
  if (!a) return null;
  if (
    m?.document &&
    !/^audio\//.test(a.mime_type ?? "") &&
    !/\.(mp3|flac|wav|m4a|aac|opus|ogg)$/i.test(a.file_name ?? "")
  )
    return null;
  const parsed = a.file_name
    ? parseFilename(a.file_name)
    : { ambiguous: false };
  return {
    title: a.title || parsed.title,
    artist: a.performer || parsed.artist,
    durationSeconds: a.duration,
    fileId: a.file_id,
    fileUniqueId: a.file_unique_id,
    fileName: a.file_name,
    mimeType: a.mime_type,
    fileSize: a.file_size,
    ambiguous: (!a.title || !a.performer) && parsed.ambiguous,
  };
}
export class TelegramClient implements Telegram {
  constructor(
    private token: string,
    private timeout: number,
    private transport: Transport = fetch,
  ) {}
  async call(method: string, body: unknown) {
    const r = await request(
      this.transport,
      `https://api.telegram.org/bot${this.token}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      this.timeout,
    );
    z.object({ ok: z.literal(true) }).parse(r);
  }
  async send(
    chat: string,
    text: string,
    keyboard?: Keyboard,
    attribution = false,
  ) {
    if (attribution) {
      if (text.length > 1024)
        throw new Error("Spotify attribution caption exceeds Telegram limit");
      const form = new FormData();
      form.set("chat_id", chat);
      form.set("caption", text);
      if (keyboard) form.set("reply_markup", JSON.stringify(keyboard));
      form.set(
        "photo",
        new Blob(
          [Uint8Array.from(atob(spotifyLogoBase64), (c) => c.charCodeAt(0))],
          { type: "image/png" },
        ),
        "spotify-logo.png",
      );
      const r = await request(
        this.transport,
        `https://api.telegram.org/bot${this.token}/sendPhoto`,
        { method: "POST", body: form },
        this.timeout,
      );
      z.object({ ok: z.literal(true) }).parse(r);
      return;
    }
    await this.call("sendMessage", {
      chat_id: chat,
      text: text.slice(0, 4000),
      reply_markup: keyboard,
      link_preview_options: { is_disabled: true },
    });
  }
  async answer(id: string) {
    await this.call("answerCallbackQuery", { callback_query_id: id });
  }
}
