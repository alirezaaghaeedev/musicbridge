import type { Track } from "../domain/model";
export interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}
export interface Playlist {
  id: string;
  name: string;
  ownerId: string;
  collaborative: boolean;
}
export interface Spotify {
  authorize(state: string): string;
  exchange(code: string): Promise<Tokens>;
  refresh(token: string): Promise<Tokens>;
  identity(token: string): Promise<{ id: string }>;
  search(token: string, query: string): Promise<Track[]>;
  playlists(
    token: string,
    ownerId?: string,
    limit?: number,
  ): Promise<Playlist[]>;
  playlist(token: string, id: string): Promise<Playlist>;
  contains(token: string, id: string, track: string): Promise<boolean>;
  add(token: string, id: string, uri: string): Promise<string>;
}
export type Keyboard = {
  inline_keyboard: Array<
    Array<{ text: string; callback_data?: string; url?: string }>
  >;
};
export interface Telegram {
  send(
    chat: string,
    text: string,
    keyboard?: Keyboard,
    attribution?: boolean,
  ): Promise<void>;
  answer(id: string): Promise<void>;
}
export class ProviderError extends Error {
  constructor(
    public code: string,
    public status = 0,
    public retryAfter = 0,
    public uncertain = false,
    public providerCode?: string,
  ) {
    super(code);
  }
  get retryable() {
    return (
      this.code !== "QUOTA_EXCEEDED" &&
      (this.status === 429 || this.status >= 500 || this.status === 0)
    );
  }
}
