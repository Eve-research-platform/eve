# Eve v61.1.0 — concurrent control-plane migration

## Why this release exists

v60.1 restored a full-capability cloud deployment but deliberately capped the service at one application instance because operational state was file-backed.

v61 removes that architectural bottleneck.

## Moved to PostgreSQL

- accounts/sessions/organisation state;
- collaboration/RBAC state;
- Participant Panel state;
- identity/OAuth transient state;
- AI/email integration configuration;
- connector vault and pending OAuth state.

## Kept out of PostgreSQL

Encrypted research payloads, participant response files and recording objects remain in organisation-owned research storage.

This keeps the operational database focused on concurrency rather than turning it into a central plaintext research repository.

## Concurrency model

A conservative global advisory lock currently serialises transactional control-plane operations across instances.

Per-study advisory locks coordinate relay study/response/recording/invitation operations.

This is intentionally safe-first. Future optimisation can narrow control-plane lock scope by domain once multi-instance load testing establishes where contention actually occurs.

## Deployment impact

Google: Cloud SQL PostgreSQL + up to 3 Cloud Run instances by default.

Azure: PostgreSQL Flexible Server + configurable Container Apps replicas.

Docker: PostgreSQL service included.

## Next performance work

- load-test PostgreSQL lock contention;
- split the global control-plane lock into domain locks if justified;
- move encrypted research object operations from mounted filesystems to provider-native object APIs where that improves multi-instance semantics;
- add database connection-pool metrics and operational dashboards.
