# Provider and branding review

Reviewed against official documentation on 2026-11-27. This is an engineering review, not legal certification. Self-hosters must review current agreements and app permissions themselves. MusicBridge is independent and has no official affiliation or endorsement.

## Spotify

The [Developer Terms](https://developer.spotify.com/terms) distinguish the developer's application from Spotify-owned material. The repository's proposed MIT license covers original code only; it grants no rights to Spotify marks, data, recordings, or accounts. See [third-party notices](../THIRD_PARTY_NOTICES.md).

The [Developer Policy](https://developer.spotify.com/policy) requires transparent user authorization and data handling. The incomplete full-deletion mechanism described in [privacy](privacy.md) is an unresolved concern for a public hosted service. Disconnect is not advertised as complete erasure. This application handles metadata and playlist operations, not music streaming or redistributed recordings.

[Design guidelines](https://developer.spotify.com/documentation/design) require attributable Spotify content and links. Candidate, playlist, and successful-operation cards include Spotify links and the supplied full green logo. The official logo is unchanged and is not MusicBridge's logo. Telegram controls client sizing, previews, accessibility behavior, and cropping, so universal display/clear-space compliance across clients cannot be guaranteed. A controlled client check observed working links and visible attribution; that is limited evidence, not certification.

[Development Mode](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) is restricted: the app owner needs an eligible Premium account and users must satisfy the app's current allowlist/access rules. Self-hosting requires each operator's own app, redirect, credentials, and approved users. Missing is_playable is represented as unknown. Endpoint behavior must be checked read-only for the operator's account/market before enabling writes; do not infer broad availability from a single account's result.

## Telegram

The [Bot Developer Terms](https://telegram.org/tos/bot-developers) and [Bot API](https://core.telegram.org/bots/api) govern each operator's bot. Keep tokens private, explain data processing, avoid unsolicited messaging, and respect rate limits. The implementation authenticates webhooks and restricts private-mode access, but these measures do not replace an operator's compliance obligations.

## Remaining checks

Before a public hosted rollout: verify complete deletion, privacy communication, allowed Spotify usage/account mode, all client attribution displays, current scope/endpoint behavior, and provider request limits. Publishing source alone does not resolve these service-acceptance gates.
