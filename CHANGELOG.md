# Changelog

## 0.1.0 — preview (prepared, not yet published)

Initial sanitized public-source candidate with the existing TypeScript/Hono application, D1 migrations, Queue/outbox recovery, deterministic bounded matching, bilingual review/settings, encrypted OAuth, optional duplicate scans, and uncertain-write reconciliation.

Includes credential-free mock development, synthetic demonstration/evaluation, tests, architecture/case study/ADRs, security/privacy and deployment documentation, and CI without deployment credentials. Current verification is in [the release report](docs/public-release-report.md).

Known limitations include Free HTTP CPU headroom, interactive latency, burst throttling/lock exhaustion, incomplete full user-data erasure, and client-dependent branding display. No qualified 100–500-track import workflow or unrestricted production readiness is claimed. See [installation](docs/development.md), [deployment prerequisites](docs/deployment.md), and [roadmap](docs/roadmap.md).
