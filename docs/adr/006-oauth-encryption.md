# ADR-006: OAuth token encryption

Retrospective record prepared for the public preview.

## Context

Long-lived provider credentials need storage protection and identity-bound activation.

## Decision

AES-256-GCM token envelopes, hashed one-time CSRF state, Telegram confirmation, refresh lease/version.

## Alternatives evaluated now

Plaintext tokens, immediate callback activation, or an external credential service.

## Consequences and trade-offs

Protects stored credentials and coordinates refresh; runtime-key compromise and rotation still require operational planning.

## Current status

Implemented; complete deletion remains unresolved.
