# ADR-005: Conservative automatic selection

Retrospective record prepared for the public preview.

## Context

Wrong recordings can silently pollute user playlists.

## Decision

Require title/artist/overall/margin gates, explicit availability, version compatibility, enabled policy, and owned destination.

## Alternatives evaluated now

Always choose top score, require every choice manually, or treat missing availability as true.

## Consequences and trade-offs

Lower automation coverage but reviewable uncertainty; synthetic fixture safety does not establish universal accuracy.

## Current status

Implemented; budget exhaustion always forces review.
