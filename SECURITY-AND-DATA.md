# Eve security and data boundaries — v61

## Two deliberately separate storage classes

Eve now distinguishes operational control-plane state from encrypted research storage.

### PostgreSQL operational state

The concurrent database stores service state such as:

- accounts and sessions;
- organisation membership/RBAC;
- collaboration state;
- Participant Panel operational records;
- identity/OAuth transaction state;
- AI/email/connector configuration.

Connector/provider secrets remain encrypted before persistence using the deployment's `EVE_CONNECTOR_SECRET`-derived key.

### Encrypted research storage

Durable study/workspace research, responses and recording objects remain in organisation-owned file/object storage using Eve's research encryption model.

PostgreSQL is not given the role of a decrypted research database.

## Cross-instance coordination

When PostgreSQL is enabled, Eve uses advisory locks for:

- control-plane mutations;
- per-study relay operations;
- organisation-storage writes/deletes.

HTTP responses for transactional control-plane routes are buffered until the database transaction succeeds, reducing the risk of telling a browser an operation succeeded before persistence commits.

## Legacy migration

Existing file-based control-plane JSON is used as a migration seed if the equivalent PostgreSQL state does not already exist.

The database wins once state has been migrated; Eve does not overwrite existing database state with stale legacy JSON.

## Google Cloud

v61 deployment creates:

- Cloud SQL PostgreSQL 16;
- Cloud Run;
- Cloud Storage encrypted research storage;
- Secret Manager secrets;
- a dedicated service account.

Database credentials are injected from Secret Manager and Cloud Run connects through the Cloud SQL integration.

## Azure

v61 creates Azure Database for PostgreSQL Flexible Server alongside Container Apps and Azure Files.

## Readiness

`/api/health` and `/api/readiness` now report/consider the configured state backend and database health.

A production Postgres-configured Eve is not considered fully ready if its database state layer is unavailable.

## Remaining assurance work

Before broad production rollout:

- real provider deployment smoke tests;
- independent security/penetration testing;
- load/concurrency testing at realistic researcher/participant volumes;
- accessibility review;
- production backup/restore exercises for both PostgreSQL and encrypted research storage.


## Local + Relay recording lifecycle

For the researcher-computer + relay profile, participant recordings reach Cloudflare R2 only as encrypted envelopes. Eve copies the encrypted recording to the selected organisation-owned SharePoint/Google Drive store and verifies it by reading the stored file back. Only after successful verification does Eve schedule the R2 copy for deletion. The default grace period is 48 hours and the relay checks hourly. A failed durable handoff never schedules deletion. Eve keeps a browser-key-encrypted local playback cache after handoff; the organisation-owned cloud file remains the durable copy.
