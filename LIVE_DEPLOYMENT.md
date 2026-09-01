# Eve v56.5 — Live Deployment Checklist

Eve can now be run in an explicit **live mode**. Live mode is intentionally fail-closed: the Node service refuses to start unless the minimum production prerequisites are present.

## Required environment

Set these before starting Eve for live research:

```text
NODE_ENV=production
EVE_LIVE_MODE=true
EVE_PUBLIC_ORIGIN=https://research.example.gov.uk
RESEARCHOS_RELAY_DATA=/persistent/eve
EVE_BOOTSTRAP_EMAIL=admin@example.gov.uk
EVE_BOOTSTRAP_PASSWORD=<strong first-admin password>
```

If Eve is behind a trusted reverse proxy/load balancer that supplies client IP/protocol headers:

```text
EVE_TRUST_PROXY=true
```

### First-admin bootstrap

`EVE_BOOTSTRAP_EMAIL` and `EVE_BOOTSTRAP_PASSWORD` are used only to create the first account when no Eve users exist.

After the first successful bootstrap:

1. verify that you can sign in;
2. verify that the persistent data volume contains the Eve control-plane data;
3. remove the bootstrap password from deployment secrets if your hosting workflow allows it.

Eve will continue using the stored scrypt password record.

## Persistent storage is mandatory

`RESEARCHOS_RELAY_DATA` must point to a mounted persistent location.

Live mode will not start when Eve is using the bundled/default local path.

That directory contains operational data including:

- encrypted published-study envelopes;
- encrypted participant responses;
- encrypted participant recordings;
- response/invitation routing metadata;
- account, organisation and collaboration state;
- Participant Panel operational records;
- connector token vaults;
- encrypted AI/Microsoft 365 configuration secrets.

Relay directories are created with owner-only permissions where the host filesystem supports POSIX modes:

- directories: `0700`
- files: `0600`

### Backups

A persistent disk is not itself a backup.

Before real research, configure volume snapshots/backups appropriate to the hosting environment and test a restore into a separate Eve instance.

## HTTPS is mandatory

`EVE_PUBLIC_ORIGIN` must be an `https://` URL in live mode.

Eve expects TLS to be terminated either by the Node host or by a trusted reverse proxy.

When HTTPS is detected, Eve sends HSTS.

The live server also sends:

- Content Security Policy;
- `X-Frame-Options: DENY`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: no-referrer`;
- Cross-Origin Opener/Resource policies;
- Permissions Policy for camera, microphone and display capture.

## Participant links

Current live publications include a high-entropy participant key in the URL fragment.

The fragment is not sent to the server by the browser.

Eve derives a one-way SHA-256 capability proof from that key and uses the proof to authorise:

- encrypted study retrieval;
- encrypted response submission;
- encrypted recording submission.

Knowing only a study slug is therefore insufficient for current v56.5 publications.

The relay still never receives the plaintext participant decryption key.

## Abuse protection

The live server includes in-process throttling for:

- login attempts;
- new study publication;
- public participant study retrieval;
- response submission;
- recording submission;
- Panel join;
- Panel participation;
- cloud connector OAuth starts.

It also caps per-study relay storage by default:

```text
EVE_MAX_RESPONSES_PER_STUDY=10000
EVE_MAX_RECORDINGS_PER_STUDY=5000
```

Optional rate limits can be adjusted with:

```text
EVE_RESPONSE_RATE_PER_MINUTE
EVE_RECORDING_RATE_PER_10_MINUTES
EVE_STUDY_PUBLISH_RATE_PER_10_MINUTES
EVE_PANEL_JOIN_RATE_PER_10_MINUTES
EVE_PANEL_PARTICIPATION_RATE_PER_MINUTE
```

The built-in limiter is process-local. For horizontally scaled/multi-instance internet deployments, also apply shared rate limiting at the reverse proxy/WAF layer.

## Researcher authentication

Live mode requires Eve's account system to be configured.

Researcher/admin APIs use role checks once authentication exists.

Cloud connector administration now follows the same rule and is not available anonymously in an authenticated workspace.

Sessions use:

- random bearer tokens stored server-side as hashes;
- `HttpOnly`;
- `SameSite=Lax`;
- `Secure` when served through HTTPS;
- expiry and per-user session limits.

## Google Drive / SharePoint

Connectors require OAuth registrations in the deployment environment.

Recommended production secret:

```text
EVE_CONNECTOR_SECRET=<high-entropy deployment secret>
```

If omitted, Eve generates a local connector-vault key inside the persistent Eve data directory.

Google Drive intentionally uses `drive.file`.

SharePoint currently uses `Sites.ReadWrite.All`; organisations requiring stricter selected-site permission should complete that governance change before broad departmental rollout.

## Microsoft 365 email

Panel/recruitment mail requires Microsoft Graph configuration.

Either configure it through Global Settings or use deployment variables:

```text
EVE_M365_TENANT_ID
EVE_M365_CLIENT_ID
EVE_M365_CLIENT_SECRET
EVE_M365_SENDER
```

Test the configured sender before putting a Panel-signup study live.

## AI

AI is optional.

If enabled, Eve sends requests through the server-side AI gateway with `store:false`.

For production, configure the API key using Global Settings or:

```text
EVE_AI_API_KEY
```

Per-study AI permission remains Off / Anonymous / Full.

## Health checks

Liveness:

```text
GET /api/health
```

Readiness:

```text
GET /api/readiness
```

`/api/readiness` returns HTTP 503 when the deployment is not ready.

Public health endpoints intentionally expose only minimal state.

## Pre-study smoke test

Before recruiting real participants:

1. sign in as the intended researcher;
2. create a disposable study;
3. Preview on desktop and mobile widths;
4. put it Live;
5. open the generated participant link in a private/incognito browser;
6. submit at least one response;
7. if recordings are required, submit each enabled recording mode;
8. confirm the response appears in Review;
9. save an Insight from evidence;
10. Turn off the study and confirm the participant link no longer accepts a new response;
11. Archive and Restore the disposable study;
12. verify SharePoint/Drive sync if used;
13. verify Microsoft 365 test mail/Panel welcome flow if used;
14. confirm `/api/readiness` is 200;
15. confirm the persistent volume backup/snapshot process is active.

## Deployment verdict

v56.5 is suitable for a **controlled live research deployment on a single Eve service instance** once the required live-mode checks and the pre-study smoke test above pass.

Before treating Eve as a broad enterprise/public multi-instance service, the remaining external assurance work is:

- browser-engine end-to-end automation/screenshot regression;
- independent accessibility audit;
- independent security review / penetration test;
- shared/distributed rate limiting for horizontal scale;
- stricter SharePoint selected-site permissions where required by departmental policy.

Those are assurance/scale steps rather than known blockers to a controlled live pilot.


## Downloadable beta / Cloudflare relay mode (v58)

The fail-closed `EVE_LIVE_MODE=true` Node deployment described above remains available for centrally self-hosting the full Eve service.

v58 also introduces a different model for researcher downloads:

- researcher Eve remains local;
- SharePoint/Google Drive is the durable research store;
- the organisation's Cloudflare Worker/R2 deployment is the public participant relay.

In that model the local Node service does not need to be publicly exposed.

Follow `START_HERE.md` and `DISTRIBUTION.md`.

Do not use Participant Panel signup with the standalone Cloudflare relay yet.
