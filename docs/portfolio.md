# Portfolio materials

These are drafts for the owner to review. No adoption, revenue, traffic scale, sole unaided authorship, or completed public launch is implied. Development was AI-assisted; describe responsibilities you personally directed and reviewed accurately. Replace a future repository link only after publication.

## Resume: one line

MusicBridge — AI-assisted TypeScript serverless Telegram-to-Spotify assistant with deterministic matching, durable asynchronous processing, and encrypted OAuth.

## Resume: three engineering bullets

- Directed and reviewed an event-driven Workers/D1/Queues application with atomic ingestion, durable outbox recovery, replay protection, and external-write reconciliation.
- Developed and verified conservative multilingual metadata matching with explicit availability/version gates and computational budgets; the 64-case synthetic regression set records zero incorrect automatic choices.
- Investigated runtime compatibility, provider throttling, and pathological matching cost; documented measured Free HTTP CPU and bulk-processing limits instead of claiming unrestricted production readiness.

Use “directed and reviewed” only to the extent it reflects your actual role. Current candidate test counts belong in the release report, not as an unverified resume metric.

## Resume: detailed technical description

MusicBridge is a TypeScript/Hono assistant that transfers Telegram audio metadata into Spotify playlist operations. It uses Cloudflare Workers, D1, and Queues; encrypted, identity-confirmed OAuth; deterministic title/artist/duration/version matching; captured settings; conservative manual/automatic decisions; bounded duplicate scanning; and durable mutation evidence for uncertain outcomes. The project includes mock-mode end-to-end tests and a synthetic matching evaluation. Controlled live checks exercised real integrations, while CPU headroom, latency, bulk scheduling, and complete data erasure remain open. Built with AI assistance under owner direction and review.

## LinkedIn Projects description

MusicBridge explores reliable automation across Telegram, Spotify, and a constrained serverless runtime. Its engineering focus is durable acceptance, auditable matching, secure authorization, and safe recovery when external writes have uncertain outcomes. The preview includes reproducible mock development, regression tests, architecture decisions, and an evidence-based case study. I directed and reviewed AI-assisted development and documented the operational limits found during controlled deployment. Link the approved public repository when available.

## GitHub profile introduction

MusicBridge: a TypeScript serverless music assistant exploring conservative matching, secure OAuth, durable queues, and failure recovery. Includes a reproducible mock demo and candid performance/operational findings. AI-assisted, owner-directed development.

## Interview preparation

| Question                             | Grounded answer and likely follow-up                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Why serverless?                      | Avoid an always-on process and use HTTP/Queue/cron boundaries. Follow-up: strict Free HTTP CPU and D1/network latency remain costs; it is not automatically the best large-scale architecture.                                                   |
| Why Queue plus outbox?               | D1 and Queue cannot commit together. Persist the job with accepted state, publish references, recover due rows. Follow-up: duplicate delivery is expected, so claims and durable status are still needed.                                        |
| How are duplicates prevented?        | Replay IDs, atomic ingestion, job claims, user/submission leases, playlist operation locks, and optional playlist scanning solve different layers. Follow-up: disabling scan permits pre-existing duplicates but does not disable replay safety. |
| Why not exactly-once Spotify writes? | Spotify POST and D1 state have no shared transaction. Persist sending evidence and reconcile uncertain outcomes; never blindly assume timeout means failure. Follow-up: readback presence proves end state, not causal attribution.              |
| How are provider limits handled?     | Preserve recognized error codes, respect Retry-After, bounded retry/backoff, terminal quota handling. Follow-up: account-wide scheduling and bulk-aware backpressure are not implemented.                                                        |
| How are credentials protected?       | Hashed single-use expiring OAuth state, identity confirmation, AES-GCM token encryption bound to the user, refresh leases/versioning, secrets outside Git. Follow-up: runtime/key compromise and full deletion remain separate concerns.         |
| How does matching work?              | Normalize Unicode metadata, rank title/artist/duration with version compatibility and distinct-recording margins, then enforce gates. Follow-up: similarity is not probability and unknown playability blocks automation.                        |
| What improved algorithm cost?        | Cache profiles/comparisons across searches, rolling DP rows, prefix/suffix trimming, and aggregate budgets. Follow-up: adversarial bounded results force review; they are not equivalent complete-workload acceleration.                         |
| How were production limits found?    | Separate local timings, emulator process CPU, and captured HTTP/Queue/cron CPU. Follow-up: capture gaps prevent reliable percentiles; successful responses did not settle headroom.                                                              |
| What changes at scale?               | Evaluate account-wide quota scheduling, lock-aware delayed work, durable batch progress, pause/resume, data deletion, HTTP fast paths, and representative load tests. Follow-up: these are proposals, not implemented capabilities.              |

Be ready to walk through real source/tests and explain an unresolved failure mode. Do not claim authorship of AI-generated details you cannot explain.

## LinkedIn announcement draft — publish only after launch

I’m sharing MusicBridge, a v0.1.0 preview of an event-driven Telegram-to-Spotify assistant built with TypeScript and Cloudflare Workers, D1, and Queues. The repository includes conservative metadata matching, encrypted OAuth, durable processing, a credential-free mock demo, and an engineering case study. It also documents the limits found during controlled live testing, including HTTP CPU headroom and bulk-processing behavior. Development was AI-assisted under my direction and review. Feedback on the architecture, failure handling, and evaluation approach is welcome. [Add the verified public repository link after approval.]

## GitHub profile recommendations

Pin MusicBridge after publication; link the case study and mock demo. Keep your profile role and skills specific to work you can discuss. Describe the project as a preview, retain AI-assistance disclosure, and avoid badges for CI or release states that have not happened. A short architecture walkthrough is more useful than an unsupported production-scale claim.
