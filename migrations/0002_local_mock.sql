-- These tables are used exclusively by APP_MODE=mock; production never reads them.
CREATE TABLE mock_playlist_items (playlist_id TEXT NOT NULL, track_id TEXT NOT NULL, PRIMARY KEY(playlist_id,track_id));
CREATE TABLE mock_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, text TEXT NOT NULL, keyboard TEXT);
