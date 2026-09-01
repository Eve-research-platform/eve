#!/usr/bin/env bash
set -euo pipefail
VERSION="63.0.0"
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-${EVE_PROJECT_ID:-}}"
REGION="${GOOGLE_CLOUD_REGION:-${EVE_REGION:-europe-west2}}"
SERVICE="${K_SERVICE:-${EVE_SERVICE:-eve-research}}"
SERVICE_URL="${SERVICE_URL:-}"
SQL_INSTANCE="${EVE_SQL_INSTANCE:-eve-postgres}"
SQL_DATABASE="${EVE_SQL_DATABASE:-eve}"
SQL_USER="${EVE_SQL_USER:-eve}"
DATA_MOUNT="/data/eve"
MAX_INSTANCES="${EVE_MAX_INSTANCES:-3}"
SA_NAME="${EVE_SERVICE_ACCOUNT:-eve-runtime}"
say(){ printf '\n\033[1;35m%s\033[0m\n' "$*"; }
die(){ printf '\nEve one-click deployment stopped: %s\n' "$*" >&2; exit 1; }
need(){ [[ -n "${!1:-}" ]] || die "$2"; }
need PROJECT_ID "Google did not provide the target project ID."
need REGION "Google did not provide the selected region."
need SERVICE "Google did not provide the Cloud Run service name."
need EVE_BOOTSTRAP_EMAIL "Enter the first Eve administrator email in the deployment form."
need EVE_BOOTSTRAP_PASSWORD "Enter a temporary first-admin password in the deployment form."
need EVE_CONNECTOR_SECRET "The deployment flow did not generate Eve's connector secret."
need EVE_DATABASE_PASSWORD "The deployment flow did not generate Eve's database password."
[[ "${EVE_BOOTSTRAP_EMAIL}" == *"@"* ]] || die "The first Eve administrator email is invalid."
[[ ${#EVE_BOOTSTRAP_PASSWORD} -ge 12 ]] || die "The temporary first-admin password must be at least 12 characters."
BUCKET="${EVE_DATA_BUCKET:-${PROJECT_ID}-eve-data}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

say "Eve 1/7 · Enabling the organisation-owned cloud services"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com iam.googleapis.com sqladmin.googleapis.com --project="${PROJECT_ID}" >/dev/null
say "Eve 2/7 · Provisioning the PostgreSQL control plane"
if ! gcloud sql instances describe "${SQL_INSTANCE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud sql instances create "${SQL_INSTANCE}" --project="${PROJECT_ID}" --database-version=POSTGRES_16 --edition=ENTERPRISE --cpu=1 --memory=3840MB --region="${REGION}" --storage-size=10 --storage-type=SSD --availability-type=zonal
fi
if ! gcloud sql databases describe "${SQL_DATABASE}" --project="${PROJECT_ID}" --instance="${SQL_INSTANCE}" >/dev/null 2>&1; then
  gcloud sql databases create "${SQL_DATABASE}" --project="${PROJECT_ID}" --instance="${SQL_INSTANCE}" >/dev/null
fi
if gcloud sql users list --project="${PROJECT_ID}" --instance="${SQL_INSTANCE}" --filter="name=${SQL_USER}" --format="value(name)" | grep -qx "${SQL_USER}"; then
  gcloud sql users set-password "${SQL_USER}" --project="${PROJECT_ID}" --instance="${SQL_INSTANCE}" --password="${EVE_DATABASE_PASSWORD}" >/dev/null
else
  gcloud sql users create "${SQL_USER}" --project="${PROJECT_ID}" --instance="${SQL_INSTANCE}" --password="${EVE_DATABASE_PASSWORD}" >/dev/null
fi
SQL_CONNECTION="$(gcloud sql instances describe "${SQL_INSTANCE}" --project="${PROJECT_ID}" --format='value(connectionName)')"
[[ -n "${SQL_CONNECTION}" ]] || die "Cloud SQL did not return an instance connection name."

say "Eve 3/7 · Provisioning encrypted durable research storage"
if ! gcloud storage buckets describe "gs://${BUCKET}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${BUCKET}" --project="${PROJECT_ID}" --location="${REGION}" --uniform-bucket-level-access >/dev/null
fi
if ! gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SA_NAME}" --project="${PROJECT_ID}" --display-name="Eve runtime" >/dev/null
fi
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --member="serviceAccount:${SA_EMAIL}" --role="roles/storage.objectUser" >/dev/null
gcloud projects add-iam-policy-binding "${PROJECT_ID}" --member="serviceAccount:${SA_EMAIL}" --role="roles/cloudsql.client" >/dev/null

say "Eve 4/7 · Moving private values into Secret Manager"
put_secret(){ local name="$1" value="$2"; if gcloud secrets describe "$name" --project="${PROJECT_ID}" >/dev/null 2>&1; then printf '%s' "$value" | gcloud secrets versions add "$name" --project="${PROJECT_ID}" --data-file=- >/dev/null; else printf '%s' "$value" | gcloud secrets create "$name" --project="${PROJECT_ID}" --data-file=- >/dev/null; fi; gcloud secrets add-iam-policy-binding "$name" --project="${PROJECT_ID}" --member="serviceAccount:${SA_EMAIL}" --role="roles/secretmanager.secretAccessor" >/dev/null; }
put_secret eve-bootstrap-password "${EVE_BOOTSTRAP_PASSWORD}"
put_secret eve-connector-secret "${EVE_CONNECTOR_SECRET}"
put_secret eve-database-password "${EVE_DATABASE_PASSWORD}"
gcloud run services update "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --remove-env-vars="EVE_BOOTSTRAP_PASSWORD,EVE_CONNECTOR_SECRET,EVE_DATABASE_PASSWORD" >/dev/null

say "Eve 5/7 · Converting the bootstrap service into the full Eve runtime"
if [[ -z "${SERVICE_URL}" ]]; then SERVICE_URL="$(gcloud run services describe "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --format='value(status.url)')"; fi
[[ "${SERVICE_URL}" == https://* ]] || die "Cloud Run did not return an HTTPS service URL."
gcloud run services update "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" \
  --service-account="${SA_EMAIL}" --cpu=1 --memory=2Gi --min=0 --max="${MAX_INSTANCES}" --execution-environment=gen2 \
  --add-cloudsql-instances="${SQL_CONNECTION}" \
  --add-volume="mount-path=${DATA_MOUNT},type=cloud-storage,bucket=${BUCKET},readonly=false,mount-options=uid=1000;gid=1000;file-mode=0600;dir-mode=0700;metadata-cache-ttl-secs=0;stat-cache-max-size-mb=0;type-cache-max-size-mb=0" \
  --update-env-vars="NODE_ENV=production,HOST=0.0.0.0,RESEARCHOS_RELAY_DATA=${DATA_MOUNT},EVE_LIVE_MODE=true,EVE_TRUST_PROXY=true,EVE_DEPLOYMENT_MODE=organisation-cloud,EVE_CLOUD_PROVIDER=google-cloud,EVE_DEFAULT_STORAGE_PROVIDER=organisation,EVE_STORAGE_PROFILE=gcs-fuse-postgres,EVE_ORG_STORAGE_ENABLED=true,EVE_ORG_STORAGE_LABEL=Google Cloud encrypted research storage,EVE_MAX_INSTANCES_HINT=${MAX_INSTANCES},EVE_STATE_BACKEND=postgres,PGHOST=/cloudsql/${SQL_CONNECTION},PGPORT=5432,PGDATABASE=${SQL_DATABASE},PGUSER=${SQL_USER},EVE_BOOTSTRAP_EMAIL=${EVE_BOOTSTRAP_EMAIL},EVE_ORG_NAME=${EVE_ORG_NAME:-Eve research workspace},EVE_PUBLIC_ORIGIN=${SERVICE_URL}" \
  --set-secrets="EVE_BOOTSTRAP_PASSWORD=eve-bootstrap-password:latest,EVE_CONNECTOR_SECRET=eve-connector-secret:latest,PGPASSWORD=eve-database-password:latest" >/dev/null
say "Eve 6/7 · Opening the completed Eve service"
gcloud run services add-iam-policy-binding "${SERVICE}" --project="${PROJECT_ID}" --region="${REGION}" --member="allUsers" --role="roles/run.invoker" >/dev/null
say "Eve 7/7 · Running readiness checks"
for attempt in $(seq 1 36); do if curl -fsS "${SERVICE_URL}/api/readiness" >/dev/null 2>&1; then printf '\nEve is ready: %s\n' "${SERVICE_URL}"; printf 'First administrator: %s\n' "${EVE_BOOTSTRAP_EMAIL}"; printf 'Research storage: gs://%s\n' "${BUCKET}"; printf 'Version: %s\n' "${VERSION}"; exit 0; fi; sleep 5; done
die "Eve was provisioned but readiness did not become healthy. Open the Cloud Run service logs to see the failed check."
