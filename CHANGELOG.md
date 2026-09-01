# Eve v63.0.0 — simplified operating model

- Made `main` the continuous **Eve Beta** channel: validation, Beta container, Local + Relay download and public Beta installer publish automatically after a push.
- Added an explicit **Promote Eve to stable** GitHub workflow that reruns validation, creates the immutable version tag, publishes versioned/`latest` containers, creates release ZIPs/checksums and updates the Stable installer.
- Added a browser-ready GitHub Codespaces devcontainer so maintainers can open a complete Eve development environment without installing Git or Node locally.
- Simplified the researcher installer to **Your organisation's cloud** or **This computer**, revealing Google/Azure only after the cloud choice.
- Added a Beta/Stable public channel landing page; researchers never need to use GitHub source or deployment scripts.
- Removed the normal requirement to run the canonical-repository setter: GitHub Actions derives the repository automatically when publishing. The setter remains as an offline/manual fallback.
- Added automated release artifact construction and SHA-256 generation.
- Retained Google Cloud, Azure Standard, Azure Private and Local + Relay deployment capability.

# Eve v62.5.0

## Verified recording handoff and relay retention

- Local + Relay recordings are copied into the selected SharePoint/Google Drive durable store before relay cleanup is allowed.
- Eve reads the encrypted recording back from durable storage and verifies its recording/response identity before scheduling deletion.
- Eve keeps an encrypted local playback cache so recordings remain reviewable after the relay copy is removed.
- Recording metadata records the verified durable provider/path and relay purge time.
- The Cloudflare relay now supports authenticated recording-retention scheduling with a 48-hour default grace period.
- A Cloudflare Cron Trigger runs hourly and deletes only recordings whose verified retention deadline has passed.
- Failed durable writes, failed read-back verification, missing study keys or failed retention scheduling leave the relay recording untouched for retry.
- Added integration coverage for both the browser durable-handoff path and the R2 retention lifecycle.

# Eve v62.4.0

## Local + Relay installation profile

- Added **Researcher computer + relay** as a third first-class deployment choice beside Google Cloud and Microsoft Azure.
- Added a versioned local-relay kit for Windows, macOS and Linux.
- The local Eve server now binds to `127.0.0.1` by default; cloud deployments continue to set `HOST=0.0.0.0` explicitly.
- Added a public launcher download flow plus local setup guide.
- GitHub Pages publishing now builds and stages the local-relay kit automatically.
- The local kit includes Eve, OS start scripts and the existing zero-access Cloudflare Worker/R2 relay.
- Relay deployment now installs its bundled Wrangler dependency automatically when needed.
- Durable research remains encrypted and can be synced to approved SharePoint/Google Drive; participants never connect directly to the researcher’s machine.

# Eve v62.3.0

## Canonical repository root launcher

- Moved the public “Create your organisation’s Eve” launcher to the repository root.
- Moved the Eve browser application runtime and static assets under `/app`.
- The Node service now serves `/app` as the live Eve application root, so the repository root can remain the public deployment surface without changing deployed Eve URLs.
- GitHub Pages now stages only the four root launcher assets rather than publishing an internal `/factory` directory.
- Renamed the public launcher assets to `deployment.js`, `deployment.css`, and `deployment-config.js`; “Factory” remains an internal provisioning concept, not researcher-facing navigation.
- Updated canonical-repository tooling and Azure image references for v62.4.0.

# v62.2.0 — Private Azure profile and canonical public release setup

### Azure deployment
- Added a second Azure security profile in Factory: **Standard Azure** or **Private network**.
- Private Azure creates a dedicated VNet, an internal-only Container Apps environment, VNet-integrated PostgreSQL Flexible Server, an Azure Files private endpoint and private DNS.
- Private Azure creates no public Eve endpoint; access is expected through an organisation-managed VNet route, VPN, ExpressRoute or peered network.
- Added `EVE_AZURE_NETWORK_PROFILE` runtime metadata for clearer diagnostics.
- Corrected Azure GHCR image pinning so ARM templates use the same `62.2.0` tag format emitted by the included GitHub Actions publishing workflow.

### Canonical distribution
- Added `CANONICAL_PUBLIC_EVE.md` with the exact repository/container/Factory publication path.
- Added `scripts/set-canonical-repository.js` to replace the public GitHub/GHCR placeholders consistently.
- Added a GitHub Pages workflow that publishes Factory only after canonical repository placeholders have been removed.
- Factory now knows separate ARM templates for Standard and Private Azure.
- Added regression coverage for the private-network resources, public-network denial, Factory profile choice and canonical-release wiring.

# v62.1.0 — Dual-cloud Factory and browser-first Azure deployment

- Factory now starts with an explicit Google Cloud / Microsoft Azure choice and shows only the selected deployment journey.
- Added direct-link hash states (`#google` / `#azure`) and an accessible **Change cloud** path.
- Reworked Azure into the same browser-first handoff model as Google using the official Deploy to Azure ARM-template route.
- Removed Factory's manual three-secret copy/paste handoff for Azure.
- Azure now generates connector and PostgreSQL secrets as secure ARM parameter defaults.
- Azure researchers normally enter only the first-admin email, workspace name and temporary first-admin password in addition to Azure subscription/resource-group/region choices.
- Added Azure one-click documentation and dual-cloud Factory regression coverage.

# v62.0.0 — Browser-first organisation deployment

- Added root `app.json` support for the Google Cloud Run deployment button.
- Eve Factory now uses browser-first Google deployment by default, with Cloud Shell as an advanced fallback.
- Added `deploy/google/cloud-run-button-finalize.sh` to provision Cloud SQL, Cloud Storage, Secret Manager and the runtime service identity from the browser deployment flow.
- The Google bootstrap service remains private until the complete live runtime is configured.
- Fixed organisation-cloud setup normalisation that incorrectly converted `organisation` storage back to Microsoft/SharePoint.
- Organisation-cloud startup repairs stale browser default-storage state back to built-in organisation storage.
- Optional connector authentication/configuration failures no longer display a global storage failure banner when built-in organisation storage is healthy.
- Explicit per-study SharePoint/Drive choices remain explicit and still require their connector.

# v61.1.0 — Theme switcher and Builder page deletion

- Replaced the participant-theme hidden radio/label interaction with explicit buttons and `aria-pressed` state.
- Added an immediate **Preview participant theme** action that previews the draft theme rather than an older live version.
- Builder page headers now always expose **Delete page**. It is disabled, with an explanation, only when the study has a single required page.
- Existing page deletion confirmation and block cleanup behavior is unchanged.
- Added regression coverage for both issues.

# v61.0.0 — PostgreSQL concurrent control plane

## Operational database
- Added `lib/state_store.js` with file/PostgreSQL backends.
- Migrated accounts, sessions, organisation state, collaboration, Panel, Entra/OAuth state, AI/email settings and connector vault state to the shared store.
- Existing JSON control-plane files seed missing PostgreSQL state on first database startup.
- Added transaction-scoped PostgreSQL advisory locking.

## Multi-instance safety
- Control-plane HTTP responses are buffered until database persistence commits.
- Per-study relay operations use PostgreSQL advisory locks.
- Organisation-storage mutations are also lock-coordinated.
- Health/readiness now includes database state health.

## Google Cloud
- Deployment now provisions Cloud SQL PostgreSQL 16.
- Cloud Run default maximum increases from 1 to 3 instances.
- Database password stored in Secret Manager.
- Cloud Run service account receives Cloud SQL Client.
- Cloud Storage FUSE metadata/stat/type caching disabled for shared-runtime consistency.

## Azure
- ARM template now provisions Azure Database for PostgreSQL Flexible Server.
- Container Apps replica count is configurable (default 3).
- Database credential is injected as a Container App secret.

## Docker
- Compose deployment now includes PostgreSQL 16.

## Architecture
- Added `lib/platform_services.js` and `lib/http_buffer.js` to keep `server.js` composition-focused.
- Added `pg` production runtime dependency.

## Validation
- Added PostgreSQL migration/cross-instance state tests.
- Added control-plane persistence contracts.
- Added Google/Azure/Docker database deployment contracts.
- Historical v50–v60.1 regression suite retained.

# v60.1.0 — OAuth-free organisation research storage

## Google setup simplified
- Google Drive OAuth registration is no longer required before Eve can run research.
- Full Google Cloud deployments default to built-in organisation-owned cloud storage.
- Research is browser-encrypted before upload to the built-in store.
- Google Drive/Shared Drive remains an optional secondary connector.

## Organisation storage service
- Added `lib/organisation_storage.js`.
- Authenticated read/write/delete/list/status API.
- Dedicated storage root under the deployment's persistent volume.
- Safe path validation and traversal protection.
- Atomic file writes.
- Upload/listing safety limits.

## Browser storage adapter
- Added `organisation` as a first-class storage provider.
- Full cloud deployments automatically detect it as connected.
- Cloud sync/recovery uses the same encrypted workspace format as Drive/SharePoint.
- Storage page shows the built-in provider alongside optional Google Drive and SharePoint connectors.

## First-run experience
- Organisation-cloud Storage step is now pre-connected.
- Explicitly says no OAuth client is required.
- Participant connection remains pre-provisioned.
- Researcher can proceed directly to recovery/final checks.

## Provider deployments
- Google defaults to organisation storage and sets a Google Cloud storage label.
- Azure defaults to organisation storage and sets an Azure storage label.
- Drive/SharePoint OAuth stays available only when those optional integrations are wanted.

## Tests
- Added organisation-storage service CRUD/path-safety tests.
- Added OAuth-free Google/Azure deployment contract tests.
- Full v50–v60.1 conventional suite passes.

# v60.0.0 — Full Eve cloud clone / Eve Factory

## One full product
- New preferred architecture deploys the complete Node Eve application into the organisation's cloud.
- Organisation-cloud mode retains the full Eve capability set.
- Google Apps Script remains only as an optional legacy/lightweight compatibility route.

## Portable container
- Added `Dockerfile`.
- Runs as the non-root Node user.
- Adds health check.
- Uses `/data/eve` as persistent operational mount.
- Added generic Docker Compose deployment.

## Runtime deployment config
- Added `/eve-runtime-config.js`.
- Browser receives only non-secret deployment facts.
- Added `organisation-cloud` runtime mode.
- Organisation-cloud first-run setup recognises that the participant service is already deployed.
- Factory deployments default storage choice toward Google Drive or SharePoint without removing the other full integrations.

## Google Cloud
- Added browser/Cloud-Shell deployment.
- Cloud Build builds Eve inside the target project.
- Cloud Run hosts the full application.
- Cloud Storage is mounted for persistent operational state.
- Secret Manager holds bootstrap and connector secrets.
- Dedicated runtime service account.
- Safe starter profile capped at one Cloud Run instance.

## Microsoft Azure
- Added Deploy-to-Azure ARM template.
- Azure Container Apps hosts full Eve.
- Azure Files provides persistent operational storage.
- Bootstrap and connector credentials are Container App secrets.
- Safe starter profile capped at one replica.

## Eve Factory
- Added static `factory/` application.
- Google handoff uses Open in Cloud Shell.
- Azure handoff uses standard Deploy to Azure.
- Azure secrets are generated locally with Web Crypto.
- Factory is explicitly not a research-data service.

## Release container
- Added GitHub Actions workflow to publish Eve to GHCR.
- Adds provenance attestation for published images.

