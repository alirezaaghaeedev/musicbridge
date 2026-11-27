# Architecture

This describes the implemented preview, not a proposed scaling design. Hono routes live in src/index.ts; application orchestration in src/application; persistence/configuration/security in src/infrastructure; pure models in src/domain and scoring in src/matching; provider adapters in src/integrations; bilingual messages and cards in src/presentation.

## Context and components

```mermaid
flowchart TB
  Owner[Telegram user] --> Telegram[Telegram Bot API]
  Telegram --> HTTP[Hono HTTP routes]
  HTTP --> Dispatcher[Dispatcher: validate and ingest]
  Dispatcher --> DB[(D1: state and outbox)]
  Dispatcher --> Queue[Cloudflare Queue: job references]
  Queue --> Runtime[Runtime: claim and process]
  Runtime --> Music[Music and matching]
  Runtime --> Connections[OAuth connections]
  Music --> Spotify[Spotify Web API]
  Connections --> Spotify
  Runtime --> Notify[Telegram notifications]
  Notify --> Telegram
  Cron[Scheduled Dispatcher recovery] --> DB
  Cron --> Queue
```

Domain code does not call providers. Application services enforce decisions and state transitions. Infrastructure supplies transactions, encryption, leases, configuration, and structured logging. Adapters preserve relevant provider codes without persisting raw error bodies. Presentation supplies Persian/English messages and Spotify attribution.

## Telegram ingestion

```mermaid
sequenceDiagram
  participant T as Telegram
  participant H as HTTP handler
  participant D as D1
  participant Q as Queue
  T->>H: POST /telegram/webhook with secret header
  H->>H: Bound body to 32768 bytes, authenticate, validate update
  H->>D: Atomic user/settings, replay ID, submission snapshot, outbox job
  D-->>H: Durable commit
  H-->>T: 200 acknowledgement
  H->>Q: Best-effort publish exact new job (waitUntil)
  Note over H,Q: Failed publish is recoverable from D1, duplicate delivery creates no new job
```

Processing pause returns 503 after authentication. Private access restricts ingestion to the allowlisted owner. Acknowledgement guarantees durable ingestion, not successful provider delivery.

## Queue, retries, and recovery

```mermaid
flowchart TD
  Durable[Pending outbox row] --> Publish[Publish due job ID]
  Publish --> Q[Queue delivery]
  Q --> Claim{Claim succeeds?}
  Claim -->|no| Skip[Do not process duplicate claim]
  Claim -->|yes| Execute[Runtime service under user/submission lease]
  Execute -->|success| Done[Mark done; enqueue notifications durably]
  Execute -->|retryable| Delay[Persist bounded backoff and next attempt]
  Delay --> Durable
  Execute -->|terminal or attempts exhausted| Dead[Dead job / submission failure]
  Cron[Five-minute cron] --> Recover[Recover due rows and cleanup]
  Recover --> Durable
```

Queue messages carry job references; D1 is the source of truth. Application claims have a 15-minute lease and at most five attempts. Queue transport also has its own retry/dead-letter policy. Recovery republishes due work, not a guarantee of eventual success. User/submission and playlist locks serialize unsafe overlaps but can increase latency and exhaust attempts under bursts. There is no global provider-rate scheduler.

## OAuth

```mermaid
sequenceDiagram
  participant U as Owner in Telegram
  participant B as Bot
  participant D as D1
  participant S as Spotify
  U->>B: /connect
  B->>D: Store hashed, expiring CSRF state
  B-->>U: Authorization link
  U->>S: Explicit authorization
  S->>B: GET /oauth/callback with code and state
  B->>D: Claim state once
  B->>S: Exchange code and read identity
  B->>D: Store encrypted pending tokens bound to Telegram user
  B-->>U: Confirm identity button
  U->>B: Confirm from original Telegram identity
  B->>D: Activate encrypted connection
```

State expires after ten minutes. AES-256-GCM protects tokens at rest; it does not protect against a compromised runtime/key. Refresh uses a lease and token version to avoid concurrent replacement. Missing scopes on refresh retain the established scopes. Secrets are configured outside the repository.

## Matching and decision paths

```mermaid
flowchart TD
  Audio[Telegram audio metadata] --> Parse[Extract and normalize]
  Parse --> Missing{Missing or ambiguous metadata?}
  Missing -->|yes| Correct[Ask for title and artist]
  Correct --> Parse
  Missing -->|no| Search[Progressive Spotify searches]
  Search --> Rank[Bounded deterministic ranker]
  Rank --> Decide{Safety gates}
  Decide -->|all automatic gates pass| Auto[Automatic selection when enabled]
  Decide -->|ambiguous or budget limited| Review[Candidate review]
  Decide -->|no viable match| None[No match]
  Review --> Manual[Owner-bound expiring Choose callback]
  Auto --> Verify[Require explicitly available candidate and owned captured playlist]
  Manual --> Verify
  Verify --> Mutation[Playlist mutation protocol]
```

Settings and destination are captured at ingestion. Changing a setting does not silently change an old job. Automatic selection requires more than a high total score; see [matching](matching.md).

## External mutation and reconciliation

```mermaid
flowchart TD
  Selected[Eligible selected recording] --> Lock[Acquire playlist mutation lock]
  Lock --> Scan{Duplicate scan enabled?}
  Scan -->|yes| Contains[Bounded playlist read]
  Contains -->|present| Exists[Already exists]
  Contains -->|scan incomplete| Fail[Fail closed]
  Contains -->|absent| Prepare[Persist prepared operation]
  Scan -->|no| Prepare
  Prepare --> Sending[Persist sending before provider POST]
  Sending --> Write[Spotify add]
  Write -->|confirmed success| Confirm[Confirm operation and submission; release lock]
  Write -->|ambiguous outcome| Uncertain[Retain uncertain evidence and lock]
  Uncertain --> Readback[Reconcile by readback]
  Readback -->|present| Confirm
  Readback -->|not proven| Intervention[Reconciliation required; no blind resend]
```

D1 cannot atomically commit a Spotify POST. Therefore this is not exactly-once delivery. Presence is evidence that the intended end state exists, not proof of which request created it. Disabling duplicate scanning does not bypass uncertain-write reconciliation. Locks can persist when evidence is unresolved, favoring safety over throughput.

## Trade-offs

D1 makes relational state and atomic ingestion understandable; remote D1 round trips and serialized work consume latency. Queues move heavy work off HTTP but add an asynchronous hop. A durable outbox closes the database/queue gap at the cost of recovery complexity and duplicate deliveries. Deterministic matching is auditable and credential-free in tests but cannot identify unknown audio or resolve every alias. Serverless operation reduces idle infrastructure while exposing strict CPU and provider limits. [ADRs](adr/README.md) record these retrospectively.
