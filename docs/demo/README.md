# Actual mock demonstration

Run npm run demo:local to exercise real Hono HTTP and exported Queue handlers against isolated local D1 and synthetic providers. The existing assertions cover OAuth identity confirmation, a selected synthetic playlist, an automatic exact match, duplicate prevention, ambiguous review, manual selection, and two resulting synthetic playlist entries.

Run npm run demo:export to reproduce transcript.json and index.html from that same passing test, then additional actual /settings, /playlist, Persian /start and /settings, and language-switch commands. No real provider calls occur. Only message text, visible button labels, and synthetic open.spotify.com links are exported; OAuth links/state, callback payloads, chat IDs, timestamps, and database files are omitted. Mock links contain deliberately nonexistent repeated-character IDs.

Open index.html locally to read the full transcript. mock-demo.png is a browser rendering of this viewer, not a screenshot of Telegram. It shows actual synthetic bot output in its original order with our own layout. The [Spotify logo] text is the mock adapter's attribution marker, not a claim that an image was sent by Telegram. No music recording or album artwork is bundled.

Screenshot generation is a maintainer presentation step using a local headless browser; the core demo and transcript export do not require browser dependencies. The publication preflight records which generated assets were inspected.