## Relay scaling
- Full Node relay now maintains a per-study response index.
- Paged response retrieval reads only the requested response files.
- Index logic extracted to `lib/relay_response_index.js`.

## Architecture
- Dynamic browser runtime facts extracted to `lib/runtime_config.js`.
- Server remains under its existing size ceiling despite full-cloud support.

# v59.2.0 — Deployment truth + Google hardening

## Deployment capability gating
- Added `eve-capabilities.js` as the explicit capability registry.
- Google Workspace now declares unsupported:
  - Recording blocks;
  - Navigation audio/video/screen capture;
  - Participant Panel;
  - organisation email;
  - external AI;
  - team collaboration/RBAC;
  - organisation SSO;
  - automated recruitment email.
- Unsupported Builder blocks appear disabled.
- Existing unsupported blocks show a clear explanation.
- Go-live validation blocks studies that rely on unsupported deployment capabilities.
- Participant runtime refuses a study that somehow reaches a deployment that cannot execute its required capabilities.
- Global Settings hides Google-inapplicable AI, Microsoft email and team-role configuration.
- Workspace health no longer marks intentionally unsupported services as broken.
- Standalone Cloudflare mode retains its existing Participant Panel restriction.

## Google Drive permission hardening
- Removed broad `DriveApp` usage from the Google runtime.
- Apps Script now requests `drive.file` rather than full Drive access.
- Drive file/folder operations use the Drive v3 API through the Apps Script OAuth token.
- Added `script.external_request` for those Drive API calls.
- Added Shared Drive detection for the Eve root.
- Storage UI reports My Drive vs Shared Drive ownership.
- Setup recommends moving the app-created Eve root into an approved Shared Drive for organisation-owned use.

## Google response indexing
- Added a per-study response index.
- Review pagination reads only the requested response files instead of opening every response file on each refresh.
- Legacy response folders rebuild the index once when first read.
- Idempotent response behavior remains intact.

## Update awareness
- Added `EVE_VERSION`.
- Added optional `EVE_UPDATE_MANIFEST_URL`.
- The copied Google Sheet launcher can check a public release manifest and surface an available version.
- Updates remain explicit/advisory; Eve does not silently rewrite a researcher's copied Apps Script project.

## Product clarity
- Replaced the pension-specific default study with an explicit neutral **Example study — try Eve**.
- Renamed deterministic Review heuristics from “AI Researcher” to **Local Evidence Summary**.
- Reset public documentation around current deployment choices and security boundaries.

## Assurance
- Added v59.2 capability-gating tests.
- Added drive.file/source-scope tests.
- Added response-index pagination tests.
- Added Google update-awareness tests.

# v59.1.0 — Google Sheet launcher / single Apps Script deployment

## Researcher setup simplified
Google Workspace setup is now designed around a copyable Google Sheet with a bound Apps Script project.

The Sheet adds:

`Eve → Set up / open Eve`

and a guided launcher dialog.

## One deployment
- Removed the requirement for separate researcher and participant Apps Script deployments.
- One web-app deployment now serves both researcher and participant browser experiences.
- Researcher operations remain protected by Eve's private deployment-owner capability.
- Participant studies continue to use their own per-study/per-version capabilities.

## Secure launch
- The copied Sheet prepares the owner capability before public deployment.
- The launcher builds a secure Eve URL with the owner capability in the URL fragment.
- Apps Script `google.script.url.getLocation` reads the fragment.
- `google.script.history.replace` removes the install capability from the visible URL immediately after it is consumed.
- A fresh browser can be authorised later by reopening the copied Sheet launcher.

## Copy safety
- Eve records the bound spreadsheet ID.
- If Script Properties are inherited into a copied template, a different Sheet ID clears inherited owner/root properties.
- The copied researcher receives a fresh owner capability and Eve Drive root.

## Workspace access
- Single-deployment researcher Drive access is capability-based rather than dependent on the web-app visitor identity.
- The public web-app URL alone cannot access workspace files.
- Wrong/missing owner capability is rejected.

## Google template files
Added/updated:
- `google-workspace/Launcher.html`
- Sheet `onOpen()` Eve menu
- `evePrepareInstallation()`
- `eveLauncherState()`
- `TEMPLATE_PUBLISHING.md`

## OAuth
- Added `spreadsheets.currentonly` for the bound Google Sheet launcher.

## Tests
- Added copied-Sheet launcher emulation.
- Added single-deployment owner-capability tests.
- Added copy/reset boundary tests.
- Added source contract for secure install-fragment consumption.
- Full v50–v59.1 suite passes.

# v59.0.0 — Google Workspace zero-install edition

## Deployment abstraction
- Added `eve-deployment.js` as the runtime/provider seam between Eve Core and the environment that hosts participant transport/storage.
- Existing localhost/Cloudflare behavior remains the Standard adapter.
- Added native Google Apps Script detection through `google.script.run`.
- Study publication, lifecycle, participant retrieval/submission, recording retrieval and response collection now use `EveDeployment.relayFetch(...)`.
- Participant link generation resolves through the deployment adapter.
- Apps Script web-app URL fragments are read with `google.script.url.getLocation`, allowing Eve's existing `#/s/...` participant links to work inside Google's IFRAME HTML-service runtime.
- Service-worker registration is skipped inside Apps Script.

## Google Workspace edition
New `google-workspace/` project:
- private researcher web-app deployment;
- public/domain participant web-app deployment;
- browser app hosted by Apps Script HTML Service;
- researcher Google Drive storage;
- Drive-backed encrypted participant response service.

## Google Drive storage
- Apps Script bootstrap claims the project to the signed-in researcher and Eve owner capability.
- Creates `My Drive / Eve`.
- `Workspace/` stores Eve's durable encrypted workspace files.
- `Relay/` stores encrypted publication/response/recording envelopes and routing metadata.
- Existing Eve cloud-sync/recovery format is reused rather than introducing a second data model.
- Native Google mode implements write/read/delete/list through `google.script.run`.

## Google participant response service
Apps Script implements:
- health and owner checks;
- encrypted/versioned study publication;
- Live/Off lifecycle;
- participant capability checks;
- encrypted response submission;
- idempotent retries;
- researcher response collection;
- encrypted recording transport with a conservative size ceiling;
- controlled-audience invitation hashes;
- study deletion.

## Researcher/participant separation
- Researcher deployment should be restricted and run as the accessing user.
- Participant deployment executes as the deploying user and can be exposed only as broadly as the study requires.
- Researcher storage functions require both the signed-in owner identity and Eve owner capability.
- Participant-side functions never receive the owner capability.

## First-run setup
- Google Apps Script runtime automatically switches the setup wizard to a Google-native path.
- Storage step becomes Google Drive initialization rather than OAuth-client configuration.
- Participant step guides the researcher through the second Apps Script web-app deployment and accepts its public URL.
- Standard local/Cloudflare setup remains unchanged outside Apps Script.

## Known boundaries
- Google Workspace administrators can restrict Apps Script, Drive access and public/anonymous web apps.
- v59 uses built-in `DriveApp`, which requires full Drive scope; a `drive.file` advanced-Drive implementation is the next security-hardening target.
- Large media recording is not yet production-ready through Apps Script.
- Participant Panel signup/email remains outside the Google response service.

## Tests
- Added Google deployment-adapter unit tests.
- Added an in-memory Apps Script/Drive integration harness testing researcher ownership, encrypted publication, participant capability checks, idempotent submission and researcher response collection.
- Added Google Workspace source/distribution contract tests.
- Full existing v50–v59 Node suite remains green.

# v58.0.0 — Downloadable / organisation-owned Eve

## First-run setup
- Fresh Eve installations now open a guided setup wizard before the workspace.
- Existing encrypted workspaces migrate as completed legacy/local setups and are not blocked.
- Setup is reopenable later from Global Settings.

Wizard stages:
1. organisation storage;
2. participant relay;
3. encryption/recovery;
4. final readiness checks.

A clearly labelled **local evaluation mode** remains available for trying Eve on one computer without pretending it is live-deployment ready.

## Organisation storage onboarding
- Setup can select SharePoint or Google Drive.
- Researchers can start the existing OAuth connection from the wizard.
- Advanced SharePoint/document-library setup remains available on the Storage page.
- Storage shows a **Return to setup** banner while first-run configuration is incomplete.

## Cloudflare Eve Relay
New `cloudflare-relay/` package:
- Worker API;
- R2 encrypted mailbox;
- static participant application;
- Wrangler configuration;
- Windows/macOS/Linux deployment helpers;
- owner-key setup documentation.

The relay implements:
- encrypted study publication/versioning;
- participant capability enforcement;
- live/off lifecycle;
- encrypted response submission;
- idempotent response retry;
- encrypted recording submission/retrieval;
- controlled-audience invitation hashes;
- researcher response collection;
- owner capability check;
- static participant application delivery.

## Remote relay routing
The local Eve application no longer assumes participant transport lives on the same localhost origin.

When Cloudflare relay mode is configured, Eve routes:
- health checks;
- publication;
- lifecycle changes;
- response collection;
- recording retrieval;
- invitation registration;
- study deletion

to the configured relay URL.

Participant links use the relay/static participant-app base rather than the researcher's localhost URL.

## Relay ownership
- Added a deployment-wide random relay owner key.
- It is stored inside Eve's encrypted workspace/recovery data.
- Researcher/admin relay operations send it via `X-Eve-Owner`.
- It is never placed into participant links.
- The Worker requires the owner key before accepting researcher publication/admin calls.

## Browser security
- Local Eve CSP now allows outbound HTTPS connections so the localhost application can communicate with an organisation-owned Cloudflare relay.
- Cloudflare API responses implement cross-origin headers for localhost researcher access.
- Static participant assets remain security-header protected.

## Participant Panel boundary
- Standalone Cloudflare relay returns an explicit unsupported response for Panel operations.
- Eve blocks Panel-signup studies from live publication when standalone Cloudflare relay mode is selected.
- This avoids silently moving participant email/PII into a zero-access transport component.

## Distribution
New:
- `START_HERE.md`
- `DISTRIBUTION.md`

Start scripts now fail with a useful message when Node.js is missing.

## Tests
- Added first-run/distribution contract tests.
- Added in-memory R2 integration tests for the Cloudflare Worker.
- Added a Playwright first-run setup journey.
- Existing Playwright journeys automatically choose explicit local evaluation mode in disposable test workspaces.

# v57.1.0 — Per-study participant themes

## Study Settings
- Added **Participant theme** to Study settings.
- Theme selection is stored per study.
- Existing studies resolve to **Default**.
- New studies explicitly start on **Default**.
- Theme choice is part of the published study snapshot, so participants see the theme that belongs to that published version.

## Themes

### Default
- Preserves the existing Eve participant presentation unchanged.

### GDS
- Added a GOV.UK Design System-inspired participant presentation.
- Uses the established GOV.UK palette:
  - black `#0b0c0c`
  - blue `#1d70b8`
  - green `#00703c`
  - focus yellow `#ffdd00`
  - error red `#d4351c`
  - light grey `#f3f2f1`
- Uses square, high-contrast form controls and actions.
- Uses GOV.UK-style yellow/black focus treatment.
- Uses Arial/Helvetica fallbacks rather than bundling proprietary GDS Transport.
- Does not add GOV.UK branding or the Crown logo.

## Preview / participant runtime
- Preview uses the selected study theme.
- Published participant studies use the selected theme.
- Completion receipts retain the theme for same-tab completion recovery.
- Theming covers common controls and specialist research-method surfaces.

