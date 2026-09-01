# Google Cloud — full Eve v61

Run from Google Cloud Shell:

```bash
bash deploy/google/deploy.sh
```

The script now creates a concurrent departmental Eve stack:

- Cloud SQL PostgreSQL 16 — operational control plane;
- Cloud Storage — durable encrypted research storage;
- Cloud Run — full Eve application, up to 3 instances by default;
- Secret Manager — bootstrap, connector and database credentials;
- Artifact Registry + Cloud Build;
- dedicated runtime service account.

No Google Drive OAuth client is required for the default research workflow.

Google Drive/Shared Drive remains an optional integration.

## Concurrency

Accounts, sessions, collaboration, Panel state and integration configuration use PostgreSQL.

Study/response/recording operations are coordinated with PostgreSQL advisory locks.

The deployment disables Cloud Storage FUSE metadata/stat/type caches to reduce stale cross-instance filesystem views.

## Cost note

v61 adds Cloud SQL, so the deployment has a higher minimum cloud cost than v60.x. That is the trade-off for a properly concurrent operational control plane.
