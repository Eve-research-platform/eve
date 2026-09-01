# Eve architecture guardrails — v56.0.0

## Direction

Eve is moving away from feature-specific reliability code in `app.js`.

The rule for v56 onward is:

> Move complete responsibilities out of `app.js`, then ratchet the monolith downward.

Do not create helper modules while leaving an equivalent second decision path in `app.js`.

## Mutation transaction seam

`eve-transactions.js` owns generic mutation mechanics:

- lock acquisition/release;
- snapshot capture;
- apply phase;
- first persistence phase;
- remote commit phase;
- optional final persistence;
- remote rollback;
- state restoration;
- rollback persistence;
- structured result reporting;
- async button busy-state mechanics.

It deliberately does **not** own study-specific policy such as:
- whether a study may go live;
- Panel prerequisites;
- closing-time rules;
- participant relay payloads;
- Archive retention policy.

Those remain feature responsibilities.

## First production migrations

v56 uses the transaction seam for:

1. Turn off study
2. Restore archived study

Go live and live-study Archive remain on the v55.4 fail-safe implementations until they can be migrated with deterministic scenario coverage.

## Ratchet

`architecture-budget.json` is enforced by `tests/v56_architecture_ratchet.test.js`.

Current limits are hard ceilings, not targets to grow toward.

Future extractions should reduce the `app.js` limits.

## Runtime testing

`tests/v56_runtime_smoke.test.js` starts the real Node service and exercises the served application/API over HTTP.

Browser automation is the next test layer. It is not currently part of the release gate because this build environment contains no Chromium/Firefox executable and no Playwright/Puppeteer installation.


## v56.1 — Archive operations

`eve-archive-ops.js` is the first extracted operational feature domain.

### Owns
- Archive mutation
- Restore mutation
- Permanent-delete orchestration
- Automatic expired-Archive purge
- Participant relay lifecycle reconciliation during Archive
- External cloud/relay cleanup ordering
- Workspace deletion commit ordering

### Does not own
- Archive page/card rendering
- generic transaction mechanics
- IndexedDB implementation
- cloud connector implementation
- relay HTTP implementation

Those are injected dependencies.

### Required direction
The Archive decisions must not be recreated in `app.js`.

The only allowed `app.js` Archive mutation surface is dependency configuration plus thin delegates:

- `archiveStudy`
- `restoreArchivedStudy`
- `purgeArchivedStudy`
- `purgeExpiredArchivedStudies`

### Ratchet
v56.1 hard ceiling:

- `app.js`: 463,692 bytes / 2,078 physical lines
- `eve-archive-ops.js`: 9,500 bytes / 225 physical lines

Future extractions must reduce the `app.js` ceiling again.


## v56.2 — Study lifecycle operations

`eve-study-lifecycle.js` is now the authoritative production domain for study publication lifecycle.

### Owns
- first Go live
- Update live study
- participant-link recovery
- reopen Off study
- Turn off
- lifecycle rollback policy
- lifecycle operation locking
- relay commit confirmation/reconciliation

### Injected dependencies
The domain does not implement:
- IndexedDB/workspace persistence;
- relay HTTP transport;
- encryption;
- Panel HTTP transport;
- Builder/Settings validation UI;
- rendering.

Those are injected from the application shell.

### app.js boundary
`app.js` may contain:
- lifecycle dependency configuration;
- `goLiveStudy()` delegate;
- `publishStudy()` compatibility delegate;
- `turnOffStudy()` delegate.

It must not regain version-increment, live/off rollback or relay-publication decision logic.

### Relay ambiguity
The service now supports:
- idempotent authorised retry for the same latest version;
- administrator-only lifecycle/version status inspection.

This gives the client a reconciliation path after an interrupted request without weakening version ordering.

### Ratchet
v56.2 hard ceiling:
- `app.js`: 458,211 bytes / 2,020 lines
- `eve-study-lifecycle.js`: 12,300 bytes / 250 lines

Future work should continue reducing `app.js`.


## v56.3 — participant submission domains

Two participant-response responsibilities are now explicit production seams.

### `eve-participant-submit.js`
Owns:
- final participant validation;
- answer serialization;
- response object construction;
- stable response ID creation;
- recording persistence orchestration;
- handoff to delivery.

It does not own rendering, IndexedDB, HTTP or cryptography.

### `eve-participant-delivery.js`
Owns:
- transient retry policy;
- stable recording IDs;
- encrypted response/recording transport orchestration;
- pending completed-response storage;
- response resume after reload;
- local/relay response persistence choice.

It does not own question validation or participant UI rendering.