## Architecture
- Added `eve-study-themes.js` for the theme registry/normalisation/Settings markup.
- Added `eve-study-themes.css` for participant-only theme styling.
- The researcher UI is deliberately outside the study-theme styling boundary.
- `app.js` remains below the previous architecture ceiling.

## Tests
- Added deterministic Default/GDS theme tests.
- Added a Playwright GDS theme journey to the browser release suite.
- Service worker caches the new theme assets.

# v57.0.0 — Real-browser release gate

## Playwright E2E
- Added a Playwright browser test harness under `tests/browser/`.
- Browser QA is release tooling only; Eve's production Node/browser runtime remains dependency-free.
- Added cross-platform `npm run e2e` wrapper.
- Added `npm run release:check`:
  - syntax/static checks
  - full existing Node regression suite
  - real-browser E2E

## Golden browser journey
The release browser opens a real Chromium instance and exercises:
- New study
- Builder title editing
- participant Preview
- Settings
- Send
- Go live
- participant access from a separate browser context
- encrypted participant submission
- Review response retrieval
- Insight capture
- Turn off
- closed-link rejection
- researcher reload/persistence

## Participant delivery failure journey
The second browser scenario deliberately intercepts response POSTs and returns HTTP 503:
- automatic transient retry is exercised;
- Eve reaches `Response waiting to send`;
- `Retry sending` is presented;
- the injected outage is removed;
- submission completes without repeating the study;
- Review confirms one logical response.

## Browser isolation
Researcher and participant journeys use separate browser contexts so the participant cannot accidentally use the researcher's IndexedDB/local workspace.

## Environment note
The build environment used for this release includes Python Playwright and Chromium, but its Chromium installation is governed by a machine-level `URLBlocklist: ["*"]` policy. That policy blocks navigation even to localhost. The Playwright suite is therefore compiled/source-gated here but cannot be executed in this sandbox without bypassing an administrator security policy, which Eve deliberately does not do.

Run `npm run e2e` in normal developer/CI Chromium before promoting a deployment candidate.

# v56.6.0 — Typography clarity + editable-text affordance

## Typography
- Removed the remaining Caprasimo / Georgia display-serif stack.
- Removed the separate Figtree body-face assumption.
- Eve now uses one system sans-serif stack across headings, body copy, controls and participant surfaces.
- Heading hierarchy now relies on weight, scale and spacing rather than a decorative typeface.
- Study/page/block titles use stronger sans weights and slightly tighter tracking for clearer scanning.

## Editable text
- Study title, page title and section title now show a subtle dotted underline and small pencil icon.
- The affordance becomes slightly stronger on hover and focus.
- The cue is suppressed when Builder is in drag-overview mode and text is not editable.
- Rich-text formatting bars now include a quiet `Editable` marker.
- Builder inline list/card inputs retain a visible but restrained boundary.
- Added explicit accessible labels to Study / Page / Section title fields.

## Architecture
- Removed repetitive architectural comment scaffolding already enforced by automated architecture tests.
- `app.js` drops from 448,202 bytes / 1,967 lines in v56.5 to **444,606 bytes / 1,908 lines** in v56.6.
- The lower values are now the enforced architecture ceiling.

# v56.5.0 — Live Readiness

## Fail-closed live mode
- Added `EVE_LIVE_MODE=true`.
- The server refuses to start in live mode unless:
  - Eve authentication is configured;
  - `RESEARCHOS_RELAY_DATA` is explicitly set;
  - the data path is writable;
  - `EVE_PUBLIC_ORIGIN` is HTTPS.
- Added minimal `/api/readiness` endpoint for deployment health checks.

## Participant capability protection
- New publications include a one-way SHA-256 proof of the high-entropy participant key.
- The relay requires that capability for study retrieval, response submission and recording submission.
- The participant decryption key remains in the URL fragment/browser and is not sent to the relay.
- Slug knowledge alone is no longer sufficient for current v56.5 participant publications.

## Abuse/storage controls
- Added rate limiting for login, public study retrieval, study publication, participant responses, recordings, Panel join/participation and connector OAuth starts.
- Added per-study response/recording storage ceilings.
- Existing idempotent retry behaviour remains intact.

## Researcher/API hardening
- Cloud connector administration now follows Eve role authentication when accounts are configured.
- Added CSP, frame blocking, permissions policy, HSTS on HTTPS, and existing no-sniff/referrer policies across responses.
- Public health/readiness endpoints intentionally expose minimal deployment information.

## Filesystem hardening
- Relay data directories use owner-only `0700` permissions where supported.
- Relay JSON/encrypted payload files use owner-only `0600` permissions.
- Persistent relay-data path is mandatory in live mode.

## Self-hosted/network hardening
- Removed the Google Fonts runtime dependency.
- Eve now uses its existing local/system font fallbacks when self-hosted.

## Live release gate
The integration suite now boots the real server in live mode and verifies:
- authentication bootstrap;
- HTTPS readiness;
- persistent-path readiness;
- security headers;
- Secure/HttpOnly/SameSite session cookie;
- connector authentication;
- participant capability rejection/acceptance;
- idempotent participant submission;
- login throttling;
- owner-only relay file permissions.

# v56.4.0 — Platform-wide UI / UX polish

This release deliberately adds no new research feature. It is a finishing pass over the existing product.

## New final polish layer
- Added `eve-v56-polish.css`, loaded after the existing v54 theme.
- The file owns interaction density, finishing behaviour, responsive polish and reduced-motion handling.
- The existing plum / lilac / off-white visual identity is unchanged.
- The new layer is included in the offline service-worker shell.

## Global interaction polish
- Standardised 44px control height and 14px control radius across the workspace.
- Improved primary / subtle / destructive button hierarchy.
- Added restrained hover lift only to genuinely interactive cards.
- Improved disabled/busy states.
- Standardised form label weight, hint spacing, focus treatment and textarea behaviour.
- Added cleaner toolbar wrapping and action spacing.
- Reduced decorative visual noise in lifecycle and recording labels.

## Navigation + chrome
- Refined top-bar and Study Flow spacing.
- Improved context-title truncation.
- Smoothed sidebar hover behaviour without adding animation noise.
- Study Flow remains horizontally usable on narrow screens.

## Home + Studies
- Improved dashboard spacing and card rhythm.
- Refined actionable Needs-you rows.
- Study library toolbar is sticky on desktop and falls back to normal document flow on mobile.
- Study cards now have clearer hover, progress and next-action hierarchy.

## Builder
- Refined outline spacing, page headings, block spacing and selected-block emphasis.
- Insert-step affordances stay quiet until the block is hovered or keyboard-focused.
- Rich-text toolbars and the section-settings drawer are visually tighter.
- Section-settings header remains visible while scrolling long settings.

## Settings
- Improved card padding and icon proportions.
- Global email configuration and templates have clearer internal grouping.
- Integration-health blocks use a more consistent rhythm.

## Send
- Refined Launch Readiness spacing and hierarchy.
- Readiness score now reads as a compact summary rather than a large badge.
- Launch checks have calmer ready/attention surfaces and clearer hover affordance.
- Segment cards/settings use consistent corner radius and dividers.
- Narrow layouts collapse readiness and segment settings cleanly to one column.

## Review + Insights
- Improved sticky Review tab treatment.
- Evidence → Insights actions wrap more cleanly.
- Evidence rows have clearer hover and editing affordance.
- Review quotes use more readable spacing and line-height.
- Tables now use consistent borders, sticky headers and subtle row hover.
- Insight Bank cards, evidence blocks and search/filter spacing are more consistent.

## Modals + empty states
- Modal backdrop is softer and uses restrained blur.
- Modal cards have clearer elevation, radius and sticky headers where applicable.
- Mobile modals behave more like bottom sheets.
- Empty states use more consistent spacing and calmer copy hierarchy.
- Toasts have improved sizing, spacing and mobile placement.

## Participant experience
- Participant shell uses a softer background and more deliberate card elevation.
- Page/study headings have improved wrapping and spacing.
- Choice controls have clearer hover/selected states.
- Page navigation is cleaner and becomes a two-column mobile layout with the page count above.
- Participant status/retry controls remain visible and consistent with the v56.3 recovery flow.

## Accessibility + motion
- Existing focus-visible work is retained and complemented by form-specific focus styling.
- Added a platform-wide `prefers-reduced-motion` rule that disables non-essential motion.
- Narrow layouts retain minimum target sizes while reducing unnecessary padding.

## Architecture
- `app.js` remains below the v56.3 ceiling and shrank slightly:
  - v56.3: 449,301 bytes / 1,996 lines
  - v56.4: 449,286 bytes / 1,996 lines
- UI polish is isolated from operational modules.
- `eve-v56-polish.css` has its own architecture budget.

# v56.3.0 — Recoverable participant submission

## Participant response delivery extraction
- Added `eve-participant-delivery.js`.
- Added `eve-participant-submit.js`.
- Participant response validation/serialization, recording persistence and response-delivery orchestration are no longer implemented inside `app.js`.
- `app.js` now supplies browser/UI dependencies and delegates submission to the extracted production domain.

## Stable submission identity
- A participant response ID is created once and retained in the participant session draft.
- Retrying the same completed response reuses that response ID.
- Recording sessions also retain a stable recording ID across retries in the same tab.
- This prevents retries from creating duplicate response or recording records.

## Pending completed response
- Once all required recordings have been persisted, Eve saves the complete deliverable response in session storage before attempting final response submission.
- If delivery fails, Eve distinguishes it from an ordinary incomplete-form error.
- The completed response is locked and presented as **Response waiting to send**.
- The participant gets a dedicated **Retry sending** action instead of being asked to repeat the study.
- On page reload, Eve detects the pending completed response and automatically retries it.
- After confirmed delivery, the pending record and ordinary participant draft are cleared and the normal completion receipt is shown.

## Relay idempotence
- Response POST is now idempotent by response ID.
- Recording POST is now idempotent by recording ID.
- A retry of an already-stored response/recording returns the original acknowledgement rather than a duplicate error.
- Existing stored responses/recordings can still be acknowledged after a study is turned Off, which safely resolves a lost acknowledgement.
- A genuinely new response still cannot be submitted after participant access is Off.
- Controlled-audience retries of the same response ID succeed after the invitation is consumed; a different response ID using that consumed invitation is still rejected.

## Automatic retry
- Participant response and recording transport retries transient network/server failures.
- Non-retryable access/validation failures stop immediately.
- Retries always preserve the original response/recording ID.

## Architecture ratchet
- v56.2 `app.js`: **458,211 bytes / 2,020 lines**
- v56.3 `app.js`: **449,301 bytes / 1,996 lines**
- reduction this release: **8,910 bytes / 24 lines**
- cumulative reduction versus the v55.4 baseline: **20,477 bytes**
- participant delivery and submit modules have separate hard budgets.

## Regression coverage
Added deterministic tests for:
- transient response failures and retry;
- non-retryable response failure;
- pending-response persistence;
- successful resume after page reload;
- stable recording IDs;
- local-only response persistence;
- stale pending-response rejection;
- session-storage failure honesty;
- real relay response idempotence;
- real relay recording idempotence;
- retry acknowledgement after study Turn off;
- controlled-audience response retry;
- stable browser draft response IDs;
- automatic recovery UI wiring.

# v56.2.0 — Study lifecycle extraction + relay reconciliation

