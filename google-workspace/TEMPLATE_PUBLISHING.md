# Publish Eve as a Google Sheet “Make a copy” template

This is a maintainer/release step. Researchers should not need to copy Apps Script source files themselves once the template is published.

## Why a Google Sheet

A copied Google Sheet can carry a bound Apps Script project.

Eve uses that Sheet only as the **launcher/ownership anchor**:

- the researcher chooses **Eve → Set up / open Eve**;
- the bound script prepares the private owner capability and `My Drive / Eve`;
- the researcher creates one Apps Script web-app deployment;
- the Sheet then produces a secure **Open Eve** link.

The research itself happens in the Eve web app, not in spreadsheet cells.

## Create the template once

1. Create a blank Google Sheet named **Eve — make a copy**.
2. Open **Extensions → Apps Script**.
3. Replace the default project with the files from this `google-workspace/` folder:
   - `Code.gs`
   - `Index.html`
   - `Styles.html`
   - `Scripts.html`
   - `Launcher.html`
   - `appsscript.json`
4. Save the project.
5. Reload the Sheet. Confirm the **Eve** menu appears.
6. **Do not run “Authorise & prepare Eve” in the public template itself.**
7. Share the Sheet as **Viewer** to the audience that should be able to copy it.

Before publishing, confirm Script Properties do not contain:
- `EVE_ROOT_FOLDER_ID`
- `EVE_OWNER_EMAIL`
- `EVE_OWNER_HASH`

The copy-protection logic also checks the bound spreadsheet ID and clears inherited owner/root properties when it detects a different copied Sheet.

## Publish the researcher link

Take the Sheet URL:

`https://docs.google.com/spreadsheets/d/TEMPLATE_ID/edit`

and publish the copy link:

`https://docs.google.com/spreadsheets/d/TEMPLATE_ID/copy`

That is the link GitHub/README should present as:

**Make your own Eve**

A researcher then sees Google's normal **Make a copy** screen.

## Researcher journey after copying

1. Open the copied Sheet.
2. Choose **Eve → Set up / open Eve**.
3. Select **Authorise & prepare Eve**.
4. Select **Open deployment page**.
5. Create **one** Web app deployment:
   - Execute as: **Me**
   - Who has access: choose the audience required for the studies.
   - External anonymous participants require the Workspace tenant to permit anonymous web-app access.
6. Return to the Sheet dialog and select **Refresh status**.
7. Select **Open Eve**.

The Open Eve link contains the private owner capability only in the URL fragment. Eve consumes it and immediately replaces that fragment with `/setup`.

## Important

We cannot create the live Google Sheet template from a source ZIP alone. A Google account must host the canonical Sheet once. After that, researchers use the `/copy` link and do not need Apps Script source-file handling.

The canonical template should be recreated or updated as part of each stable Eve release and smoke-tested in a real Google Workspace tenant.


## Configure update checks

The copied launcher can check a public release manifest, but the canonical template maintainer must configure the manifest URL once.

In **Apps Script → Project Settings → Script Properties**, add:

`EVE_UPDATE_MANIFEST_URL`

with the raw/public URL of a JSON file shaped like:

```json
{
  "version": "59.2.0",
  "releaseUrl": "https://github.com/ORGANISATION/EVE/releases/latest",
  "notes": "Optional release summary"
}
```

A starter file is included as `release-manifest.example.json`.

Update checks are advisory only in v59.2. Eve does not silently rewrite a researcher's copied Apps Script project.

## Google Drive permission

v59.2 no longer uses the broad `DriveApp` permission.

The manifest requests:

`https://www.googleapis.com/auth/drive.file`

and Eve talks to the Google Drive API with the Apps Script OAuth token.

This confines Eve to Drive files/folders it created or that the app has been explicitly granted access to.

For organisation-owned storage, the intended route is:

1. initialise Eve;
2. confirm the app-created `Eve` folder exists;
3. move that folder into an approved Shared Drive using normal Google Drive controls;
4. reopen Eve and re-check storage.

Eve keeps the folder ID and reports whether its root is currently in **My Drive** or a **Shared Drive**.

This Shared Drive route still needs a real-tenant smoke test before it should be described as universally supported across Workspace policies.