### Relay contract
Response and recording creation are idempotent by their opaque IDs.

This gives Eve at-most-once logical submission semantics across ambiguous network responses without exposing plaintext research data.

### `app.js` boundary
`app.js` may:
- configure the two participant domains;
- maintain participant session/status UI;
- render completion;
- expose the thin `submitParticipant()` UI delegate.

It must not regain answer serialization or recording/response delivery orchestration.

### Ratchet
v56.3 hard ceilings:
- `app.js`: 449,301 bytes / 1,996 lines
- `eve-participant-delivery.js`: 6,200 bytes / 150 lines
- `eve-participant-submit.js`: 12,200 bytes / 55 lines



## v56.4 — final visual polish layer

`eve-v56-polish.css` is now the final stylesheet loaded by the application.

It may own:
- spacing/density refinements;
- hover/focus/active presentation;
- responsive finishing;
- modal finishing;
- reduced-motion behaviour;
- consistent component sizing.

It must not:
- recreate Eve's colour/typography identity;
- contain application decisions;
- compensate for missing functionality;
- become a second general-purpose base stylesheet.

The load order is:

1. `styles.css`
2. `eve-v54-theme.css`
3. `eve-v56-polish.css`

This keeps the original application styles, the redesign identity and the final interaction polish as distinct concerns.

### Ratchet

v56.4:
- `app.js`: 449,286 bytes / 1,996 lines
- `eve-v56-polish.css`: <= 23,000 bytes / 980 formatted lines

UI work must not grow `app.js` to avoid undoing the structural-reliability programme.


## v56.5 — live-security boundary

`lib/live_security.js` now owns deployment safety rather than placing those checks into `app.js` or feature domains.

It owns:
- live-mode startup readiness;
- production response security headers;
- process-local abuse throttling;
- public deployment health state.

`server.js` owns only composition and relay storage limits.

Participant access uses a derived capability proof:
- browser/link retains the participant decryption key;
- publication metadata retains only its SHA-256 proof;
- server compares the supplied proof using timing-safe equality;
- encrypted study/response contents remain opaque to the relay.

Cloud connector management is now bound to the control-plane role system whenever authentication exists.

The monolith ratchet continues downward; security hardening must not be implemented by moving operational policy back into `app.js`.


## v56.6 — typography / editability boundary

Typography remains presentation-only.

The authoritative type tokens in `eve-v54-theme.css` now intentionally resolve both display and body text to the same system sans-serif stack.

`eve-v56-polish.css` owns:
- font weight/letter-spacing hierarchy;
- editable-title affordances;
- editable rich-text presentation.

`app.js` only contains the three accessibility labels required for visually inline editable title controls.

The architecture ratchet moves down again:
- `app.js`: 444,606 bytes / 1,908 lines.


## v57 — browser test boundary

Real-browser automation is deliberately outside the production application boundary.

Files:
- `tests/browser/playwright_support.py`
- `tests/browser/golden_journey_playwright.py`
- `tests/browser/participant_recovery_playwright.py`
- `scripts/run_playwright_release.py`
- `scripts/run-browser-e2e.js`
- `requirements-e2e.txt`

Playwright/Python are **development-only** dependencies. They are not required to start or operate Eve.

The browser harness starts the real `server.js` with:
- temporary relay data;
- a random local port;
- no real cloud/email/AI configuration.

Researcher and participant browser contexts are isolated.

No production `app.js` growth was required for v57. The v56.6 architecture ceiling remains in force.


## v57.1 — study presentation-theme boundary

Study presentation themes are a participant concern, not a workspace skin.

`eve-study-themes.js` owns:
- supported theme registry;
- default/fallback resolution;
- participant theme class selection;
- Study Settings theme-picker markup.

`eve-study-themes.css` owns:
- theme-picker presentation;
- participant/Preview theme rules.

`app.js` only:
- declares `presentationTheme:'default'` for new studies;
- renders the extracted theme picker in Study Settings;
- attaches the resolved theme class to Preview/participant shells;
- retains the selected theme in completion receipts.

Because the full study settings object is already part of each published snapshot, `presentationTheme` automatically follows immutable study versioning.

The researcher workspace is deliberately not themed by this feature.

Current architecture ratchet:
- `app.js`: 444,597 bytes / 1,905 lines
- `eve-study-themes.js`: 2,609 bytes / 48 lines
- `eve-study-themes.css`: 14,506 bytes / 114 lines


## v58 — downloadable / organisation-owned deployment boundary

The product is now explicitly split into three operational zones.