## Complete Study lifecycle extraction
- Moved Go live / Update live / Reopen / Turn off operational policy out of `app.js` into `eve-study-lifecycle.js`.
- `app.js` now configures dependencies and exposes thin delegates only.
- The extracted lifecycle domain owns:
  - first publication;
  - publishing a changed live study;
  - restoring a missing participant link;
  - reopening an Off study;
  - turning a study Off;
  - lifecycle operation locking;
  - publication rollback decisions;
  - participant-relay confirmation.

## Shared transaction seam
- New publication, reopen and Turn off paths use `EveTransactions`.
- State snapshot/restore and rollback persistence are no longer independently reimplemented in `app.js`.
- If a live-study update reaches the relay but the final local delivery-state save fails, Eve closes participant access and aligns the local study to **Off** while retaining the researcher’s changes.

## Ambiguous network reconciliation
- Added administrator-only `GET /api/studies/:slug/status`.
- It reports relay lifecycle state and available published versions without exposing encrypted study contents.
- Client lifecycle operations use that status to reconcile cases where the server may have committed an operation but the browser lost the response.

## Idempotent publication retry
- Same-version `PUT /api/studies/:slug` is now idempotent for the authorised administrator.
- This permits safe retry after a dropped/ambiguous response.
- Older versions are still rejected and cannot overwrite the latest relay version.
- Higher versions still advance the immutable publication history normally.

## Architecture ratchet
- v56.1 `app.js`: **463,692 bytes / 2,078 lines**
- v56.2 `app.js`: **458,211 bytes / 2,020 lines**
- reduction this release: **5,481 bytes / 58 lines**
- cumulative reduction since v55.4: **11,567 bytes**
- `eve-study-lifecycle.js` has its own hard size budget.

## Deterministic lifecycle failure matrix
Added production-module scenarios for:
- normal first publication;
- relay unavailable before publication;
- Panel registration failure;
- local save failure;
- server commit + lost browser response;
- final delivery-state persistence failure;
- failed update to an already-live study;
- successful reopen;
- expired closing time;
- Turn off PATCH response loss;
- failed Turn off with rollback;
- duplicate concurrent lifecycle action.

## Runtime gate
- `eve-study-lifecycle.js` loads after `eve-transactions.js` and before Archive/app code.
- It is included in the service-worker shell.
- HTTP runtime smoke testing verifies the asset and load order.

# v56.1.0 — Archive extraction + failure matrix

## Complete operational extraction
- Moved Archive mutation policy out of `app.js` into `eve-archive-ops.js`.
- The extracted module now owns:
  - Archive;
  - Restore;
  - permanent delete;
  - automatic expiry purge;
  - live-link close/reconciliation during Archive;
  - external-copy cleanup ordering;
  - local workspace commit ordering.
- `app.js` now only configures dependencies and delegates the four Archive operations.
- Archive rendering remains in `app.js`; operational decisions do not.

## Architecture ratchet
- `app.js` reduced from the v56.0 ceiling of **469,511 bytes / 2,137 lines** to **463,692 bytes / 2,078 lines**.
- The new lower ceiling is enforced in `architecture-budget.json`.
- Added a separate small budget for `eve-archive-ops.js`.
- The architecture test rejects Archive deletion policy leaking back into `app.js`.

## Deterministic Archive failure matrix
Added isolated production-module tests for:
- successful Draft Archive;
- live-study Archive when relay is unavailable;
- local persistence failure after remote participant access is closed;
- Restore persistence failure;
- cloud-copy deletion failure;
- relay-copy deletion failure;
- local workspace deletion commit failure;
- successful permanent deletion;
- automatic expiry purge.

The tests verify state restoration and cleanup ordering, not just source strings.

## Runtime packaging
- `eve-archive-ops.js` is loaded after `eve-transactions.js` and before `app.js`.
- It is part of the offline service-worker shell.
- Runtime HTTP smoke testing now verifies the extracted module is served and loaded in the correct order.

# v56.0.0 — Structural Reliability

## Shared transaction infrastructure
- Added `eve-transactions.js`, loaded before `app.js` and included in the service-worker shell.
- Added reusable operation locking, snapshotting, persistence phases, remote commit/rollback, state restoration and rollback persistence.
- Moved shared async-button busy-state handling into the transaction runtime.
- The runtime works in both the browser and CommonJS tests.

## Production migrations
- **Turn off study** now uses the shared transaction primitive:
  - apply Off state;
  - persist;
  - confirm remote lifecycle;
  - restore + persist rollback on remote failure.
- **Restore from Archive** now uses the shared transaction primitive:
  - snapshot archived study;
  - apply restore;
  - persist;
  - automatically restore in-memory state on persistence failure.
- Go live and live-study Archive keep their v55.4 fail-safe paths for this release rather than introducing a high-risk big-bang rewrite.

## Architecture ratchet
- Added `architecture-budget.json`.
- `app.js` is now capped at the v56 size and cannot grow without deliberately changing the budget.
- The new transaction runtime has its own small size/line budget.
- v56 starts with `app.js` smaller than the v55.4 baseline.

## Runtime release gate
- Added a real HTTP runtime smoke test.
- The test starts `server.js` with an isolated temporary relay-data directory and unused local port.
- It verifies the health API, application shell, required runtime assets, script order, security header and unknown-API behaviour.
- No browser engine or Playwright/Puppeteer is available in the current build environment, so browser E2E is not falsely reported.

## Regression coverage
- Added transaction happy-path, persistence-failure, remote-failure, final-persist-failure, rollback and lock tests.
- Added architecture-ratchet tests.
- Added runtime HTTP smoke tests.
- Full v50–v56 suite remains green.

# v55.4.0 — Reliability hardening

This release focuses on making existing workflows fail safely under slow services, repeated clicks and persistence failures.

## Go live / Turn off
- Added a per-study lifecycle lock so Go live / Update live / Turn off cannot execute concurrently from repeated clicks.
- **Go live is now fail-safe in both directions.**
- A new live version is no longer left marked Live if participant relay availability or participant delivery cannot be confirmed.
- Reopening an Off study now requires participant access to be confirmed before Eve keeps the study Live.
- If local persistence fails after participant access was reactivated, Eve attempts to turn access back off and tells the researcher to verify the study.
- Existing Turn off rollback behaviour is retained.

## Archive / Restore / Delete
- Added a per-study Archive operation lock.
- Restore now snapshots the archived study and fully rolls back if workspace persistence fails.
- Archiving a live study now handles the two-step remote/local transition coherently:
  - participant access is closed first;
  - Archive state is then saved;
  - if that save fails, the study is restored and Eve attempts to reopen participant access.
- Permanent deletion now commits the workspace removal before deleting local IndexedDB response/recording payloads.
- If the local workspace deletion cannot be committed, Eve retains a visible archived record instead of silently reporting success.

## Administration
- AI Settings Save, Email Settings Save and Send Test Email now expose a busy state and cannot be double-submitted while the request is running.
- Busy buttons use `aria-busy` and restore their original label after completion/failure.

## Participant completion
- Replaced the remaining lock emoji in the completion privacy notice with the shared Eve SVG component language.

## Regression gate
- Added a lifecycle/archive reliability test.
- Added a static UI wiring audit that verifies inline UI handlers resolve to application functions.
- Added a duplicate static-ID guard.
- Full v50–v55.4 regression suite remains green.

# v55.3.0 — Operational clarity

## Study cards
- Study cards now provide an explicit next action instead of only showing status and response counts.
- The suggested action adapts to the study:
  - Continue building;
  - Finish settings;
  - Prepare to go live;
  - Update live study;
  - Manage live study;
  - Review responses;
  - Review results;
  - Go live again.
- Each action includes a short reason, such as outstanding Build issues or available responses.
- Live studies with unpublished changes now say **Live · update pending**.
- Archive now uses the shared Eve icon system rather than standalone character glyphs.

## Home
- **Needs you** is now an actionable task list rather than passive copy.
- Attention items link directly to the relevant destination:
  - live update;
  - Review;
  - Build / Study settings;
  - Microsoft 365 email;
  - Archive.
- A healthy workspace still provides a low-priority route back to Studies.

## Status language
- User-facing study status is now consistently **Draft / Live / Off**.
- The Studies filter now says **Off** rather than Closed.
- The top-bar study context also displays **Off** while retaining the internal `closed` state for compatibility.
- Card-sort **Closed** remains unchanged because that is a research-method term, not study lifecycle status.

## Study flow
- Corrected a styling mismatch where the workflow uses the class `complete` but later redesign CSS was targeting `done`.
- Completed workflow steps now use the intended sage circular number state on the off-white workflow bar.
- Send-stage helper text now distinguishes **Live now**, **Participant access is off**, and **Go live & share**.

# v55.2.0 — Consistency + accessibility

## One icon language
- Removed the remaining pre-redesign researcher-facing glyph icons from Insights, Settings, Study settings, Send, Panel, Templates, Review and recording controls.
- Added Eve SVG icons for AI, targets, email, video and screen recording.
- Repository search/empty states now use the same SVG icon system as primary navigation.
- Review overview method cards now use the same method icons as Builder and navigation.

## Keyboard navigation
- Added a real **Skip to main content** link that appears on keyboard focus.
- Main workspace content is now a focusable navigation target.
- Standardised the visible focus ring across buttons, links, inputs, selects, summaries and custom focusable controls.
- Review section navigation now exposes proper `tablist` / `tab` semantics.
- Review tabs support:
  - Left / Right arrow navigation;
  - Home;
  - End.
- Focus follows the selected Review tab after keyboard navigation.

## Review navigation
- Review tabs are sticky while evidence is being analysed.
- Tabs for study methods that do not exist in the selected immutable study version are no longer shown.
- The Review Overview likewise hides method cards with no configured blocks.
- Mobile Review keeps the tab list horizontally scrollable beneath the mobile chrome.

## Empty states
- Standardised Insight Bank empty/search-empty icon treatment and spacing.
- Empty-state icons now use the Eve component language rather than character glyphs.

# v55.1.0 — Preview fidelity + participant session clarity

## Preview
- Reworked Study Preview so its internal structure uses the same participant-facing page, heading, progress and study-title components as the live participant journey.
- Moved Preview-only messaging outside the participant surface so researchers can judge the real participant layout without Preview chrome mixed into it.
- Added Desktop / Mobile viewport controls to Preview.
- Mobile Preview uses the same narrow-card spacing and typography rules as the participant experience.
- Full-study Preview continues to support validation, screen-out behaviour, back/continue and completion without saving responses.

## Participant journey
- Added an explicit session status:
  - Saved in this tab;
  - Saving…;
  - Progress restored;
  - Submitting response…;
  - Response not submitted;
  - Progress could not be saved.
- Draft storage now reports failure instead of claiming success if browser session storage is unavailable.
- Restored sessions display when the saved progress was recovered.
- Submission failures explicitly explain that answers remain in the current tab for retry.

## Review + Insights
- Qualitative evidence that already has a saved Insight is now visibly marked **Saved insight**.
- Clicking saved evidence opens the existing Insight instead of creating duplicates.
- Evidence lookup is scoped to study version and source label/excerpt.
- Removed the older duplicate Review insight-capture strip; the v55 Evidence → Insights tray is now the single analysis workflow surface.

## Workflow simplification
- Removed the old Builder issue-count button now that the Study quality panel lists actual issues.
- Removed the old Send fix strip now that Launch Readiness owns launch blockers.
- Retired the redundant Review insight-capture strip.

# v55.0.0 — Workflow Quality

