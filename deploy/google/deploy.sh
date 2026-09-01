#!/usr/bin/env bash
set -euo pipefail
VERSION="63.0.0"
SERVICE="${EVE_SERVICE:-eve}"
REGION="${EVE_REGION:-europe-west2}"
REPOSITORY="${EVE_ARTIFACT_REPOSITORY:-eve}"
SQL_INSTANCE="${EVE_SQL_INSTANCE:-eve-postgres}"
SQL_DATABASE="${EVE_SQL_DATABASE:-eve}"
SQL_USER="${EVE_SQL_USER:-eve}"
MAX_INSTANCES="${EVE_MAX_INSTANCES:-3}"
DATA_MOUNT="/data/eve"
say(){ printf "\n\033[1;35m%s\033[0m\n" "$*"; }
die(){ printf "\nEve deployment stopped: %s\n" "$*" >&2; exit 1; }
command -v gcloud >/dev/null 2>&1 || die "Google Cloud Shell/gcloud is required."
PROJECT_ID="${EVE_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then read -r -p "Google Cloud project ID: " PROJECT_ID; fi
[[ -n "${PROJECT_ID}" ]] || die "A Google Cloud project is required."
gcloud config set project "${PROJECT_ID}" >/dev/null
ACCOUNT="$(gcloud config get-value account 2>/dev/null || true)"
DEFAULT_EMAIL="${EVE_BOOTSTRAP_EMAIL:-${ACCOUNT}}"
read -r -p "First Eve admin email [${DEFAULT_EMAIL}]: " BOOTSTRAP_EMAIL
BOOTSTRAP_EMAIL="${BOOTSTRAP_EMAIL:-$DEFAULT_EMAIL}"
[[ "${BOOTSTRAP_EMAIL}" == *"@"* ]] || die "Enter a valid first-admin email."
DEFAULT_ORG="${EVE_ORG_NAME:-Eve research workspace}"
read -r -p "Workspace/department name [${DEFAULT_ORG}]: " ORG_NAME
ORG_NAME="${ORG_NAME:-$DEFAULT_ORG}"
BOOTSTRAP_PASSWORD="${EVE_BOOTSTRAP_PASSWORD:-$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')}"
CONNECTOR_SECRET="${EVE_CONNECTOR_SECRET:-$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')}"
DATABASE_PASSWORD="${EVE_DATABASE_PASSWORD:-$(python3 -c 'import secrets; print(secrets.token_urlsafe(36))')}"
SUFFIX="$(python3 -c 'import secrets; print(secrets.token_hex(3))')"
BUCKET="${EVE_DATA_BUCKET:-${PROJECT_ID}-eve-data-${SUFFIX}}"
SA_NAME="${EVE_SERVICE_ACCOUNT:-eve-runtime}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/eve:${VERSION}"

say "1/9 · Enabling Google Cloud services"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com iam.googleapis.com sqladmin.googleapis.com

say "2/9 · Creating Eve's concurrent PostgreSQL control plane"
if ! gcloud sql instances describe "${SQL_INSTANCE}" >/dev/null 2>&1; then
  gcloud sql instances create "${SQL_INSTANCE}" --database-version=POSTGRES_16 --edition=ENTERPRISE --cpu=1 --memory=3840MB --region="${REGION}" --storage-size=10 --storage-type=SSD --availability-type=zonal
fi
if ! gcloud sql databases describe "${SQL_DATABASE}" --instance="${SQL_INSTANCE}" >/dev/null 2>&1; then gcloud sql databases create "${SQL_DATABASE}" --instance="${SQL_INSTANCE}"; fi
if gcloud sql users list --instance="${SQL_INSTANCE}" --filter="name=${SQL_USER}" --format="value(name)" | grep -qx "${SQL_USER}"; then
  gcloud sql users set-password "${SQL_USER}" --instance="${SQL_INSTANCE}" --password="${DATABASE_PASSWORD}"
else
  gcloud sql users create "${SQL_USER}" --instance="${SQL_INSTANCE}" --password="${DATABASE_PASSWORD}"
fi
SQL_CONNECTION="$(gcloud sql instances describe "${SQL_INSTANCE}" --format='value(connectionName)')"
[[ -n "${SQL_CONNECTION}" ]] || die "Cloud SQL did not return an instance connection name."

say "3/9 · Creating Eve's organisation-owned encrypted research storage"
if ! gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1; then gcloud storage buckets create "gs://${BUCKET}" --location="${REGION}" --uniform-bucket-level-access; fi
if ! gcloud iam service-accounts describe "${SA_EMAIL}" >/dev/null 2>&1; then gcloud iam service-accounts create "${SA_NAME}" --display-name="Eve runtime"; fi
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --member="serviceAccount:${SA_EMAIL}" --role="roles/storage.objectUser" >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" --member="serviceAccount:${SA_EMAIL}" --role="roles/cloudsql.client" >/dev/null

