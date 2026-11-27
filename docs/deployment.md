# Self-hosting deployment

Deployment is separate from local development. This repository supplies no hosted service, original owner's accounts, or credentials. v0.1.0 is a preview; unresolved [runtime acceptance](performance.md), bulk behavior, and [data deletion](privacy.md) prevent an unrestricted production-readiness claim. No public CI job deploys.

## Prerequisites

Use your own Cloudflare account and confirm Workers Free separately from any domain plan. Check [Workers](https://developers.cloudflare.com/workers/platform/limits/), [D1](https://developers.cloudflare.com/d1/platform/limits/), and [Queues](https://developers.cloudflare.com/queues/platform/limits/) quotas and your account's current usage. Do not enable paid services to follow this guide. Free resources are usable for controlled testing; the current HTTP CPU evidence does not establish adequate Free-plan headroom.

Create your own dedicated Telegram bot through BotFather. Keep its token private. Create a Spotify developer app under an eligible account; Development Mode has Premium-owner and allowlisted-user restrictions. Recheck [quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), current endpoint access, and [redirect requirements](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri). Configure the exact HTTPS callback YOUR_BASE_URL/oauth/callback; there is no trailing slash. Use a new private test playlist owned by the intended Spotify account.

## Operator sequence (remote mutations; not part of quick start)

1. Authenticate with npx wrangler login --use-keyring. Inspect your account, Workers plan, permissions, workers.dev subdomain, existing Workers/D1/Queues, resource-name collisions, and available usage read-only.
2. Explicitly approve provisioning in your own account. Replace every REPLACE value in wrangler.jsonc, use unique resource names, and keep PROCESSING_ENABLED=false, private owner access, and DEFAULT_AUTO_ADD_ENABLED=false. The zero database UUID is a local placeholder, not a real resource.
3. Provision your own D1 database, main Queue, and dead-letter Queue using the installed Wrangler CLI after reviewing its current help. Record only your own IDs in your private deployment configuration; do not submit them to this repository. Update both Queue producer/consumer and dead-letter names consistently.
4. Generate independent production webhook and AES-256 encryption secrets using an OS cryptographic generator. Store production values using npx wrangler secret put NAME --env production, which prompts without command-line values. Configure TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, SPOTIFY_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY. Never reuse .dev.vars or paste secrets into chat, issues, command arguments, or version control.
5. Run npm run config:validate; it must fail while placeholders remain. Run a production dry-run build. Review the resolved account/bindings before any actual deployment.
6. Apply migrations to your intended D1 remotely only after checking its identifier and backup/recovery plan. The local npm migration script deliberately uses --local; remote migration is a separate operator command with explicit --remote.
7. Deploy the paused Worker to your own account. Check /healthz and /readyz over HTTPS. Readiness confirms config and a database query, not provider authorization or CPU acceptance.
8. Verify the exact Spotify callback in the developer dashboard. Supply Telegram secrets through your secure shell/session. scripts/operations.mjs register requires --execute-remote; inspect verifies webhook configuration. Never print bot-token URLs. Register /telegram/webhook, not /oauth/callback.
9. Resume only owner allowlisted processing after review. Check /help, bilingual /settings, and auto-add OFF. Use /connect, authorize the intended Spotify identity, and Confirm in the original Telegram chat. Never share callback codes/URLs.
10. Select only the dedicated private empty test playlist after verifying its exact identity. Use read-only provider checks first. Initial writes require approval of that precise playlist and track; never test against unrelated playlists. Verify manual addition, duplicate behavior, and ambiguous review. Automatic testing requires a separate bounded approval and immediate return to OFF.
11. Capture sanitized Worker HTTP/Queue/cron CPU, wall latency, failures, retries, D1 usage, and resource quotas. Set explicit bounded test budgets. Do not equate successful replies with acceptable CPU headroom or bulk readiness.
12. Mark operational acceptance only after successful live OAuth, exact-destination mutation checks, provider behavior checks, rollback rehearsal, and runtime/resource gates. Otherwise retain preview status.

## Rollback and recovery

Pause ingestion/processing before changing versions. Inspect durable outbox, operation evidence, and unresolved sending/uncertain rows read-only. Roll back Worker code using your own reviewed prior version; database migration rollback is not automatic. Preserve a recoverable database export under private storage and test restoration separately. Never delete operation evidence or blindly resend uncertain Spotify writes. Do not rotate encryption keys without a token re-encryption/re-authentication plan. Removing a webhook can accumulate Telegram updates; deliberately choose backlog handling rather than dropping it accidentally. None of these remote actions runs from a public push.