This release deliberately adds no new feature category. It hardens the existing Build → Send → Review journey.

## Build
- Added a compact **Study quality** panel directly in the Study Outline.
- Outstanding Build issues are now listed by page with the actual problem, rather than only showing an issue count.
- Selecting an issue jumps directly to the affected page/block.
- Ready studies show a clear **Study ready** state and a direct Preview action.
- Existing Builder issue validation remains authoritative; this is a clearer presentation of the same rules.

## Send
- Added a persistent **Launch readiness** dashboard.
- Researchers can now see, in one place:
  - Study content readiness;
  - Study settings readiness;
  - audience/target setup;
  - customer-storage connection health;
  - Microsoft 365 email readiness when a Panel sign-up block is present.
- Blocking checks are distinguished from non-blocking operational health.
- Customer-storage connection health is surfaced without silently changing the existing Go live rules.
- Panel email remains a real Go live prerequisite when Panel sign-up is used.
- Existing segment setup remains visible before Go live.

## Review + Insights
- Added a persistent **Evidence → Insights** tray to Review.
- Review now shows how many insights have already been captured from the current immutable study version.
- The three most recently captured insights are visible in context and can be edited directly.
- Added **Open Insight bank** and **Add insight** actions from the evidence tray.
- Qualitative participant quotes now have a direct **Save insight** action.
- Text-selection capture remains available for all other evidence.
- Saved evidence continues to retain study/version/section/cohort provenance and tags.

## Workspace administration
- Added a **Workspace health** summary to Global Settings.
- AI, Microsoft 365 email and customer storage now use one consistent health language:
  - ready;
  - needs attention;
  - checking;
  - off.
- Existing detailed provider configuration remains in the same Settings/Storage areas.

## Release guardrails
- Added `v55_workflow_quality.test.js`.
- Added `v55_end_to_end_workflow.test.js`.
- The new end-to-end guardrail composes the existing contracts across:
  Build → settings/readiness → live immutable version → recruitment target progress → Review/off state.
- Full v50–v55 regression suite remains green.

# v54.0.5 — Workflow hierarchy + top-bar context polish

- Promoted the previous Study Flow hover treatment to the normal inactive state.
- Inactive Build / Study settings / Send / Review steps now sit on soft lilac pills.
- Hover now uses the same white raised treatment as the active step.
- Active state remains white with plum text and subtle depth.
- Restyled the study identity in the top bar as a compact plum context capsule.
- Study title text inside that context is now white.
- Draft status uses a pale lilac pill with deep-plum text.
- Live status uses the existing sage language.
- Closed status uses a neutral soft-grey pill.
- Version information uses a restrained translucent white pill.

# v54.0.4 — Off-white study chrome

- Changed the study top bar from medium plum to warm off-white.
- Changed the Build / Study settings / Send / Review bar to a very pale lilac off-white.
- Plum is now used for text, selection and control emphasis rather than the entire study header.
- Active flow step remains a white pill with plum text.
- Workflow step numbers now use fixed equal width/height and `border-radius: 50%` so they are always circular.
- Active flow number uses plum; completed flow numbers use sage.

# v54.0.3 — Sidebar contrast + lighter study chrome

- Changed sidebar navigation text and icons from muted grey to warm off-white.
- Active and hover sidebar states now use true white for stronger readability.
- Preserved the deep-plum sidebar as the darkest product surface.
- Lightened the study top bar to a medium plum.
- Lightened the Build / Study settings / Send / Review flow bar again to a softer plum.
- Active workflow step is now a white pill against the lighter flow band.
- Sage remains reserved for completed/healthy workflow state.

# v54.0.2 — Calmer Builder + legacy-style neutralisation

- Reduced colour density throughout Study Builder.
- Builder now uses one pale workspace ground with predominantly white page and block surfaces.
- Removed the selected-block colour stripe; selection is now a clean plum border and subtle shadow.
- Reduced purple fills on block type, status and required/optional badges.
- Answer options, matrix rows, ranking rows, preference cards and editable sub-items now use white/neutral surfaces.
- Consent, Panel sign-up, Navigation recording and Highlighter configuration panels are now low-colour neutral panels rather than nested coloured blocks.
- Rich-text editing and option editing areas use consistent white surfaces and neutral borders.
- Study Outline active page/section states are lighter and no longer rely on broad purple fills.
- Explicitly overrides old GDS/blue focus, rating, choice and selected-state rules that were still winning through selector specificity.
- Neutralised legacy glass/blue card styling still leaking into cards, tables, settings/status panels and participant choices.
- Plum is now reserved primarily for selection, focus and actions; sage remains reserved for healthy/live states.

# v54.0.1 — Visual polish and missing-theme fix

- Fixed the core v54 packaging regression: `eve-v54-theme.css` now actually loads after the legacy base stylesheet.
- The first v54 screenshot was therefore showing new markup with mostly legacy styling; this release fixes the root cause rather than layering cosmetic workarounds.
- Increased overall researcher-workspace scale and spacing.
- Rebalanced the study top bar and Build / Study settings / Send / Review workflow.
- Widened and refined the Builder canvas.
- Changed the Study Outline from a large solid-purple selected page to a lighter, layered navigation treatment.
- Added clearer active section treatment and less visually dominant drag/reorder furniture.
- Converted the main Builder drag and move controls to the Eve SVG icon system.
- Restyled page headers as deliberate soft cards with clearer hierarchy.
- Improved block-card padding, selected-state depth, badges and action controls.
- Completely restyled the rich-text editor toolbar/content shell to match the v54 component system.
- Normalised option rows, inputs, reorder controls, response placeholders, issue banners and insertion controls.
- Preserved the existing mobile Builder no-nested-scroll behaviour after the new theme loads.
- Added a regression test that specifically fails if the v54 theme is packaged but not linked again.

# v54.0.0 — Eve purple workspace redesign

This release applies the supplied Eve redesign and engineering handoff across the current v53.9 product without changing the research data model or removing existing capabilities.

## Workspace shell
- Replaced the dark grey shell with the recommended **1a plum rail**.
- Expanded rail is 250px; Builder, Study settings, Send and Review use the 92px collapsed rail.
- Added the supplied petal/eye Eve brand mark.
- Replaced primary navigation glyph characters with consistent inline SVG icons at the handoff's heavier rounded stroke weight.
- Storage remains pinned above Settings in the rail and shows a compact connected/not-connected state.
- Global screens own their page title; study screens use the plum contextual study header.

## Visual system
- Added `eve-v54-theme.css` as the single v54 visual override layer.
- Exact handoff palette:
  - ink `#241a41`;
  - navigation plum `#3a2668`;
  - primary plum `#7c5cd0`;
  - tint `#e7dffa`;
  - row tint `#f3effc`;
  - page ground `#f7f5fb`;
  - desk `#efeaf7`;
  - healthy/live sage `#7a8a5e` / `#e4ead6`.
- Caprasimo display headings over Figtree body copy.
- Controls are pills; cards use 30px radii; inset panels use 20–24px radii.
- Replaced browser-default focus styling with the 2px plum focus ring.
- Destructive actions remain white/rose rather than red-filled buttons.
- Researcher-defined Highlighter meaning colours remain data and are not overwritten by the theme.

## Home
- Reworked Home into the dashboard composition from the redesign.
- Live studies, responses this week, saved insights and Panel members are now first-class metrics.
- Added a dynamic **Needs you** panel.
- Added a 14-day response activity chart from real response timestamps.
- Recent studies are presented inside the softer dashboard composition.

## Studies
- Replaced the old status select with the handoff-style segmented pill filter.
- Search is a rounded search field using the new icon system.
- Study cards use the new soft card language and distinguish live studies with a plum border.
- Added response-target progress bars to study cards when a target is configured.
- Duplicate/archive study actions now use SVG icons.

## Builder
- Reworked the study workflow chrome into a plum pill navigation strip.
- Pages/outline rail uses the lilac inset surface.
- Builder canvas uses the fixed lilac page ground.
- Selected blocks use the handoff's 2px plum border plus selected-block shadow.
- Builder cards, page containers, Add step modal and empty states use the large-radius language.
- Add-step glyphs were replaced with the shared SVG icon system.
- Existing mobile vertical scrolling safeguards remain in force; the v54 stylesheet explicitly removes fixed-height/overflow traps below 900px.

## Send and Review
- Preserved the v53.8 Go live / Turn off lifecycle and pre-live segment configuration.
- Restyled live state with sage and all normal selection/attention states with plum.
- Segment cards, participant access panels, review filters, result cards and recording items use the unified card/pill language.

## Participants and Insights
- Participant Panel and participant history now use rounded line-free tables, soft rows and pill actions.
- Participant segments use tinted inset panels.
- Insights Bank uses the new three-column card language, plum filter inversion and softer evidence panels.

## Storage and Global Settings
- Existing Google Drive, SharePoint, AI and Microsoft 365 email functionality is unchanged.
- Provider/settings cards, connection status, templates and test-email panels now use the shared visual system.
- Healthy connected states use sage consistently.

## Participant-facing study
- Reworked the participant experience to a single centred card on the lilac ground.
- Progress, questions, choices, panel consent, completion and privacy states use the new visual language.
- Recording, Navigation Task, Highlighter and consent behaviour remains unchanged.

## Validation
- Added `tests/v54_redesign.test.js`.
- Updated legacy tests that asserted the removed navigation/add-step glyph characters to assert the new SVG icon identifiers instead.
- Full server integration now verifies that `eve-v54-theme.css` is served.
- `npm run check` passes.
- Complete regression suite passes.

# v53.9.0 — Global Microsoft 365 Email Settings

- Added a full **Microsoft 365 Email** section to Global Settings.
- Admins can configure:
  - Entra tenant ID;
  - application/client ID;
  - Microsoft client secret;
  - sender mailbox;
  - Microsoft Graph base URL.
- The Microsoft client secret is encrypted by the local Eve service using AES-256-GCM and is never returned to the browser after saving.
- Existing `EVE_M365_*` environment variables remain supported as deployment fallbacks.
- Added real **Send test email** functionality using the same Graph token and `sendMail` path as participant email.
- Email status now shows **Connected**, **Configured · test recommended**, or **Not connected**.
- Added global editable templates for:
  - recruitment invitation subject/message;
  - Panel welcome subject/message;
  - Panel researcher-removal subject/message.
- Recruitment email modal now loads the global recruitment defaults.
- Panel sign-up blocks now treat welcome-email subject/message as optional study-level overrides.
- Blank Panel overrides use the global Panel welcome template.
- Eve still appends the secure Panel self-removal link automatically.
- Researcher Panel removal now uses the global removal template.
- Team invitations continue to use Eve's protected fixed invitation template.
- Added regression tests proving:
  - the client secret is ciphertext at rest;
  - the secret is never returned by the Settings API;
  - blank secret fields retain the existing saved secret;
  - global templates feed the real mailer functions;
  - test email uses the configured sender through Microsoft Graph;
  - mail settings routes are installed in the full Eve server.

# v53.8.0 — Participant Panel + Go live controls

## Participant Panel
- Added a real **Participant Panel** database inside **Participants**.
- Added a dedicated **Panel sign-up** block to the Study Builder.
- Panel sign-up is always optional and cannot be made a prerequisite for completing a study.
- Researchers can customise:
  - participant-facing panel invitation copy;
  - optional terms and conditions;
  - panel consent checkbox wording;
  - welcome-email subject;
  - welcome-email body.
