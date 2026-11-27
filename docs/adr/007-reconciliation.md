# ADR-007: Idempotency and external mutation reconciliation

Retrospective record prepared for the public preview.

## Context

Webhook/Queue redelivery and ambiguous Spotify POST outcomes cross transaction boundaries.

## Decision

Atomic replay protection, claimed jobs, playlist operation evidence, locks, and readback before uncertain retries.

## Alternatives evaluated now

Blind retry, assume every timeout failed, or claim distributed exactly-once semantics.

## Consequences and trade-offs

Avoids unsafe repeated writes; unresolved uncertainty can stop progress and retain locks. Presence is not causal proof.

## Current status

Implemented; no exactly-once external-write guarantee.
