# ADR-008: Free-tier runtime constraints

Retrospective record prepared for the public preview.

## Context

Historical worst-case matching and HTTP captures exceeded desired execution headroom.

## Decision

Bound scoring work, reuse profiles/comparisons, defer heavy work to Queue, and measure route classes separately.

## Alternatives evaluated now

Unbounded scoring, paid upgrade, or larger deployment redesign.

## Consequences and trade-offs

Safe review fallback preserves matching policy; HTTP headroom and bulk latency still need work. No billing changes implied.

## Current status

Implemented optimization; Free-runtime acceptance still open.