- Eve automatically appends a secure **Remove me from the research panel** link to the welcome email.
- Membership is created only after the participant's research response has been safely submitted.
- If welcome email delivery fails, the study response remains saved and panel enrolment is not silently completed.
- Active members are not sent duplicate welcome emails if they opt in again.
- Subsequent identified completed studies are added to the member's participation history.
- Participant rows show email, join date, unique study count and most recent participation.
- Clicking a participant opens joined date, originating study and study-by-study participation history.
- Researchers can remove a member from Participants; Eve sends the removal-notification email before changing membership state.
- Self-removal links are high-entropy and Eve stores only their hash.
- Removed participants can explicitly opt in again later.

## Send / live state
- Audience/segment configuration is no longer hidden behind publication.
- **All users** and custom segments are visible and editable while the study is Draft, Live or Off.
- Response targets can be configured before a study goes live.
- Participant link / QR controls show a clear **Participant access is off** state until the study is live.
- Replaced user-facing **Publish** terminology with **Go live**.
- The Send page now provides:
  - **Go live** for Draft/Off studies;
  - **Update live study** when the live study has draft changes;
  - **Turn off** whenever the study is live.
- Turning a remotely-live study off is fail-safe: if Eve cannot confirm the relay was disabled, the local state is rolled back rather than falsely showing the study as off.
- Review live/off controls delegate to the same lifecycle behaviour.

# v53.7.1 — Storage readiness, nav polish, independent task recording

- Storage no longer exposes the browser's raw `Failed to fetch` message.
- If Eve is opened directly from `index.html`, Storage explains that cloud connectors need the local Eve service and tells the user to start the full build.
- Google Drive and SharePoint setup buttons are always actionable. An unconfigured provider now opens clear one-time setup guidance instead of appearing as a disabled/dead control.
- Storage sidebar status now says **Not connected** rather than the obsolete **Demo storage**.
- Fixed the unstyled global **Settings** link by placing it inside the normal navigation styling context.
- Moved **Archive** to the bottom of the main left-nav item list.
- Navigation Task recording now uses three independent switches:
  - Audio
  - Video
  - Screen
- Any combination can be enabled.
- Each enabled capture is recorded and encrypted separately against the same task attempt.
- Participant permission/setup starts every selected recorder before **Open task** is enabled.
- Review lists every Audio / Video / Screen file associated with the participant task attempt.
- Legacy single-mode Navigation recording configurations migrate automatically.

# v53.7.0 — SharePoint + Google Drive restored

- Restored real OAuth-backed **Google Drive** and **Microsoft SharePoint** storage connectors into the current full-build lineage.
- Removed the old `simulateStorageConnection()` facade and all “MVP simulation” storage copy.
- Added server-side AES-256-GCM OAuth token vault. Browser storage holds only an opaque connector capability.
- Google Drive:
  - OAuth 2.0 + PKCE;
  - constrained `drive.file` scope;
  - create/reuse `My Drive / Eve`;
  - encrypted file write/read/list/delete.
- Microsoft SharePoint:
  - Entra OAuth 2.0 + PKCE;
  - approved site URL discovery;
  - document-library selection;
  - create/reuse the library `Eve` folder;
  - encrypted file write/read/list/delete.
- Restored debounced autosync and manual **Sync now**.
- Full cloud sync writes encrypted study drafts, published versions, responses and recordings, then commits `workspace.eve.json`.
- Restored v49-style **Check cloud copy**, cross-browser recovery passphrase, **Restore cloud copy**, **Reconcile safely** and **Keep browser copy**.
- `recovery.eve.json` wraps the browser AES key with PBKDF2-SHA256 + AES-GCM; the passphrase is never uploaded.
- Recovery inspection is read-only until the researcher explicitly chooses an action.
- Cloud recovery preserves v53 features including Archive state, insights, participant segments and recordings.
- Permanent Archive purge removes encrypted customer-storage copies from every provider the study has previously synced to.
- Added provider deployment variables to `.env.example` and full setup documentation in `CONNECTORS.md`.
- Added mocked integration tests for Google OAuth/Drive I/O, Microsoft OAuth/SharePoint site+library selection/I/O, connector-vault secrecy and browser ciphertext sync.

# v53.6.0 — 30-day Study Archive

- Study delete actions now move studies to **Archive** rather than destroying them.
- Added **Archive** to the global left navigation.
- Archived studies keep their responses, recordings and saved insights intact for recovery.
- Each archived study shows its deletion countdown and supports **Restore** or **Delete permanently**.
- Automatic permanent deletion runs once the 30-day recovery window expires.
- Permanent deletion removes the study, responses, local recordings, saved insights and study-linked participant segments.
- Published studies are removed from Eve's encrypted relay during permanent deletion.
- Live studies are closed before they can be archived.
- Restoring a previously live study brings it back as **closed** so it cannot silently resume participant collection.

# v53.5.0 — Global Settings + study deletion

- Added Settings to global navigation.
- Added defaults for new studies.
- Added AI provider on/off, encrypted local API-key storage, model and base URL.
- Added access to Viewer / Researcher / Admin role management.
- Added Delete study to study cards and Study Settings.
- Live relay studies are closed before local deletion.
- Local responses and local recording blobs are deleted with the study.
- Saved insights remain in the Insight Bank.

# v53.4.4 — Block action menu

- Replaced the separate Settings and Delete icons on every Study Builder block with a single top-right `•••` menu.
- Moved **Settings**, **Duplicate**, and **Delete** into that menu.
- Added clear icons for all three actions, including a dedicated trash icon for Delete.
- Delete is visually separated and styled as a destructive action.
- Removed the duplicate/delete action group from the Section Settings drawer so block actions have one consistent home.
- Kept movement controls (up/down and page selector) visible because they are structural reordering controls rather than block actions.
- On mobile the overflow menu opens as a large bottom-positioned action sheet above Eve's mobile navigation.

# v53.4.3 — Mobile Study Builder scrolling

- Fixed unreliable/jumpy vertical scrolling in the Study Builder on phones.
- Removed the nested mobile canvas scroll surface; the browser document now owns vertical scrolling in Build.
- Builder/canvas heights are no longer constrained to viewport calculations on narrow screens.
- Changed Eve's fixed page background to normal scrolling on mobile to avoid Safari compositing/jank.
- Drag handles explicitly allow vertical touch panning so a normal swipe is not swallowed by reorder affordances.
- Preserved mobile sticky Build navigation and bottom navigation.
- Added extra safe-area space beneath the final builder content so the fixed mobile navigation does not cover controls.

# v53.4.2 — Navigation recording immediate-start fix

- Fixed the Navigation Task recorder interaction that looked broken after browser permission was accepted.
- **Start recording** now requests permission and starts `MediaRecorder` immediately after permission succeeds.
- The participant sees a live red **Recording now** state inside Eve before opening the external task.
- **Open task** remains disabled until Eve has actually started the recorder.
- Video and Screen continue to show the live capture preview; Audio shows its active microphone state.
- The same flow works in researcher Preview mode and real participant mode.
- Popup-blocked navigation safely stops/discards that attempt and asks the participant to start recording again.
- Standalone Recording blocks were already immediate-start and are unchanged.

# v53.4.1 — Navigation recording fixes

- Fixed Navigation Task recording setup so accepted permissions now produce an immediate, visible capture state inside Eve.
- Video and Screen setup show the live camera/shared-screen preview inside the participant page.
- Audio setup shows an explicit microphone-ready state.
- When the task actually begins, Eve switches to a visible red `Recording now` state before opening the external task.
- Split researcher options into exactly **Audio**, **Video**, and **Screen recording**.
- **Video is camera-only**.
- **Audio is microphone-only**.
- **Screen is screen/window-only**.
- Updated Review labels and participant permission copy to match the three distinct modes.
- Existing encrypted media storage/playback remains unchanged.

# v53.4.0 — Navigation task recording

- Added optional recording to Navigation Task.
- Researcher recording choices: Audio, Audio + video, or Screen recording.
- Recording uses a two-step participant start: set up permissions first, then start recording and open the task together.
- Screen recording captures a shared screen/window plus participant microphone; Eve rejects tab-only sharing because navigation opens separately.
- Task recording stops on completion, automatic extension success, timeout, screen-share end, or a 15-minute safety limit.
- Navigation timeout sets the recording maximum when shorter than 15 minutes.
- Recorded navigation attempts are encrypted through the existing zero-access media relay.
- Review shows recording coverage and on-demand playback inside Navigation analysis.
- Page refresh safely forces a recorded navigation task to be rerun because in-memory media cannot be resumed.
- Existing non-recorded Navigation Tasks remain unchanged.

# v53.3.0 — Recording block

- Added first-class Recording study block.
- Researcher configuration: text prompt, Audio or Audio and video, and time limit.
- Participant permission-first recording UI with preview, stop, countdown and re-record.
- MediaRecorder output uses deliberately modest bitrates for research responses.
- Recording media is encrypted client-side and stored separately from normal response JSON.
- Zero-access relay stores only encrypted media envelopes and opaque routing metadata.
- Local-mode recordings are encrypted in IndexedDB.
- Review has a Recordings section with on-demand decryption/playback.
- Required Recording blocks are validated before page/study completion.
- Live streams are stopped when Eve rerenders or the participant leaves the recording UI.
- Existing v53.2 highlighter and earlier functionality retained.

# Eve v53.2.0

## Highlighter
- Added researcher-defined highlight meanings with editable labels and colours.
- Added touch-first participant mode: mobile users can scroll/pinch normally, then explicitly enter drawing mode.
- Selecting a meaning on touch devices automatically enters drawing mode.
- Highlight responses now retain meaning ID, label and colour alongside proportional rectangle geometry.
- Review now preserves semantic colours, shows counts by meaning, and allows researchers to isolate a meaning.
- Existing highlighter studies/responses remain compatible through a default legacy highlight meaning.

# Eve v53.1.0

## Analysis and polish
- Removed the 12 MB hard limit from Highlighter image uploads; large supported images are still optimised locally before storage.
- Added researcher-driven insight capture in Review: select evidence and save it as an insight.
- Added title, interpretation, evidence and reusable tags when saving an insight.
- Added source provenance: study, published version, review section, cohort/filter and source label.
- Expanded Insights into a searchable/filterable insight bank across studies and tags.
- Added edit, retag, delete and source-navigation actions for saved insights.
- Existing generated insights continue to save into the same bank rather than a parallel repository.

# v53.0.1 — Local page actions regression fix

- Fixed New page, Duplicate page and Delete page doing nothing in local single-user mode.
- Root cause: the team collaboration wrapper attempted authenticated edit leases even when Eve was running locally without an account.
- Local mode now bypasses collaboration leases/revisions entirely; authenticated team workspaces retain the existing locking behaviour.
- The same fix restores other structural local edits behind the shared guard, including page moves, section duplication/removal and drag/drop operations.
- Added a regression test covering add, duplicate and delete page behaviour plus the local collaboration bypass.

## v53 — Full runnable stabilisation build

