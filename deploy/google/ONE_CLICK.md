# Eve Google guided deployment

The normal Google installation path is **Start guided Google setup** in the Eve deployment launcher.

Eve deliberately uses a normal Google Cloud Shell session rather than the retired Cloud Run Button path. Google Cloud Shell supplies the Google Cloud CLI in the browser and prompts the researcher to authorize the session when required.

The researcher journey is:

1. Eve opens Google Cloud Shell and copies one bootstrap command.
2. The researcher pastes that command once.
3. The command downloads the selected Eve Beta/Stable revision and launches `deploy/google/tutorial.md`.
4. Google's walkthrough lets the researcher select/create a project and check billing.
5. The walkthrough enables the required APIs and runs `deploy/google/deploy.sh`.
6. Eve creates Cloud SQL PostgreSQL, Cloud Storage, Secret Manager, Artifact Registry, a runtime service identity and Cloud Run.
7. The terminal prints the final Eve HTTPS URL.
8. The researcher returns to the Eve deployment page, pastes the URL, and Eve verifies `/api/readiness` before marking the deployment Ready.

## Why the launcher does not clone Eve directly through Open in Cloud Shell

Google's current Open in Cloud Shell security model runs non-Google repositories in a temporary environment without automatic access to the user's credentials. Eve therefore opens the normal authenticated Cloud Shell first, then has the researcher paste a single explicit bootstrap command. This keeps the trust boundary visible and avoids the project-discovery loop seen with the previous Cloud Run Button.

## Advanced route

Technical/platform teams can open `deploy/google/README.md` and run `bash deploy/google/deploy.sh` directly from a checked-out Eve release.

The public deployment launcher never receives Google credentials, Eve secrets or research data.
