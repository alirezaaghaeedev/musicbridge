# Data and privacy

MusicBridge is self-hosted software. Each operator is responsible for its deployment, privacy notice, retention controls, lawful processing, and provider obligations. This repository distributes synthetic fixtures, not the original owner's data or accounts.

The application stores Telegram user/chat/message and replay identifiers, submitted title/artist/duration/filename metadata, settings and destination snapshots, matching candidates, playlist operation evidence, jobs, and temporary conversation/callback state in D1. It does not download or store the audio recording. Spotify identity, scopes, and encrypted access/refresh tokens are stored for authorized operation. Mock mode stores synthetic messages and playlist entries locally.

Tokens use authenticated encryption; access to the runtime key still grants decryption capability. Logs intentionally allow only selected scalar diagnostics rather than raw updates, tokens, OAuth codes/state, filenames, or provider bodies. Operators must also review platform logs, backups, exports, and access permissions.

Retention defaults to 30 days for supported cleanup paths; ephemeral state has separate expiry rules. This is not a universal guarantee that every user identifier or operational record is erased after that period. /disconnect removes connection authorization, temporary state, and selected destination, but does not implement complete account erasure across all submissions, replay protection, operation history, or backups. Automated full deletion and its interaction with replay/uncertain-write evidence remain unresolved.

Before offering a service to other people, establish and verify a complete deletion procedure, a published privacy notice and contact route, retention policy, and provider-policy compliance. Do not describe /disconnect as full erasure. Public-source release is not certification of a compliant public hosted service. See [provider review](provider-compliance.md).