- Restored the complete runnable package around the supplied v47 frontend, including `index.html`, static assets and the zero-access Node relay server.
- Added one-command local startup (`npm start`) plus Windows/macOS/Linux launcher scripts.
- Local single-user use no longer requires account/SSO configuration; authenticated team mode activates only when configured.
- Folded the cumulative account/RBAC, optional Entra SSO, optional AI gateway, M365 recruitment email and granular collaboration server/runtime layer into the full application.
- Fixed Highlighter pointer-cancel commits, blocked Navigation Task popup state, orphan navigation timers, last-moment participant draft loss and duplicate submit starts.
- Added bounded relay/control-plane requests and clearer timeout errors.
- Improved team/recruitment overlay focus handling and duplicate-send protection.
- Paused collaboration heartbeats in hidden tabs and refreshes presence when the tab becomes visible.
- Added full-build integration coverage for static serving, encrypted publication, participant retrieval, controlled invitations, append-only response collection, admin protection, sync and lifecycle closure.

# Eve v47

## Consent confirmations
- Added first-class required checkbox confirmations to Consent blocks.
- Researchers can add, edit, reorder and remove confirmations directly in the builder.
- Every configured confirmation must be checked before a participant can continue or submit.
- Consent blocks may intentionally contain zero confirmations and then act as information-only sections.
- Migrated older Consent blocks to a single default “I agree to take part in this research.” confirmation to preserve behaviour.
- Preview and live participant runtime use the same confirmation renderer and validation.
- Saved consent answers now retain confirmation IDs, wording and confirmed state for versioned evidence.
- Removed the generic Required toggle from Consent section settings to avoid conflicting requiredness models.
- Added dedicated builder/participant styling for consent confirmation groups.

# Eve v46

## Builder content formatting
- Moved **Screener** from Questions into the **Study** section of Add Step.
- Screener now uses the Study family styling in the builder.
- Added a lightweight rich-text toolbar to participant-facing copy and prompt fields: Small/Normal/Large text, bold, italic and bulleted lists.
- Formatting is stored separately from Eve's canonical plain text so validation, analytics, filtering and response keys remain stable.
- Existing plain-text studies remain backwards compatible and gain formatting only when edited.
- Participant Preview and live participant views render the formatting consistently.

# Eve v45 — restrained motion polish

## Motion and interaction polish
- Added short tactile press/lift feedback to buttons and icon controls.
- Added spring-like switch movement without bounce loops.
- Added a one-off settle animation when answers are selected.
- Added subtle participant/Preview page transitions and smoother progress movement.
- Added a brief active-step arrival cue to the Build → Settings → Send → Review flow.
- Added more physical drag feedback for builder, ranking and sorting interactions.
- Added a contained reveal transition when segment settings expand.
- Added directional entrance motion for section settings, dialogs and Preview.
- Added short Review tab/workspace transitions so evidence changes feel connected.
- Added local task feedback for ranking, highlighter and navigation completion states.
- Kept all motion short and interaction-triggered; there are no ambient looping animations.
- Expanded `prefers-reduced-motion` handling so the new motion can be fully suppressed.
- Bumped the PWA shell cache to v45.

# Eve v44 — interaction and visual polish

- Unified builder section hierarchy with type-family styling, Required/Optional state and calmer readiness feedback.
- Improved Add Step search with visible match counts, clear search and a designed empty-result state.
- Refined participant controls for choice questions, Preference, Matrix, Ranking, Highlighter, Short text, Number and Date.
- Removed forced Matrix horizontal scrolling on narrow screens; statements and scale controls now stack cleanly.
- Added live Short text character counters and correct decimal support for Number questions.
- Improved selected, hover, focus, disabled and confirmation states across research interactions.
- Tightened continuous-page builder spacing and page/section action groups.
- Refined Send segment cards and contained segment settings without changing the per-segment target/link model.
- Made Review question/task summaries more clearly separated and easier to scan.
- Added reduced-motion handling for the new transitions.
- Bumped the PWA shell cache to v44.

# Eve v42 — Highlighter task + responsive layouts

## Highlighter task
- Added a new **Highlighter task** under Research tasks.
- Researchers can upload PNG, JPG or WebP images and give participant-facing instructions.
- Large images are resized/compressed locally before being stored in the study.
- Participants drag over the image with mouse, pen or touch to create semi-transparent highlight regions.
- Highlights use normalised coordinates, so they remain aligned when the same study is viewed at different screen sizes.
- Added Undo and Clear controls, required-task validation, draft restoration and response serialisation.
- Review now has a dedicated **Highlighter** area that overlays all participant marks on the original image; overlapping areas become visually stronger.

## Responsive layout
- Reworked the builder at tablet widths: Study Outline becomes a compact horizontal navigator above the canvas rather than consuming a permanent left column.
- Improved wrapping and touch sizing for page actions, section controls, page movement controls and builder cards on mobile.
- Improved Add Step and settings drawer sizing on small screens.
- Improved matrix, ranking, preference, participant, Send and Review behaviour at tablet/mobile widths.
- Highlighter authoring, participation and Review layouts scale safely down to mobile.

## Validation
- `node --check app.js` passes.
- CSS brace validation passes.
- Static workflow checks cover Highlighter creation, authoring, participant binding, required validation, response serialisation and Review.

---

# Eve v41 — More question and task types

- Added **Short text** questions with optional character limits and placeholders.
- Added **Number** questions with optional min/max constraints and units.
- Added **Date** questions using the native calendar control.
- Added **Matrix / Likert grid** questions with configurable statements, scale points and endpoint labels.
- Added **Ranking tasks** with drag-and-drop, accessible up/down controls and explicit confirmation.
- Added **Preference tests** with larger comparison-card choices.
- Added participant validation, draft restoration and response serialization for the new types.
- Added Review summaries for matrices, rankings, preference tests, numbers and dates; short text joins qualitative feedback.
- Expanded the Add Step modal and made it scroll safely with the larger catalogue.

# Eve v37 — Send segment hierarchy

- Kept **All users** as a permanent default segment that is always visible and cannot be deleted.
- Separated custom segments into their own clearly labelled section beneath the default segment.
- Added an obvious delete action on every custom segment with the existing confirmation modal.
- Prevented custom segments from being named `All` or `All users`.
- Kept selection independent from existence: choosing/creating a custom segment never removes or hides the default All users segment.

# v36 — Simplified Send

- Removed relay/setup/status concepts from the researcher-facing Send experience.
- Removed campaign creation and campaign tables from Send.
- Added **All users** as the implicit default share segment.
- Added lightweight per-study share segments, each with a unique participant link.
- Added segment attribution to Review filters.
- Added a Link / QR code switch driven by the currently selected segment.
- QR codes remain generated locally in the browser and can be downloaded as SVG.
- Simplified publish messaging so infrastructure delivery is automatic rather than user-configured.
- Updated global flow/home wording to describe participant sharing as automatic.
- Bumped the PWA shell cache to v36.

# Eve v35 — Share link + QR code

- Reworked Send so the primary open-sharing action is distinct from tracked campaigns.
- Added a dedicated **Share study** panel for the current encrypted participant version.
- Added one-click **Copy link** and **Open link** actions.
- Added a locally generated, scan-ready QR code for the participant URL.
- Added **Download QR** as an SVG suitable for print, posters and in-person recruitment.
- QR generation happens entirely in the browser; the participant URL is not sent to a third-party QR service.
- Removed the duplicate open-link control from Campaigns so campaign UI is reserved for tracked or controlled recruitment.
- Added the QR encoder to the PWA shell cache so QR generation remains available offline once Eve is installed.

# Eve v34 — Preview cleanup + automatic navigation success

- Removed the right-hand **Previewing** sidebar from Participant Preview.
- Moved Preview close to a dedicated × button in the top-right corner.
- Kept Current page / Full study controls inside the single preview surface.
- Eve Navigation Companion upgraded to v1.2.0.
- Navigation tasks now persist the configured success page into extension task state.
- The companion automatically completes when the dedicated task tab reaches the configured success URL, including SPA/client-side route changes.
- Automatic success records the result before returning focus to Eve and closing the task tab.
- Eve shows a custom success toast when an automatic navigation-task success is returned.
- Added regression coverage for success URL matching and automatic completion.

# Eve v33 — restrained shine + navigation return

- Brightened the product with restrained blue/purple accents while keeping the study builder mostly neutral.
- Primary actions, active workflow states, progress and selected controls now carry the richer accent treatment.
- Eve Navigation Companion upgraded to v1.1.0.
- Completing a navigation task now returns focus to the original Eve survey tab and closes the dedicated task tab automatically.

# Eve v32 — Navigation Companion extension

- Added a Chrome Manifest V3 `Eve Navigation Companion` under `extensions/eve-navigation-companion/`.
- Navigation tasks can hand instructions, start URL and optional timeout to the extension.
- The extension opens a dedicated task tab and renders a Shadow-DOM Eve overlay on the tested site.
- Overlay shows instructions, live countdown when configured, and **I've completed this task**.
- Overlay follows full-page navigation within the dedicated task tab.
- Completion and timeout are returned automatically to the original Eve study tab.
- Eve detects whether the companion extension is available and preserves the existing manual fallback when it is not.
- Added extension popup/status UI and local install documentation.
- Added a background-service-worker regression harness covering task creation, tab ownership, completion and result delivery.

# Eve v31 — drag overview mode

- Added automatic zoomed-out overview when dragging a study section.
- Compact section headers replace full editor bodies for the duration of the drag.
- Kept page boundaries/headings visible to make cross-page movement practical.
- Added faster edge auto-scroll while section dragging.
- Added a compact drag ghost and explicit overview indicator.
- Preserved logical scroll position when overview mode exits.
- Overview works from both canvas and outline section drag handles.

# Eve v30 — Section movement

- Restored section **↑ / ↓** controls in the main study canvas.
- Added direct **Move to page** selection to section headers.
- Made Study outline section rows draggable.
- Added outline insertion markers when reordering sections.
- Sections can now be dragged between page groups from the outline.
- Empty pages expose a clearer section drop target.
- Consolidated canvas, settings and outline moves onto the same page-move behaviour.
- Cross-page moves now append predictably to the target page.

# Eve v29 — Builder workspace rethink

- Replaced the persistent Properties pane with an on-demand per-section settings drawer.
- Added cog controls to every study section.
- Reworked Study Structure into a navigation-first Study outline.
- Removed page action clutter and section drag controls from the outline.
- Preserved page drag/reorder and cross-page section drop behaviour.
- Added page delete access in the main canvas.
- Expanded the editing canvas with a two-column builder layout.

## v28 — Continuous vertical page editing

- Replaced the one-page-at-a-time Study Builder with a continuous vertical page canvas.
- All pages are visible simultaneously in participant order.
- Study Structure page selection now scrolls to the relevant page instead of replacing the editor canvas.
- Added active-page scroll tracking so the structure outline follows the researcher through long studies.
- Kept page-scoped Preview, Duplicate and Add step controls on each page heading.
- Preserved direct section drag/drop across pages and added an empty-page drop target.
- Kept **+ New page** at the end of the complete editing canvas.
- Removed previous/next page controls from the authoring canvas.
- Participant studies and Full Study Preview intentionally remain page-by-page.

## v27 — Preview & Study Structure polish

- Global builder Preview now opens **Full study** by default.
- Page-level **Preview page** remains scoped to the current page.
- Study Structure widened on desktop/tablet.
- Page actions grouped below the page title instead of competing for title width.
- More generous page/step spacing and clearer page hierarchy.
- Step labels and status metadata have more room and calmer visual treatment.

# v25 — Preview interaction reliability