say "4/9 · Creating private Eve deployment secrets"
put_secret(){ local name="$1" value="$2"; if gcloud secrets describe "$name" >/dev/null 2>&1; then printf "%s" "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null; else printf "%s" "$value" | gcloud secrets create "$name" --data-file=- >/dev/null; fi; gcloud secrets add-iam-policy-binding "$name" --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor" >/dev/null; }
put_secret eve-bootstrap-password "${BOOTSTRAP_PASSWORD}"
put_secret eve-connector-secret "${CONNECTOR_SECRET}"
put_secret eve-database-password "${DATABASE_PASSWORD}"

say "5/9 · Building the full Eve container inside your Google Cloud project"
if ! gcloud artifacts repositories describe "${REPOSITORY}" --location="${REGION}" >/dev/null 2>&1; then gcloud artifacts repositories create "${REPOSITORY}" --repository-format=docker --location="${REGION}" --description="Eve container images"; fi
gcloud builds submit --tag "${IMAGE}" .

say "6/9 · Creating the private Eve service"
gcloud run deploy "${SERVICE}" --region="${REGION}" --image="${IMAGE}" --service-account="${SA_EMAIL}" --port=8787 --cpu=1 --memory=2Gi --min=0 --max="${MAX_INSTANCES}" --no-allow-unauthenticated --execution-environment=gen2 --add-cloudsql-instances="${SQL_CONNECTION}" --add-volume="mount-path=${DATA_MOUNT},type=cloud-storage,bucket=${BUCKET},readonly=false,mount-options=uid=1000;gid=1000;file-mode=0600;dir-mode=0700;metadata-cache-ttl-secs=0;stat-cache-max-size-mb=0;type-cache-max-size-mb=0" --set-env-vars="NODE_ENV=production,HOST=0.0.0.0,RESEARCHOS_RELAY_DATA=${DATA_MOUNT},EVE_LIVE_MODE=false,EVE_TRUST_PROXY=true,EVE_DEPLOYMENT_MODE=organisation-cloud,EVE_CLOUD_PROVIDER=google-cloud,EVE_DEFAULT_STORAGE_PROVIDER=organisation,EVE_STORAGE_PROFILE=gcs-fuse-postgres,EVE_ORG_STORAGE_ENABLED=true,EVE_ORG_STORAGE_LABEL=Google Cloud encrypted research storage,EVE_MAX_INSTANCES_HINT=${MAX_INSTANCES},EVE_STATE_BACKEND=postgres,PGHOST=/cloudsql/${SQL_CONNECTION},PGPORT=5432,PGDATABASE=${SQL_DATABASE},PGUSER=${SQL_USER},EVE_BOOTSTRAP_EMAIL=${BOOTSTRAP_EMAIL},EVE_ORG_NAME=${ORG_NAME}" --set-secrets="EVE_BOOTSTRAP_PASSWORD=eve-bootstrap-password:latest,EVE_CONNECTOR_SECRET=eve-connector-secret:latest,PGPASSWORD=eve-database-password:latest"
URI="$(gcloud run services describe "${SERVICE}" --region="${REGION}" --format='value(status.url)')"
[[ "${URI}" == https://* ]] || die "Cloud Run did not return an HTTPS service URL."

say "7/9 · Turning on Eve's live security mode"
gcloud run services update "${SERVICE}" --region="${REGION}" --update-env-vars="EVE_PUBLIC_ORIGIN=${URI},EVE_LIVE_MODE=true"

say "8/9 · Opening the participant/researcher web service"
gcloud run services add-iam-policy-binding "${SERVICE}" --region="${REGION}" --member="allUsers" --role="roles/run.invoker" >/dev/null

say "9/9 · Verifying Eve, PostgreSQL and persistent research storage"
for attempt in $(seq 1 30); do if curl -fsS "${URI}/api/readiness" >/dev/null 2>&1; then break; fi; [[ "${attempt}" -eq 30 ]] && die "Eve deployed but readiness did not become healthy. Open Cloud Run logs before using it."; sleep 5; done
cat <<OUT

Eve is ready.

URL
  ${URI}

First administrator
  ${BOOTSTRAP_EMAIL}

Temporary first-admin password
  ${BOOTSTRAP_PASSWORD}

Concurrent operational control plane
  Cloud SQL PostgreSQL: ${SQL_CONNECTION} / ${SQL_DATABASE}

Encrypted durable research storage
  gs://${BUCKET}

Runtime scale
  Up to ${MAX_INSTANCES} Cloud Run instances.

Important
  • Accounts, sessions, collaboration state, Panel state and integration configuration now use PostgreSQL.
  • Study/response/recording file operations are coordinated with PostgreSQL advisory locks.
  • Cloud Storage metadata caching is disabled for cross-instance consistency.
  • No Google OAuth client is required to start researching.
  • Google Drive/Shared Drive is optional and can be connected later.

OUT
