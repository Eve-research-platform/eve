# Google Cloud Shell fallback — deploy full Eve on Google Cloud

The preferred v62 route is **Create Eve on Google Cloud** in Eve deployment launcher. This tutorial is the advanced/fallback path and deploys the same complete Eve platform into your Google Cloud project.

No software is installed on your computer. Everything runs in Google Cloud Shell.

## Deploy

Run:

```bash
bash deploy/google/deploy.sh
```

The script asks for the first Eve administrator email and workspace/department name, then provisions:

- Cloud SQL PostgreSQL 16 for concurrent operational state;
- Cloud Storage for durable browser-encrypted research;
- Cloud Run for the full Eve service;
- Secret Manager, Artifact Registry, service identity and build resources.

The default maximum is three Cloud Run instances. Eve coordinates operational mutations and per-study relay operations through PostgreSQL advisory locks.

No Google Drive OAuth client is required to start researching. Drive/Shared Drive is an optional later integration.
