# Google Cloud — guided Eve deployment

For researchers, use the public Eve Beta/Stable launcher and choose **Google Cloud → Start guided Google setup**.

That route opens a normal Google Cloud Shell session, launches Eve's in-console walkthrough, and guides project selection, billing, API enablement and deployment.

## Advanced/manual deployment

Platform teams can run the underlying installer directly from Google Cloud Shell after checking out the desired Eve revision:

```bash
bash deploy/google/deploy.sh
```

The installer creates:

- Cloud SQL PostgreSQL 16 — operational control plane;
- Cloud Storage — durable encrypted research storage;
- Cloud Run — full Eve application, up to 3 instances by default;
- Secret Manager — bootstrap, connector and database credentials;
- Artifact Registry + Cloud Build;
- dedicated runtime service account.

No Google Drive OAuth client is required for the default research workflow. Google Drive/Shared Drive remains an optional integration.

If Google displays **Authorize Cloud Shell**, approve it before running the installer.