### Local researcher application
Runs on localhost and owns:
- decrypted researcher workspace;
- research creation/analysis;
- encryption/decryption keys;
- storage-provider integration;
- optional researcher-side AI/email integrations.

### Organisation durable storage
SharePoint/Google Drive owns encrypted durable research copies.

### Cloudflare participant relay
`cloudflare-relay/src/worker.mjs` owns only:
- public participant static application;
- encrypted publication transport;
- encrypted response/recording mailbox;
- invitation hashes/routing metadata;
- lifecycle state.

The relay does not receive the participant decryption key and does not hold SharePoint/Google OAuth tokens.

### Relay capabilities
v58 introduces a separate deployment owner capability in addition to the existing per-study administrator and per-version participant capabilities.

The owner capability prevents arbitrary study creation/storage consumption by somebody who only discovers a relay URL.

### Setup domain
`eve-setup.js` owns:
- first-run state;
- legacy migration behavior;
- relay URL abstraction;
- participant-app URL resolution;
- owner header construction;
- setup wizard interactions;
- setup health checks.

`app.js` consumes this seam but does not own deployment workflow.

### Participant Panel boundary
Panel signup/email is intentionally not added to the zero-access Worker because it operates on participant email/PII.

Until a separate operational public service is designed, Panel-signup studies are blocked when the standalone Cloudflare relay is selected.

### CSP
The local Node application now permits outbound HTTPS fetches in CSP so it can call a customer-owned remote relay. Participant Worker assets use same-origin relay calls.

### Architecture ratchet
v58 reduces `app.js` again by deleting obsolete structural comment scaffolding while extracting setup/deployment policy:
- `app.js`: 438,432 bytes / 1,796 lines
- `eve-setup.js`: first-run/relay setup domain
- `cloudflare-relay/src/worker.mjs`: Cloudflare transport domain


## v59 — deployment-provider architecture

Eve Core no longer treats localhost/Cloudflare as the only participant transport.

### `eve-deployment.js`
Owns environment detection and deployment-specific seams:
- standard fetch-backed relay transport;
- Apps Script `google.script.run` transport;
- Google Drive bridge calls;
- Google-native setup presentation;
- Apps Script URL-fragment recovery.

### Google Workspace runtime
The Google edition has two Apps Script web-app deployments from one project:

**Researcher deployment**
- restricted access;
- execute as the accessing user;
- creates/reads durable Drive workspace;
- requires Eve owner capability for researcher storage/admin operations.

**Participant deployment**
- access determined by participant population and Workspace policy;
- execute as the deploying user;
- serves the same browser participant runtime;
- accepts/retrieves opaque encrypted study/response envelopes;
- does not receive the participant decryption key.

### Drive layout
`Eve/Workspace` reuses Eve's existing encrypted cloud-workspace format.

`Eve/Relay` implements the same conceptual transport contract as the local/Cloudflare relay using Google Drive files.

This keeps Build/Review/crypto logic provider-independent.

### URL routing
Apps Script HTML Service runs in an IFRAME. v59 uses Google's `google.script.url.getLocation` bridge to recover the outer web-app fragment before Eve's existing router runs.

### Permission caveat
The initial Apps Script implementation uses `DriveApp`, so the OAuth scope is broad even though Eve's own code restricts itself to the `Eve` folder. Migrating the Google adapter to Advanced Drive with `drive.file` is a security-hardening priority before broad government rollout.

### Architecture ratchet
- `app.js`: remains below the v58 ceiling.
- provider-neutral setup stays in `eve-setup.js`.
- Google-specific setup/runtime behavior is extracted to `eve-deployment.js`.
- server-side Google transport is isolated in `google-workspace/Code.gs`.


## v59.1 — Google launcher and single-deployment boundary

Google Workspace distribution now assumes a **container-bound Apps Script project copied with a Google Sheet**.

### Sheet launcher
`google-workspace/Code.gs` owns the server-side launcher:
- `onOpen`
- `eveShowSetup`
- `evePrepareInstallation`
- `eveLauncherState`
- copy-identity reset
- generation/recovery of the deployment owner capability

`google-workspace/Launcher.html` owns only the Sheet setup dialog.

### One public web app
The researcher/participant distinction is capability-based rather than deployment-origin-based.

The public URL is not itself a researcher credential.

Researcher workspace operations require `EVE_OWNER_HASH` to match the owner capability supplied by the browser.

Participant publication/response operations retain their independent study/version capability checks.

### Secure install handoff
The Sheet launcher gives the researcher:

`WEB_APP_URL#/install?o=<owner capability>`

