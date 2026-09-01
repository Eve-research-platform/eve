# Eve Browser Release Gate

Eve v57 introduces real-browser release tests using Playwright.

## Why this exists

Node/source tests can prove that functions, routes and lifecycle contracts exist, but they cannot prove that a researcher can actually click through the rendered application or that participant-facing CSS/DOM interactions still work.

The Playwright gate exercises the packaged Eve service in a real Chromium browser.

## Setup

Browser testing is development/release tooling only.

Eve itself still starts with:

```text
npm start
```

No Python or Playwright dependency is required for normal Eve use.

For browser QA:

```text
python -m pip install -r requirements-e2e.txt
python -m playwright install chromium
npm run e2e
```

To use a system Chrome/Chromium instead of the Playwright-managed browser:

```text
EVE_CHROMIUM=/path/to/chromium npm run e2e
```

On Windows, set `EVE_CHROMIUM` in the shell using the normal Windows environment-variable syntax.

## Release command

```text
npm run release:check
```

This runs:

1. static/syntax checks;
2. the full existing v50–v57 Node/HTTP regression suite;
3. Playwright browser journeys.

A build should not be promoted from CI unless `release:check` is green.

## Current browser journeys

### Golden journey

- Home
- New study
- inline title edit
- participant Preview
- Settings
- Send
- Go live
- isolated participant context
- completion/submission
- Review response retrieval
- Insight capture
- Turn off
- closed participant link
- researcher reload

### Participant response recovery

The browser intercepts response submission and deliberately returns HTTP 503.

The test verifies:

- automatic retry;
- recoverable completed response;
- `Response waiting to send`;
- `Retry sending`;
- successful recovery when the outage ends;
- one logical response in Review.

## Isolation

Every run:

- starts the real `server.js`;
- allocates a random local port;
- uses a temporary relay-data directory;
- does not connect real email, AI or cloud providers;
- uses separate browser contexts for researcher and participant.

## Screenshots

The golden journey writes screenshots to:

```text
test-artifacts/browser/
```

These are currently diagnostic artifacts rather than strict pixel-diff baselines.

A later release can promote a curated set of stable screens to visual-regression snapshots once the CI browser environment is fixed and repeatable.

## CI recommendation

Start with Chromium on every release.

Once stable, extend the critical-path subset to:

- Firefox;
- WebKit.

Do not mechanically run the entire suite in all engines. Use Chromium for depth and Firefox/WebKit for compatibility-sensitive paths.

## Environment restrictions

Some managed development environments apply browser policies that block all URL navigation, including localhost.

If Chromium reports:

```text
ERR_BLOCKED_BY_ADMINISTRATOR
```

the browser gate cannot run in that environment. Do not bypass organisational browser policy. Run the gate in a normal CI runner or developer browser environment instead.


## v57.1 — study-theme browser journey

The release browser suite now includes `study_theme_playwright.py`.

It:
1. creates a study;
2. selects **GDS** in Study Settings;
3. verifies Preview receives `study-theme-gds`;
4. checks the black GDS-style header;
5. publishes the study;
6. opens it in a separate participant browser context;
7. verifies the GDS theme is present remotely;
8. checks the GDS green primary action.

This prevents a theme selector that only changes the Settings UI without reaching the actual participant publication.


## v58 — first-run setup journey

The browser release sequence now starts with `first_run_setup_playwright.py`.

It confirms a genuinely fresh workspace opens the new Setup experience rather than Home.

The older golden/recovery/theme browser fixtures then deliberately select **local evaluation mode** so those tests remain isolated from real SharePoint/Google/Cloudflare accounts.
