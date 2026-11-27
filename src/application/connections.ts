import { Database } from "../infrastructure/database";
import type { Config } from "../infrastructure/config";
import { decrypt, encrypt, hash, randomId } from "../infrastructure/security";
import type { Spotify, Tokens } from "../integrations/providers";
import { ProviderError } from "../integrations/providers";
interface Connection {
  encrypted: string;
  expires_at: number;
  spotify_id: string;
  version: number;
}
export class Connections {
  constructor(
    private db: Database,
    private c: Config,
    private spotify: Spotify,
  ) {}
  async begin(user: string) {
    const state = randomId() + randomId();
    const digest = await hash(state);
    await this.db.run(
      "DELETE FROM oauth_sessions WHERE user_id=? AND status!='confirmed'",
      user,
    );
    await this.db.run(
      "INSERT INTO oauth_sessions (state_hash,user_id,expires_at) VALUES (?,?,?)",
      digest,
      user,
      Date.now() + 600000,
    );
    return this.spotify.authorize(state);
  }
  async callback(state: string, code: string) {
    if (!/^[a-f0-9]{64}$/.test(state) || !code || code.length > 2048)
      throw new Error("Invalid authorization");
    const session = await this.db.one<{ user_id: string; state_hash: string }>(
      "UPDATE oauth_sessions SET status='exchanging' WHERE state_hash=? AND status='new' AND expires_at>? RETURNING user_id,state_hash",
      await hash(state),
      Date.now(),
    );
    if (!session) throw new Error("Expired or consumed authorization");
    const tokens = await this.spotify.exchange(code);
    const identity = await this.spotify.identity(tokens.access_token);
    const encrypted = await encrypt(
      tokens,
      this.c.TOKEN_ENCRYPTION_KEY,
      session.user_id,
    );
    await this.db.run(
      "UPDATE oauth_sessions SET status='pending',encrypted=?,spotify_id=? WHERE state_hash=?",
      encrypted,
      identity.id,
      session.state_hash,
    );
    return {
      user: session.user_id,
      identity: identity.id,
      stateHash: session.state_hash,
    };
  }
  async confirm(user: string, stateHash: string) {
    // Atomic insert+consume: the connection remains inactive until this Telegram-owned action.
    const now = Date.now();
    const results = await this.db.db.batch([
      this.db.stmt(
        "INSERT INTO spotify_connections (user_id,spotify_id,encrypted,expires_at) SELECT user_id,spotify_id,encrypted,0 FROM oauth_sessions WHERE state_hash=? AND user_id=? AND status='pending' AND expires_at>? ON CONFLICT(user_id) DO UPDATE SET spotify_id=excluded.spotify_id,encrypted=excluded.encrypted,expires_at=0,version=spotify_connections.version+1,refresh_lease=0",
        stateHash,
        user,
        now,
      ),
      this.db.stmt(
        "UPDATE oauth_sessions SET status='confirmed',encrypted=NULL WHERE state_hash=? AND user_id=? AND status='pending' AND expires_at>?",
        stateHash,
        user,
        now,
      ),
    ]);
    return (results[0]?.meta.changes ?? 0) > 0;
  }
  async get(user: string): Promise<{ token: string; identity: string }> {
    const row = await this.db.one<Connection>(
      "SELECT * FROM spotify_connections WHERE user_id=?",
      user,
    );
    if (!row) throw new ProviderError("REAUTH_REQUIRED", 401);
    const tokens = await decrypt<Tokens>(
      row.encrypted,
      this.c.TOKEN_ENCRYPTION_KEY,
      user,
    );
    if (row.expires_at > Date.now() + 60000)
      return { token: tokens.access_token, identity: row.spotify_id };
    const lock = await this.db.run(
      "UPDATE spotify_connections SET refresh_lease=? WHERE user_id=? AND version=? AND refresh_lease<?",
      Date.now() + 60000,
      user,
      row.version,
      Date.now(),
    );
    if (!lock.meta.changes) throw new ProviderError("REFRESH_BUSY", 429, 5);
    try {
      const fresh = await this.spotify.refresh(tokens.refresh_token);
      const encrypted = await encrypt(
        { ...fresh, scope: fresh.scope ?? tokens.scope },
        this.c.TOKEN_ENCRYPTION_KEY,
        user,
      );
      const saved = await this.db.run(
        "UPDATE spotify_connections SET encrypted=?,expires_at=?,version=version+1,refresh_lease=0 WHERE user_id=? AND version=?",
        encrypted,
        Date.now() + fresh.expires_in * 1000,
        user,
        row.version,
      );
      if (!saved.meta.changes) throw new ProviderError("REAUTH_REQUIRED", 401);
      return { token: fresh.access_token, identity: row.spotify_id };
    } catch (e) {
      await this.db.run(
        "UPDATE spotify_connections SET refresh_lease=0 WHERE user_id=? AND version=?",
        user,
        row.version,
      );
      if (e instanceof ProviderError && [400, 401].includes(e.status)) {
        await this.db.run(
          "DELETE FROM spotify_connections WHERE user_id=? AND version=?",
          user,
          row.version,
        );
        throw new ProviderError("REAUTH_REQUIRED", 401);
      }
      throw e;
    }
  }
  async invalidate(user: string) {
    await this.db.run(
      "UPDATE spotify_connections SET expires_at=0 WHERE user_id=?",
      user,
    );
  }
  async disconnect(user: string) {
    await this.db.db.batch([
      this.db.stmt("DELETE FROM spotify_connections WHERE user_id=?", user),
      this.db.stmt("DELETE FROM oauth_sessions WHERE user_id=?", user),
      this.db.stmt("DELETE FROM playlists WHERE user_id=?", user),
      this.db.stmt("DELETE FROM conversation_sessions WHERE user_id=?", user),
      this.db.stmt("DELETE FROM callback_actions WHERE user_id=?", user),
      this.db.stmt(
        "DELETE FROM match_candidates WHERE submission_id IN (SELECT id FROM audio_submissions WHERE user_id=?)",
        user,
      ),
    ]);
    const s = await this.db.settings(user);
    delete s.playlist;
    delete s.playlistName;
    await this.db.saveSettings(user, s);
  }
}