- Hardened Preview as a self-contained participant simulation rather than a mostly visual renderer.
- Added shared participant identity/email/recontact fields to Preview.
- Added page-level identity validation shared by Preview and the live participant runtime.
- Added real Full Study completion and screen-out completion states.
- Restart Preview now resets the complete interaction session instead of only returning to page 1.
- Screen-outs disable hidden downstream controls in Preview to match participant behaviour and validation semantics.
- Added a **Check page** control to Current Page Preview for required-field/widget validation.
- Preserved shared rating-scale, card-sort and tree-test runtime bindings between Preview and live participation.

# v24 — Friendly GDS

- Kept the GDS-inspired clarity from v23 while softening the overall product tone.
- Replaced harsh black/grey dominance with warmer navy text, pale blue navigation and softer grey-blue backgrounds.
- Reintroduced restrained curves on cards, controls, study blocks, tabs and participant surfaces without returning to the overly rounded SaaS look.
- Kept the high-visibility yellow keyboard focus treatment and strong form labels/borders.
- Made primary ResearchOS actions blue, reserving green for success/completion semantics.
- Softened Build, Settings, Send and Review with calm blue/lilac accents and border-led hierarchy rather than decorative gradients or routine shadows.
- Made the participant experience feel more welcoming with a blue service header, white question cards and softer answer states.
- Retained GDS-like underlined links, obvious errors, simple form controls and content-first layouts.
- No functional, persistence, relay or research-analysis changes.

# v22 — Quality and Preview parity

## v23 — GDS-inspired familiarity

- Shifted the visual language toward familiar GOV.UK/GDS service patterns without copying GOV.UK branding.
- Replaced rounded/pastel SaaS styling with plainer typography, stronger contrast, simpler borders and square-ish controls.
- Adopted GOV.UK-like blue for links/navigation, green for primary actions, red for destructive/error states and yellow high-visibility focus treatment.
- Simplified study cards, workflow navigation, builder blocks, Settings, Send and Review surfaces.
- Reworked Review tabs to feel closer to conventional GDS content tabs.
- Reworked participant questions and form controls to feel more like a trusted public-service form flow.
- Retained ResearchOS navigation, information architecture, privacy model and product identity; no GOV.UK wordmark, crown or proprietary GOV.UK typeface is used.

- Fixed the broken rating-scale interaction in participant Preview.
- Replaced the hidden native-radio implementation with an explicit accessible radiogroup shared by Preview and live studies.
- Added keyboard navigation for scales: arrows, Home/End, Space and Enter.
- Restored scale selections correctly after participant-tab refresh recovery.
- Added live scale representation inside the builder.
- Full Study Preview now uses page-by-page Back/Continue navigation and validates each page before advancing.
- Preview now simulates screener screen-out behaviour and prevents continuing past a screened-out step.
- Full Study preflight reports study-wide checks rather than only the active page.
- Review rating-scale analysis now includes the response distribution as well as the average.
- No changes to encryption, immutable versioning or relay semantics.

# v21 — Flatter design and canvas authoring

- Removed decorative gradients and routine shadows across the researcher and participant interfaces.
- Kept hierarchy through solid colour, borders, typography and spacing; retained elevation only for true overlays.
- Added direct drag-and-drop reordering for study sections in the main editing canvas.
- Moved **+ New page** from the Study Structure sidebar into the main editing area.
- Added flat drag insertion indicators and clearer grab handles for canvas sections.
- No changes to the stabilised persistence, versioning, relay or research-analysis model.

# v20 — Consolidation and optimisation

- Removed obsolete Review, Participants and Storage implementations.
- Removed dead compatibility/demo helpers and canonicalised active function names.
- Simplified Review state by removing the legacy global segment filter.
- Centralised shared response filtering and participant completion rendering.
- Consolidated the historical CSS cascade and removed 374 superseded declarations.
- Reorganised non-runtime documentation under `docs/` and added optimisation regression guardrails.
- No intended product behaviour changes.

# Changelog

## v19 — Tier-1 UX refinement

### Product chrome and orientation
- Added persistent active-study context to the top bar, including lifecycle state and published version.
- Added restrained page transitions, tactile pressed states and reduced-motion support.
- Refined sidebar, workflow, study-card and form micro-interactions for a more deliberate premium feel.

### Review workspace
- Replaced the long all-in-one analysis page with focused Overview, Questions, Tree test, Card sort and Feedback sections.
- Kept versioning, cohort filters, headline metrics and target progress above the focused analysis area.
- Added an Overview evidence map linking directly into each analysis type.
- Added responsive sticky Review navigation for repeated analytical work.

### Researcher and participant polish
- Improved builder hover/selection affordances, settings/storage selection feedback and Send syndication interactions.
- Added clearer selected-answer treatment in the participant experience.
- Added consistent desktop scrollbar treatment and retained mobile/touch behaviour.

## v18 — UX and visual hierarchy refinement

### Researcher workspace
- Made the Build → Study settings → Send → Review flow sticky and more compact so study context stays visible while scrolling.
- Refined spacing, typography, button states and card density without changing the underlying product model.
- Added a persistent responsive bottom navigation for mobile rather than removing global navigation with the desktop sidebar.

### Builder
- Rebalanced the three-pane layout so the canvas is visually dominant and side panes are quieter.
- Added stronger selected-step treatment, calmer page groups, clearer page headers and improved properties-panel rhythm.
- Reduced visual noise from block actions until a step is hovered or selected.
- Improved responsive builder sizing and touch targets.

### Settings / Send / Review
- Reduced oversized card chrome and improved scan hierarchy in Study settings and Send.
- Refined launch checks, campaign creation surfaces and tables.
- Improved Review metric hierarchy, chart spacing and analytical card rhythm.

### Participant experience
- Increased reading comfort, question-card separation and choice affordances.
- Made the participant header sticky and tightened mobile spacing.

## v16 — Workflow and participant-session polish

### Participant continuity
- Added tab-scoped participant draft recovery using `sessionStorage`.
- Refresh restores normal questions, screeners, page position, card-sort grouping state and tree-test selection/journey.
- Participant elapsed time continues across a refresh rather than resetting.
- Successful submissions create a completion receipt for the current tab and clear the draft, reducing accidental duplicate submissions after refresh.
- Added clearer participant progress metadata and accessible progressbar state.

### Workspace polish
- Home now limits Recent studies to the six most recently edited items.
- Studies is sorted by recent activity and adds client-side search + Draft/Live/Closed filtering without rerendering on each keystroke.
- Added proper empty-filter state and result count.

### Send / relay readiness
- Send distinguishes an encrypted published version from an actually online relay.
- Added explicit relay health check.
- Remote sharing and campaign creation now revalidate relay availability before exposing distributable actions.
- Relay status refreshes when entering Send/Review.

### Packaging / regression
- Updated package and service-worker cache to v16.
- Added package-level regression checks for required runtime assets, native-dialog regressions, API cache exclusion, participant recovery hooks and relay readiness.
- Verified the dependency-free server serves the health endpoint and all primary application assets successfully.
- Hardened static request normalisation so repeated leading slashes cannot turn a valid app route into a 500 response.

## v15 — Defect stabilisation

### Data integrity
- Split participant responses into immutable per-response encrypted IndexedDB records.
- Participant submission no longer persists researcher workspace state.
- Added workspace revision checking and BroadcastChannel stale-tab detection.
- Added autosave visibility/pagehide flushing and explicit save-conflict/failure states.

### Version integrity
- Added immutable `publishedVersions` archive.
- Review now analyses one originating version/schema at a time.
- Draft edits cannot alter historical results.
- Undoing back to published content clears dirty state by content comparison.
- Relay retains encrypted versions too; participant/campaign URLs are version pinned.

### Lifecycle
- Removed draft → live bypass.
- Publish/reopen/close use rollback on failed persistence/relay changes.
- Launch validates Builder and Study settings.
- Exact UTC closing timestamp is enforced by relay/server time.

### Remote participant collection
- Added dependency-free zero-access Node relay.
- Every published version receives a distinct client-side encryption key; no version decryption key reaches relay endpoints.
- Separate researcher admin capability protects publish/lifecycle/sync/invitations.
- Existing publication takeover, same-version overwrite and version downgrade are rejected.
- Concurrent response records are append-only and response sync is paginated.
- Service worker never caches API study/response payloads.

### Screeners / participant correctness
- Screen-out serialization follows displayed page order.
- Optional email values are validated when present.
- Recontact requires a valid email.
- Consent is resolved as latest explicit status and can be withdrawn in Participants.
- Participant duration uses a monotonic clock; relay received time is authoritative for submission time.

### Send / segments
- Controlled segments use personalised opaque one-use invitation tokens.
- Verified membership is separate from unverified source/segment attribution.
- Campaign creation is durably saved before links are exposed.
- Campaigns and segments archive rather than lose historical identity.
- Campaigns are pinned to the published study version they recruited against.

### Review / export
- Review filters are per-study and per-version.
- Findings retain version, filter and cohort size.
- CSV export uses the active immutable schema + active filter and includes provenance metadata.
- Added spreadsheet-formula injection sanitisation.
- Removed live-workspace demo response injection.
- Bounded and cached card-sort similarity analysis.

### Recovery / accessibility / cleanup
- Added portable passphrase-protected backup + restore.
- Added explicit encrypted-data recovery screen.
- Added secure cryptographic study slugs.
- Hardened tree validation.
- Corrected study-specific storage connection indicator.
- Added keyboard page/subitem reorder fallbacks and native switch controls.
- Added automatic label association and modal focus handling.
- Fixed stale save-state/recency/documentation issues.
- Added regression tests for stabilisation and relay behaviour.

## v40 — Segment card styling
- Reworked Send so every segment is a clearly bounded, standalone expandable card.
- Removed the separate Default/Custom segment grouping from the main card stack; All users now sits alongside custom segment cards while retaining its Default badge and non-deletable behaviour.
- Added a clear settings area inside expanded cards with separate Response target and Participant access panels.
- Improved segment header hierarchy, progress visibility, responsive behaviour and delete affordance.

## v43 — Quality, consistency and participant UX

- Fixed a real Review/Participants crash caused by the missing duration formatter; response durations now render safely for empty, seconds, minutes and hour-long sessions.
- Fixed the mobile application shell still reserving the hidden desktop sidebar column, which had squeezed several global pages into a narrow strip.
- Reworked Participant history into readable stacked records on phones instead of forcing a wide table across the viewport.
- Restored the QR encoder, PWA shell files and Navigation Companion that had been referenced but accidentally omitted from the v42 release folder.
- Improved builder focus positioning for newly added tall sections and added narrow-screen study-title truncation instead of visual clipping.
- Simplified participant privacy/error copy so normal study journeys no longer explain transport/encryption implementation details.
- Fixed Review still referencing the retired study-wide response target.
- Review now reports recruitment progress against the relevant Send segment target.
- Added an Overview recruitment-target panel covering All users and every active custom share segment.
- Added first-class Navigation task analysis in Review: completion rate, automatically detected success, manual completion, timeout and median task duration.
- Navigation responses now retain completion source and completion URL for analysis.
- Improved Highlighter first-use guidance with an on-image “Drag to highlight” affordance.
- Added optional neutral image description for Highlighter accessibility and reused it in participant/Review image alt text.
- Highlighter Review now shows average highlights per responding participant.
- Improved mobile participant ergonomics with reachable sticky Back/Continue controls and stronger 44px touch targets.
- Improved narrow-screen Review tabs, toolbar scrolling and target layouts.
- Removed unnecessary encryption/relay terminology from Home and participant-facing surfaces; secure collection remains automatic infrastructure.
- Renamed manual Review action from “Sync responses” to the clearer “Refresh responses”.
