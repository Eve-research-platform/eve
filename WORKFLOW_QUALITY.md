# Eve v55.0.0 — Workflow Quality

## Product objective

Make the existing Eve workflow feel predictable enough that a researcher can run a study without needing to understand the internal architecture or remember hidden prerequisites.

No new feature category was added.

## Build

The Builder now exposes validation where researchers navigate the study.

The Study Outline shows:
- ready state when there are no Build issues;
- number of unresolved issues;
- affected page;
- validation message;
- one-click navigation to the affected block/page.

The underlying `studyBuildIssues()` rules are unchanged.

## Send

The Launch Readiness dashboard combines the operational checks that previously appeared in separate parts of Eve.

Checks:
- Study content
- Study settings
- Audience
- Customer storage
- Panel email, only when Panel sign-up exists

The dashboard distinguishes **blocking readiness** from **operational health**. A disconnected customer-storage connector is visible but does not silently introduce a new launch gate. Panel email remains blocking because the existing Panel enrolment lifecycle requires successful email delivery.

## Review → Insight Bank

Review now shows a durable evidence-workflow card for the currently selected immutable study version.

It shows:
- number of saved insights for that version;
- the latest three;
- source Review section;
- tags;
- last edit date;
- direct edit action.

Qualitative quotes expose **Save insight** directly. Existing text-selection capture continues to work across Review content.

Insight provenance remains:
- study ID;
- study version;
- Review filter/cohort;
- source section;
- source label;
- source excerpt;
- tags.

## Workspace health

Global Settings now presents one summary for:
- AI
- Microsoft 365 email
- customer storage

Detailed provider configuration is still handled by the existing AI/Email settings and Storage connector screens.

## Regression gate

New:
- `tests/v55_workflow_quality.test.js`
- `tests/v55_end_to_end_workflow.test.js`

The workflow test verifies:
1. a valid study is Build-ready;
2. invalid content becomes a Send blocker;
3. Panel sign-up exposes missing email as a blocker;
4. live immutable version semantics remain intact;
5. recruitment target progress remains correct;
6. turning a study off preserves its immutable published version while disabling availability.

All previous v50–v54 regression tests remain enabled.


## v55.1 — Participant continuity

### Preview fidelity
Preview now renders with the same participant structural classes used by the live study. Researcher-only preview controls are outside the participant surface. Desktop and Mobile viewport modes help catch layout problems before Go live.

### Session trust
Participant draft persistence is now a visible state machine rather than hidden behaviour:

`Saving → Saved / Restored → Submitting → Completion`

A session-storage failure surfaces an explicit error and does not claim progress is safe.

### Insight deduplication
Qualitative evidence that already has a saved Insight displays that state and opens the existing record. This keeps the evidence → interpretation workflow idempotent for exact study-version/source evidence.

### Reduced duplication
The legacy Builder issue shortcut, Send fix strip and Review capture strip were removed because v55 introduced richer replacements for each.


## v55.2 — consistency and accessibility

### Visual consistency
The remaining researcher-facing character glyphs were removed in favour of the shared Eve SVG icon system. This includes Settings, Insights, Templates, Send, Panel and recording UI.

### Review navigation
Review uses an ARIA tablist and only exposes methods that exist in the immutable study version being reviewed. Arrow Left/Right and Home/End work across the visible tabs. The navigation remains sticky while researchers inspect evidence.

### Keyboard access
The workspace now has a skip-to-content link and one explicit focus-ring language across native and custom controls.


## v55.3 — operational clarity

### Studies
Study cards now calculate a recommended next action from the existing study state and validation rules. The recommendation does not introduce a new gate; it points researchers to the stage that already owns the work.

### Home
`Needs you` is now a task list with direct destinations rather than a set of passive warnings.

### Lifecycle language
The internal state remains `draft | live | closed`, but researcher-facing lifecycle copy is consistently `Draft | Live | Off`.

### Workflow-state styling
The Study Flow component actually emits `complete`. v55.3 corrects the late redesign CSS to style that real class, so completed step-number circles now receive the intended sage treatment.


## v55.4 — reliability hardening

### Symmetric lifecycle safety
Earlier Eve had strong rollback semantics when turning participant access off, but activation could still retain a local Live state after relay delivery failed. v55.4 makes activation fail-safe too.

A study only remains newly Live when the relay is reachable and participant delivery/lifecycle activation succeeds.

### Operation locks
Study lifecycle and Archive mutations are serialised per study to prevent duplicate execution from repeated clicks.

### Archive transaction safety
Restore now rolls back fully on save failure. Archive attempts to reconcile participant access if the local Archive save fails after closing a live link. Permanent delete commits workspace state before deleting local IndexedDB payloads.

### UI wiring gate
The release suite now statically checks inline UI handlers against actual defined functions and rejects duplicate static IDs.


## v56 — structural reliability

The quality programme now moves below the UI layer.

`eve-transactions.js` is the first production architecture seam for transactional mutations. Turn off and Archive restore have been migrated to it, while the more complex Go-live and live-Archive paths remain on their already tested v55.4 flows until they can be moved safely.

A hard architecture ratchet now prevents `app.js` growing beyond the v56 baseline.

The release gate also boots the real service and checks the deployed shell/assets/API over HTTP.


## v56.1 — Archive becomes a testable domain

Archive reliability is no longer dependent on testing a large browser application function indirectly.

The production Archive orchestration has been extracted and can now be run deterministically with fake persistence, relay and cloud services. The failure matrix checks the exact transitions that matter: whether the study remains visible, whether remote participant access is reconciled and whether local response/recording cleanup starts only after the workspace deletion commits.

The same approach should be used for Study lifecycle next.


## v56.2 — publication lifecycle is deterministic

Go live and Turn off are no longer opaque browser functions inside the main application file.

The production lifecycle domain is exercised with fake persistence, Panel and relay services, including ambiguous network outcomes. The real relay also has an idempotence/reconciliation integration test, so a successful server commit followed by a lost browser response can be distinguished from a genuine failed publication.

This is the second complete operational extraction after Archive.


## v56.3 — participant completion is recoverable

A participant completing a study is now treated as a transactional delivery rather than a single fragile POST.

The response receives one stable ID. Recording IDs are stable across retries. Once all recordings have been persisted, the complete response is retained in the participant tab until Eve receives a confirmed response acknowledgement.

If the page reloads during that state, Eve resumes the saved submission instead of returning the participant to the research task.

The relay supports the corresponding idempotent response/recording contract, including controlled-audience retries.


## v56.4 — finishing the existing journey

The Workflow Quality programme now includes a dedicated interaction-polish layer.

Build, Study settings, Send and Review retain their existing decisions and validation rules. The work in v56.4 is presentation and usability only: clearer hierarchy, calmer cards, stronger form consistency, improved responsive behaviour and more deliberate modal/empty-state handling.

The participant surface received the same pass without changing response semantics or the recoverable-delivery path introduced in v56.3.


## v57 — browser-level workflow assurance

The workflow-quality release gate now has an executable browser layer.

The golden path is no longer represented only by source assertions and HTTP integration tests. Playwright drives the visible UI across researcher and isolated participant browser contexts.

The first failure-injection browser scenario targets the highest-risk participant path: response submission after the participant has already completed the study. It verifies that a transient server outage results in a recoverable **Response waiting to send** state and that Retry sending produces one logical response.

`npm run release:check` is the intended promotion command for environments where Playwright Chromium is available.
