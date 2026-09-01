# Eve Local + Relay

This profile runs the researcher workspace on one researcher’s computer and uses the bundled Cloudflare relay only for public participant transport.

## Data boundary

- Eve researcher UI and local encryption run on the researcher’s computer.
- Eve binds to `127.0.0.1` by default; participant devices never connect to the researcher machine.
- Durable encrypted research can be synced to the organisation’s approved SharePoint or Google Drive through Eve Setup.
- Cloudflare R2 temporarily stores encrypted study, response and recording envelopes. The relay never receives the participant decryption key.
- Recordings are copied to the selected SharePoint/Google Drive store, read back for verification, then scheduled for removal from R2 after a 48-hour grace period. Failed verification leaves the relay copy untouched.
- After verified handoff, Eve keeps a browser-encrypted local playback cache; SharePoint/Google Drive remains the durable recording store.
- Participant Panel signup/removal email operations are not available through the standalone zero-access relay.

## Install

1. Install Node.js 20 or newer.
2. Download and unzip `Eve-v63.0.0-local-relay-kit.zip`.
3. Start Eve:
   - Windows: double-click `start-eve.bat`
   - macOS: double-click `start-eve.command`
   - Linux: run `./start-eve.sh`
4. Eve opens at `http://localhost:8787`. Complete first-run Setup.
5. Connect approved SharePoint or Google Drive storage.
6. On the Relay step, leave **Cloudflare relay** selected and download `eve-relay-setup.json`.
7. Run `cloudflare-relay/deploy-relay.bat` or `cloudflare-relay/deploy-relay.sh`, select the downloaded setup file, and sign into Cloudflare when prompted.
8. Copy the deployed Worker URL into Eve and choose **Test relay**.
9. Save Eve’s recovery backup before running live research.

## Intended use

This profile is best for one researcher or a small self-contained setup where central Google/Azure hosting is unavailable. For a shared departmental Eve with central accounts, collaboration and a continuously available researcher service, use the Google Cloud or Azure profiles.
