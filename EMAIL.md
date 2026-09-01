# Eve Microsoft 365 email

## Researcher/admin setup

Open **Global Settings → Microsoft 365 Email**.

Enter:

- Microsoft Entra tenant ID
- Application/client ID
- Client secret
- Sender mailbox

The Entra application must have the Microsoft Graph permissions needed to send as the configured mailbox. For application/client-credentials mail this is normally the application permission `Mail.Send`, with administrator consent.

Use **Send test email** after saving. A successful test uses the same OAuth token acquisition and Graph `sendMail` endpoint used by Eve recruitment, Panel welcome and Panel removal messages.

## Secret handling

The client secret is written to Eve's local data directory only as an AES-256-GCM encrypted envelope. The encryption key is stored separately in `.m365-mail.key`.

The Settings API returns:

- whether a secret exists;
- sender/client/tenant configuration;
- test status;
- email templates.

It never returns the client secret or a secret-derived suffix.

Environment variables remain fallback configuration:

```text
EVE_M365_TENANT_ID=
EVE_M365_CLIENT_ID=
EVE_M365_CLIENT_SECRET=
EVE_M365_SENDER=
EVE_GRAPH_BASE_URL=https://graph.microsoft.com/v1.0
```

Saved Global Settings override the non-secret environment fields. A saved encrypted secret takes precedence over `EVE_M365_CLIENT_SECRET`; leaving the secret field blank keeps the current saved secret.

## Templates

Global templates:

- Recruitment invitation subject
- Recruitment invitation message
- Panel welcome subject
- Panel welcome message
- Panel removal subject
- Panel removal message

Recruitment supports `{{studyTitle}}`.

Panel welcome messages always receive a secure **Remove me from the research panel** link appended by Eve.

A Panel sign-up block can provide a study-specific welcome subject/message. Blank study-level fields inherit the global Panel welcome defaults.

## Delivery behaviour

- Recruitment: one email per recipient; Eve does not expose recipient lists to one another.
- Panel welcome: research response is saved first; membership becomes active only after the welcome email succeeds.
- Panel researcher removal: notification email is sent before the member is removed.
- Panel self-removal: no outgoing email is needed; the signed high-entropy removal link updates membership immediately.
