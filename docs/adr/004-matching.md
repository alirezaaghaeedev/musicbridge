# ADR-004: Deterministic matching instead of AI services

Retrospective record prepared for the public preview.

## Context

Metadata is incomplete/multilingual and decisions must be inspectable within a small resource budget.

## Decision

Use normalized/token-sort Levenshtein, explicit artist/duration/version policies, and bounded caches.

## Alternatives evaluated now

External AI matching, audio fingerprints, or title equality alone.

## Consequences and trade-offs

Local reproducibility and explainability; no sound recognition, arbitrary aliases, or general transliteration.

## Current status

Implemented; representative evaluation expansion planned.
