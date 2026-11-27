# Performance and reliability evidence

These are sanitized historical engineering measurements, not a fresh production qualification. This publication task performs no production load tests. Current isolated verification appears in [the release report](public-release-report.md).

## Local matcher optimization

Historical local Node.js median milliseconds, three runs per case, 40 candidates:

| Case                             |    Before |  After | Interpretation                        |
| -------------------------------- | --------: | -----: | ------------------------------------- |
| Ordinary typo                    |   10.4941 | 1.4506 | Cached/trimmed comparison             |
| Maximum 256-character values     |  467.9885 | 2.0118 | Reused normalization and bounded work |
| 256 characters × 30 artist parts | 4869.8808 | 2.6202 | Budget-limited review fallback        |
| Distinct adversarial values      | 2250.6189 | 2.8173 | Budget-limited review fallback        |

The last two after cases intentionally stop incomplete comparison and require review. They are not equivalent full-workload acceleration claims. These are local wall timings, not Cloudflare CPU. Caches, rolling rows, prefix/suffix trimming, and submission-wide budgets preserve the existing 64-case decisions.

Historical workerd aggregate process CPU fell from 19.53 to 13.28 ms for warm command work, 26.95 to 10.16 for audio, and 38.67 to 23.83 for populated recovery. Emulator/inspector overhead and cold variability prevent treating these as per-invocation production CPU.

## Controlled Cloudflare captures

| Route group             | Captures | Median CPU ms | Maximum CPU ms |
| ----------------------- | -------: | ------------: | -------------: |
| Fresh scripted commands |       34 |             6 |             31 |
| Scheduled recovery      |       10 |             5 |             12 |
| Queue consumers         |       38 |             6 |             33 |

Seventeen command captures exceeded 7 ms; ten exceeded 10 ms. A tiny real-owner sample showed command 15 ms, callback 3 ms, audio 10 ms. Network interruptions and missing isolate identity prevent reliable p95/p99 estimates. Captured invocations were reported successful; no captured CPU/memory-limit error is not evidence that no uncaptured error occurred.

[Workers limits](https://developers.cloudflare.com/workers/platform/limits/) distinguish the Free HTTP/cron CPU allowance of 10 ms from Queue consumer execution. [Queue consumer settings](https://developers.cloudflare.com/queues/configuration/consumer-concurrency/) and [limits](https://developers.cloudflare.com/queues/platform/limits/) must be rechecked before hosting; the default consumer CPU limit is 30 seconds. Waiting for providers is not CPU time. HTTP acceptance remains unresolved despite successful bounded live paths.

## Latency, bursts, and provider limits

Acknowledgement after D1 commit and asynchronous Queue hops add latency; refresh, multiple searches, duplicate pagination, retries, and lock contention can add seconds. Ordinary provider 429 responses respect Retry-After; machine-coded QUOTA_EXCEEDED stops unnecessary retries. There is no account-wide provider limiter. Playlist locks and bounded attempts have exhausted retries during normal user bursts. One active metadata correction session per owner complicates bulk submission.

Duplicate scans use 50-item pages, five pages by default, up to eight configured pages. An incomplete scan fails closed. Turning the scan off permits duplicate tracks but does not remove uncertainty reconciliation. Pending jobs retain captured settings.

No 100–500-track sequential-import readiness, throughput SLA, or stable latency percentile is established. Future work includes rate scheduling, progress tracking, pause/resume, lock-aware scheduling, and HTTP headroom. These are [roadmap items](roadmap.md), not implemented guarantees.
