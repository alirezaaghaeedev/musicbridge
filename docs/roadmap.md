# Roadmap

## Implemented in the preview

- Metadata matching with Unicode normalization, safety thresholds, and computation budgets.
- OAuth encryption/confirmation/refresh coordination; private owner mode.
- Durable ingestion/outbox, idempotency, leases, bounded retries, uncertain-write reconciliation.
- Bilingual settings, manual review, optional automatic addition and duplicate scans.
- Mock providers, synthetic evaluation, regression suites, local migrations and build.

## Planned (not implemented)

- Account-wide provider rate scheduling and lock-aware retry timing.
- Persistent batch progress and explicit pause/resume controls.
- Complete user-data deletion compatible with outstanding mutation evidence.
- Expanded matching evaluation using authorized, representative metadata.

## Under investigation

- Free HTTP CPU headroom and interactive fast paths.
- Bulk import readiness and recovery after exhausted attempts.
- Client-independent attribution presentation and conditional Spotify availability fields.

No delivery dates, qualified 100–500-track workflow, or throughput commitments are implied. Packaging this repository does not implement these items.
