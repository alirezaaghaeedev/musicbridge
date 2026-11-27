# ADR-003: Durable queues and outbox

Retrospective record prepared for the public preview.

## Context

Database commit and Queue publication cannot be one atomic operation.

## Decision

Commit jobs with domain state and publish references; recover due jobs on a cron.

## Alternatives evaluated now

Publish-only Queue, synchronous provider work, or a separate workflow engine.

## Consequences and trade-offs

Closes the lost-publication gap; duplicate delivery, leases, cleanup, and retry complexity remain.

## Current status

Implemented; bulk scheduling remains unresolved.
