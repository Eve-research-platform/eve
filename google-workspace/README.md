# Legacy Google Apps Script edition

This directory contains the v59 Apps Script experiment.

It is retained for compatibility, audit history and as a useful reference for browser-owned Drive integration.

It is **not the preferred Eve v60 deployment** because Apps Script's browser/runtime constraints prevent full feature parity, particularly around media capture and several server-side integrations.

For a full-capability Google deployment use:

`deploy/google/`

or the browser-facing:

`factory/`

That route deploys the complete Node Eve application to Google Cloud Run and keeps every Eve product capability available.