The browser deployment adapter consumes that fragment, asks Apps Script to validate/bootstrap it, updates the local encrypted setup state, and replaces the outer Apps Script history fragment with `/setup`.

The secret is therefore not sent to Apps Script as part of the HTTP request URL.

### Copy protection
`EVE_BOUND_FILE_ID` ties initialized Script Properties to the copied Google Sheet.

If a copied project inherits initialized Script Properties, a different bound Sheet ID clears:
- Drive root ID;
- owner email;
- owner capability hash;
- user-local owner key.

This prevents a public template copy from pointing at the template maintainer's Drive/root configuration.

### Monolith ratchet
`app.js` remains at the v59 hard ceiling. Secure-install and provider-specific behavior live in `eve-deployment.js`.


## v59.2 — capability and Google storage hardening

### Deployment capability registry
`eve-capabilities.js` is now the source of truth for what each deployment can genuinely execute.

Eve Core may contain a feature without every adapter exposing it.

UI, go-live validation and participant runtime consume this capability layer.

This prevents deployment drift from becoming a false product promise.

### Google Drive scope
The Google runtime no longer uses `DriveApp`.

It uses Drive API v3 with:
- `drive.file`;
- Apps Script OAuth token;
- `UrlFetchApp`.

The Eve root and descendants are app-created files, allowing the narrower scope.

The root's `driveId` is used to distinguish My Drive from Shared Drive.

### Response index
Google response transport stores:
- each encrypted response as its own file;
- one per-study response index containing response IDs and receipt times.

Paged researcher retrieval slices the index first and reads only those encrypted response files.

This removes the former full-folder/full-content read on every Review refresh.

### Remaining Google scale boundary
Response writes still use the Apps Script script lock to protect idempotence/index integrity.

Burst concurrency remains a load-test target before large-study claims.

### Update boundary
Google copies are user-owned code forks.

v59.2 can check a signed/public release manifest when the template maintainer configures a manifest URL, but it does not self-modify copied projects.

A safe update/migration workflow remains required before GA.


## v60 — full organisation-cloud runtime

### Runtime model
The same Node Eve runtime is packaged once as an OCI container.

`EVE_DEPLOYMENT_MODE=organisation-cloud` tells the browser that:
- participant transport is same-origin and already managed;
- full Eve capabilities remain available;
- deployment/provider details may alter setup copy/default storage, not the research product surface.

### Runtime config
`lib/runtime_config.js` emits only safe non-secret facts through `/eve-runtime-config.js`.

The browser consumes it before `eve-deployment.js`.

No cloud credential or secret is exposed there.

### Persistence
The v60 starter cloud profile retains the existing file-backed control plane on a persistent mounted volume.

Both Google and Azure templates constrain horizontal scale to one instance/replica.

This is an explicit architecture safety boundary.

### Deployment launcher
The repository-root `index.html`, `deployment.css`, `deployment.js` and `deployment-config.js` form the static deployment launcher. They are distribution-only and never host research data. The live Eve browser application is isolated under `/app`.

Its responsibility ends once the provider deployment starts.

It must never become a required runtime dependency for an organisation Eve.

### Image distribution
GitHub releases can publish an attested GHCR image.

Google Cloud can instead build the image directly inside the organisation project from the public source checkout.

### Response indexing
`lib/relay_response_index.js` prevents normal paged response reads from reparsing every response file.


## v60.1 — organisation-owned durable research provider

`lib/organisation_storage.js` provides the default durable cloud research store for `organisation-cloud` deployments.

It is intentionally separate from OAuth-based document connectors.

Browser `cloud-storage.js` treats `organisation` as a normal provider and reuses the existing encrypted workspace/reconciliation formats.

The server only sees the encrypted file content being persisted.

This removes Google/SharePoint OAuth registration from the critical deployment path while preserving those connectors as optional integrations.

The provider writes under:

`RESEARCHOS_RELAY_DATA/organisation-storage`

which maps to the cloud-owned persistent volume configured by the Google/Azure deployment template.

## v61 — PostgreSQL operational control plane

`lib/state_store.js` introduces a persistence seam for mutable Eve service state.

The file backend preserves local/simple compatibility. The Postgres backend supplies shared state and transaction/advisory-lock coordination for organisation-cloud deployments.

Migrated domains register their previous JSON file as a legacy migration source rather than owning storage directly.

`lib/platform_services.js` composes the control plane, connectors, organisation storage and live-security layer around the same state store.

`lib/http_buffer.js` prevents transactional HTTP handlers from committing a success response to the network before the corresponding database transaction has completed.

Encrypted research storage remains intentionally separate from this operational database.
