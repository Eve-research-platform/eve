# Eve Google one-click deployment

The preferred Google installation path is the **Run on Google Cloud** button exposed by Eve deployment launcher.

The user stays in Google's browser-managed deployment flow:

1. Sign in to Google Cloud.
2. Choose/create the organisation project and region.
3. Enter the first Eve administrator email, workspace name and a temporary admin password.
4. Google builds a private bootstrap revision from the public Eve repository.
5. `deploy/google/cloud-run-button-finalize.sh` provisions Cloud SQL, Cloud Storage, Secret Manager and the Eve runtime service account.
6. Sensitive bootstrap/database/connector values are moved into Secret Manager.
7. The full organisation-cloud runtime is configured and checked.
8. Only after the live runtime has been configured is the service opened for web access.

The previous Cloud Shell installer remains in `deploy/google/deploy.sh` as an advanced/fallback route.

## Publication requirement

The one-click button requires a public canonical Git repository. Before publishing the deployment launcher, replace `OWNER/REPOSITORY` placeholders in `deployment-config.js` and release/container metadata with the canonical Eve repository.

## Trust boundary

The deployment launcher does not receive Google credentials, cloud resource credentials, Eve secrets or research data. Google performs the deployment inside the organisation's selected Google Cloud project.
