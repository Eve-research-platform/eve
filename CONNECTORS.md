# Eve cloud connectors — v53.7

Eve supports real, OAuth-backed storage in **Google Drive** and **Microsoft SharePoint**.

The browser encrypts research content before it is sent to the connector service. The connector service transports ciphertext and manages OAuth credentials; it does not receive the browser research decryption key.

## Researcher flow

### Google Drive

1. Open **Storage**.
2. Select **Connect Google Drive**.
3. Sign in to the approved Google account and grant Eve access.
4. Eve creates or reuses **My Drive / Eve**.
5. Choose **Use as default** if this should be the organisation default.
6. Use **Sync now** or allow Eve's normal debounced autosync.

Google uses the constrained `drive.file` scope. Eve can work with files it creates or files explicitly made available to the app rather than receiving general read access to the whole Drive.

### Microsoft SharePoint

1. Open **Storage**.
2. Select **Connect SharePoint**.
3. Sign in to the Microsoft work account.
4. Paste the approved SharePoint site URL.
5. Select **Find document libraries**.
6. Choose the approved document library.
7. Select **Use this location**.
8. Eve creates or reuses an **Eve** folder in that library.

The default delegated Microsoft scope is `Sites.ReadWrite.All` so an authorised researcher can select a site and document library interactively. Government/enterprise deployments can override `EVE_MICROSOFT_SCOPES` and use a more tightly administrated selected-site permission model.

## One-time deployment configuration

Set `EVE_PUBLIC_ORIGIN` to Eve's real browser origin before configuring provider callbacks.

### Google

Create an OAuth 2.0 **Web application**, enable the Google Drive API and add:

```text
<EVE_PUBLIC_ORIGIN>/api/connectors/google/callback
```

Environment:

```text
EVE_GOOGLE_CLIENT_ID=
EVE_GOOGLE_CLIENT_SECRET=
EVE_GOOGLE_SCOPES=openid email profile https://www.googleapis.com/auth/drive.file
```

### Microsoft

Create a Microsoft Entra **Web application** and add:

```text
<EVE_PUBLIC_ORIGIN>/api/connectors/microsoft/callback
```

Environment:

```text
EVE_MICROSOFT_CLIENT_ID=
EVE_MICROSOFT_CLIENT_SECRET=
EVE_MICROSOFT_TENANT_ID=organizations
EVE_MICROSOFT_SCOPES=openid profile email offline_access User.Read Sites.ReadWrite.All
```

### Connector secret

Set:

```text
EVE_CONNECTOR_SECRET=<long-random-secret>
```

The server encrypts provider access/refresh token records with AES-256-GCM.

For local development only, if `EVE_CONNECTOR_SECRET` is omitted, Eve creates a local random connector key beneath the relay-data directory.

## Security boundary

- OAuth access/refresh tokens are **not** stored in browser storage.
- The browser receives only a random opaque connector capability.
- Provider token records are AES-256-GCM encrypted on the Eve service.
- `workspace.eve.json`, study files and response files contain browser-encrypted ciphertext.
- Cloud connection capabilities are stripped before the workspace recovery payload is encrypted and uploaded.
- The recovery passphrase is never uploaded.
- `recovery.eve.json` contains only a PBKDF2 salt and an AES-GCM-wrapped copy of the browser encryption key.

## Cloud layout

Both providers use an Eve-owned folder:

```text
Eve/
  workspace.eve.json
  recovery.eve.json
  Studies/
    <study-id>/
      draft.eve.json
      versions/
        v1.eve.json
      responses/
        <response-id>.eve.json
      recordings/
        <recording-id>.eve.json
```

`workspace.eve.json` is written last during a full sync so it acts as the recovery-point commit record.

Recordings are also retained:

- local recording blobs are already AES-GCM ciphertext and are copied as encrypted recording documents;
- relay recordings are copied in their existing study-version encrypted form.

## Autosync

A successful local workspace save schedules a short debounced sync for connected providers.

A newly stored researcher-visible response schedules the provider assigned to its study.

**Sync now** performs a complete recovery sync for the chosen provider: studies, immutable published versions, responses, recordings and finally the workspace recovery point.

## Cross-browser recovery

Choose **Set recovery passphrase** after connecting a provider.

On another browser:

1. connect the same provider/location;
2. choose **Check cloud copy**;
3. if the browser key differs, enter the cloud recovery passphrase;
4. Eve decrypts the recovery point in browser memory;
5. choose:
   - **Restore cloud copy**;
   - **Reconcile safely**;
   - **Keep browser copy**.

Inspection is read-only.

### Reconciliation rules

- study exists on one side only → preserve it;
- study exists on both → newest `updatedAt` wins;
- responses → union by immutable response ID;
- findings → union by ID, newest record wins;
- participant segments → union by ID;
- connector capabilities/token state always remain local to the current browser/service session.

## Archive and permanent deletion

Archived studies continue to sync as archived research so they remain recoverable during the 30-day retention window.

When a study is permanently deleted, Eve removes its encrypted study/response/recording files from **every cloud provider the study has previously synced to** before it deletes the local study. If one of those connectors is unavailable, Eve keeps the study in Archive rather than claiming a partial permanent deletion.

Published relay data is removed separately by the zero-access relay deletion step.

## Testing boundary

The build contains mocked provider integration tests covering OAuth/PKCE, token-vault encryption, Google Drive file I/O, SharePoint site/library discovery and SharePoint file I/O.

A live OAuth round-trip against a real customer Google Workspace or Microsoft 365 tenant cannot be performed without that deployment's own client credentials and consent policies.
