# MusicBridge: conservative automation across unreliable boundaries

## Problem and constraints

Moving tracks shared through Telegram into Spotify repeatedly requires extracting metadata, searching, checking the recording version, and choosing a playlist. The project automates that path while asking for review when metadata is insufficient. It works from metadata; audio fingerprinting was not implemented.

The design must handle duplicate webhook delivery, unreliable external requests, incomplete multilingual text, provider quotas, secure OAuth credentials, and strict serverless CPU budgets. Free-tier hosting was a constraint, not evidence that every implemented path fits that tier. Development was AI-assisted; the project owner directs scope, reviews decisions, and accepts the result. This account does not imply sole unaided authorship or production scale that was not measured.

## Design and reasoning

Workers/Hono provide a small HTTP entry point and asynchronous execution without an always-on server. D1 provides relational constraints, transactional batches, and durable state. Queues carry references to outbox jobs rather than being the only record of accepted work. This separates durable acceptance from provider completion: a committed submission survives a failed queue publication, and duplicate queue deliveries can be claimed safely.

The matcher is deterministic so decisions can be explained, evaluated locally, and bounded without an AI service or sending user metadata to another processor. Title, artist, duration, recording-version compatibility, and a distinct-recording margin jointly gate automatic selection. A high title score alone is insufficient. Manual review remains a first-class result, not an error to suppress.

Explicit submission and playlist-operation states record what was attempted. D1 cannot commit atomically with Spotify, so the mutation protocol persists sending evidence before POST and reconciles uncertain outcomes by readback. This favors avoiding blind duplicate writes over always completing a track. [Architecture](architecture.md) and [retrospective ADRs](adr/README.md) describe the implemented boundaries and alternatives.

## Challenges actually encountered

OAuth needed more than an authorization redirect. Hashed expiring state, one-time claims, encrypted pending tokens, Telegram identity confirmation, refresh leases, and token versions protect different boundaries. Authenticated encryption protects storage while leaving runtime-key compromise in the threat model.

Provider errors needed structured handling. Ordinary 429 responses use Retry-After and bounded retries; a recognized QUOTA_EXCEEDED code is retained and stops pointless retries. Missing is_playable is unknown, not false or true. Unknown availability blocks automatic action and may prevent a manual write. These policies avoid silently expanding confidence when provider fields change.

Duplicate scans are bounded and fail closed when incomplete. The optional scan switch permits duplicates when the owner chooses it, while replay deduplication and uncertain-write reconciliation remain active. Settings captured on ingestion explain why changing the current setting does not repair an older failed job automatically.

A runtime incompatibility appeared when workerd rejected redirect:error in provider fetches. The implementation now uses manual redirects and rejects unexpected 3xx responses, with native-runtime 200/302/307 regression coverage. Passing Node tests alone had not established runtime compatibility.

A pathological local matcher case took roughly 4.9 seconds. Reusing normalization, artist profiles, and distance comparisons reduced repeated work; rolling rows and prefix/suffix trimming reduced comparison cost. Explicit budgets capped candidates, input size, profile/comparison count, and DP cells. On exhaustion, automatic selection is disabled. The adversarial after measurement is a safe review fallback, not an equivalent full-workload speed claim.

HTTP CPU and interactive latency remain unresolved. Durable D1 operations, asynchronous queue hops, refresh/search/scan requests, and serialized work all affect the experience. Controlled captures exceeded the Free HTTP allowance even when responses succeeded. Later bursts exposed provider throttling, playlist lock contention, and exhausted attempts. An account-wide limiter, durable batch progress, and bulk scheduling were not implemented for this release.

## Evidence and limits

The prior engineering baseline recorded 192 passing tests and 89.23% line coverage. The 64-case synthetic evaluation yielded 12 correct automatic selections, zero incorrect automatic selections, 41 reviews, and 11 unmatched cases, with no fixture safety false positives/negatives. These are synthetic regression counts, not real-world matching accuracy. Current candidate checks appear separately in [the release report](public-release-report.md).

Controlled live checks established real OAuth confirmation, bilingual settings, playlist discovery, exact matching, typo review, metadata correction, a manual add, duplicate detection, and one separately approved automatic add against a dedicated private test playlist. No private identifiers, audio, provider dumps, or raw telemetry are included here. These bounded checks did not establish large-batch throughput or unrestricted production readiness.

[Performance](performance.md) separates local Node timing, workerd process CPU, and Cloudflare invocation captures. The ordinary-typo local median improved from 10.4941 to 1.4506 ms; the long-many-artist case changed from 4869.8808 to a 2.6202 ms bounded review fallback. Thirty-four command captures had median CPU 6 ms and maximum 31 ms; ten exceeded 10 ms. Capture/network gaps prevent reliable latency percentiles.

## Lessons

A successful reply is weaker evidence than a measured runtime acceptance gate. Retryability must distinguish transport, quota, contention, and uncertainty; the same backoff cannot solve all four. Durable state removes loss windows but introduces recovery and privacy obligations. Conservative matching can preserve safety by declining automation rather than approximating a result under a tight CPU budget. A useful portfolio should expose these trade-offs and unresolved work, not rename them production readiness.
