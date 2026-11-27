import type {
  Spotify,
  Telegram,
  Tokens,
  Playlist,
  Keyboard,
} from "./providers";
import type { Track } from "../domain/model";
export const syntheticTracks: Track[] = [
  {
    id: "AAAAAAAAAAAAAAAAAAAAAA",
    uri: "spotify:track:AAAAAAAAAAAAAAAAAAAAAA",
    title: "Northern Lights",
    artists: ["Example Artist"],
    album: "Synthetic Album",
    durationMs: 240000,
    available: true,
    isrc: "SYNTHETIC001",
  },
  {
    id: "BBBBBBBBBBBBBBBBBBBBBB",
    uri: "spotify:track:BBBBBBBBBBBBBBBBBBBBBB",
    title: "Northern Lights (Live)",
    artists: ["Example Artist"],
    durationMs: 260000,
    available: true,
  },
  {
    id: "CCCCCCCCCCCCCCCCCCCCCC",
    uri: "spotify:track:CCCCCCCCCCCCCCCCCCCCCC",
    title: "Distant Shore",
    artists: ["Example Artist"],
    durationMs: 200000,
    available: true,
  },
  {
    id: "DDDDDDDDDDDDDDDDDDDDDD",
    uri: "spotify:track:DDDDDDDDDDDDDDDDDDDDDD",
    title: "Distant Shore",
    artists: ["Example Artist"],
    durationMs: 201000,
    available: true,
  },
];
// Local mock playlist state is persisted in the same D1 database, never module memory.
export class MockSpotify implements Spotify {
  constructor(
    private db: D1Database,
    private base: string,
  ) {}
  authorize(state: string) {
    return `${this.base}/oauth/callback?state=${encodeURIComponent(state)}&code=synthetic-code`;
  }
  async exchange(): Promise<Tokens> {
    return {
      access_token: "synthetic-access",
      refresh_token: "synthetic-refresh",
      expires_in: 3600,
    };
  }
  async refresh(): Promise<Tokens> {
    return this.exchange();
  }
  async identity() {
    return { id: "synthetic-owner" };
  }
  async search(_token: string, query: string) {
    return syntheticTracks.filter(
      (t) =>
        query
          .toLowerCase()
          .includes(t.title.replace(/ \(Live\)/, "").toLowerCase()) ||
        query.toLowerCase().includes("example artist"),
    );
  }
  async playlists() {
    return [await this.playlist("", "PPPPPPPPPPPPPPPPPPPPPP")];
  }
  async playlist(_token: string, id: string): Promise<Playlist> {
    return {
      id,
      name: "Synthetic Playlist",
      ownerId: "synthetic-owner",
      collaborative: false,
    };
  }
  async contains(_token: string, id: string, track: string) {
    return !!(await this.db
      .prepare(
        "SELECT 1 FROM mock_playlist_items WHERE playlist_id=? AND track_id=?",
      )
      .bind(id, track)
      .first());
  }
  async add(_token: string, id: string, uri: string) {
    await this.db
      .prepare("INSERT OR IGNORE INTO mock_playlist_items VALUES (?,?)")
      .bind(id, uri.split(":")[2])
      .run();
    return "synthetic-snapshot";
  }
}
export class MockTelegram implements Telegram {
  constructor(private db: D1Database) {}
  async send(
    chat: string,
    text: string,
    keyboard?: Keyboard,
    attribution = false,
  ) {
    await this.db
      .prepare(
        "INSERT INTO mock_messages (chat_id,text,keyboard) VALUES (?,?,?)",
      )
      .bind(
        chat,
        `[MOCK] ${attribution ? "[Spotify logo] " : ""}${text}`,
        keyboard ? JSON.stringify(keyboard) : null,
      )
      .run();
  }
  async answer() {}
}
