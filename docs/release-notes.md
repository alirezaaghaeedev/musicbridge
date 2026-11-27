# v0.1.0 preview — release draft

Prepared for initial public release; no tag or release has been published yet.

MusicBridge implements metadata-based Telegram-to-Spotify matching, English/Persian settings and review, encrypted/confirmed OAuth, durable D1 outbox and Queue processing, replay protection, bounded duplicate checks, and uncertain-write reconciliation. Run the [credential-free local workflow](development.md) before configuring your own accounts through [deployment](deployment.md).

See [the verification report](public-release-report.md) for actual candidate results and [performance](performance.md) for sanitized historical measurements. The 64-case synthetic evaluation is not real-world accuracy. Free HTTP CPU acceptance, interactive latency, large-batch readiness, complete deletion, and client-wide attribution display remain unresolved. This preview is not a stable or unrestricted production release. [Roadmap](roadmap.md) lists follow-up work.

The owner confirmed MIT licensing for original code; third-party rights remain separate. No credentials, databases, raw logs, recordings, or private deployment configuration are release artifacts.

## Verified private staging baseline

[CI for the approved source commit](https://github.com/alirezaaghaeedev/musicbridge/actions/runs/45955374499) passed on GitHub-hosted Ubuntu: 192 tests across 11 files, 87.35% line coverage, 64 matching scenarios with zero incorrect automatic choices, migrations, mock demo, lint/format/types, links/privacy guards, dry-run build, dependency audit, and tree/history secret scans. The baseline test suite took 43.67 seconds on that runner; this is not production processing latency. No production credentials were provided. CodeQL was deliberately skipped while private; it is not a completed code-scanning result.

This local documentation follow-up corrects a Mermaid sequence-diagram parsing error and updates staging/license status. Its own remote CI must pass after owner approval to push it. No tag, release, public visibility change, or external announcement has been published.
