# ADR-001: Serverless deployment architecture

Retrospective record prepared for the public preview.

## Context

Short webhook requests and asynchronous provider work under a free-tier constraint.

## Decision

Use Workers/Hono plus Queue and scheduled handlers.

## Alternatives evaluated now

A long-running bot process, container service, or separate HTTP/worker fleet.

## Consequences and trade-offs

No idle server management; strict HTTP CPU budgets, platform-specific bindings, and asynchronous latency.

## Current status

Implemented; unrestricted Free-runtime acceptance unresolved.
