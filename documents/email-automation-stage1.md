# Email automation — Stage 1

Stage 1 is a real MCP server and a persisted email processing service. It does not connect to Gmail, watch a mailbox or call an AI provider. Tests send simulated emails through the official MCP client and a real disposable PostgreSQL database.

The separate Stage 2 Gmail reader is now implemented and calls this MCP service. See [Gmail OAuth setup and real-email testing](gmail-setup.md). Live Google sign-in requires your approved Google project/mailbox; AI providers are available through the optional Stage 3 setup described in [AI and incomplete-ticket setup](email-ai-setup.md).

## Behaviour

- Match duplicates using **configured mailbox + Gmail Message ID**.
- Match tickets using **configured mailbox + Gmail Thread ID**.
- A new thread creates a separate ticket even if its external customer case number matches another ticket.
- Store external case numbers as references only; never use them, reply headers or subject similarity to merge tickets.
- Create as **System**, **New**, **Unassigned**. System is an inactive protected identity, not a fourth role and not an interactive login.
- Add the exact plain-text email body as a System comment, including sender/time metadata and a best-effort Gmail conversation link. Gmail access is still required; verify links with the real mailbox in Stage 2.
- Reply to Closed: record one reopening event, set In Progress, preserve assignee and department. Other states, including Resolved, stay unchanged. Every successfully processed new email marks the ticket unread again: Closed replies use Closed → In Progress by email; other replies use New email received. The assignee, or eligible queue members for unassigned tickets, see the same unread ticket in bell/My Query. Opening the rendered revision clears both badges; a stale read cannot clear a newer email. Multiple unseen replies on one ticket remain one unread ticket; the latest event is shown. Duplicate Message IDs do not increase the revision or alert again.
- Email comments show sender, received time, the original Gmail link and the latest reply text. Recognized quoted Gmail/Outlook history is omitted from the displayed comment because earlier emails already have their own comments; the original stored body is preserved. Uncertain quote formats stay visible, and internal comments/work notes retain their existing presentation.
- Ticket changes, thread mapping, comments, attachment bytes, audit and the processed receipt commit together. Transaction failure rolls back ticket work, records a failed receipt where the database is available, and allows safe retry with the original email.
- No acknowledgement or other outbound email is sent by the processing service.

## Routing

1. Check active department/sub department findings. Commas, semicolons and new lines separate reference phrases; text is never executed as instructions. Exact sender email is stronger than domain or subject/body phrase matches. Equal parent/child matches prefer the child; unrelated ties require review.
2. If no findings match, an explicitly supplied reviewed `routingDecision` can select an active in-scope destination. It can also resolve a conflicting findings match.
3. Without that decision, use deterministic department-description keywords (at least two meaningful matching words), then assign unclear results to an active Admin for review.
4. Missing business fields do not block creation: store empty values and show Details incomplete. Unclear/conflicting routing creates a Needs routing ticket assigned to the earliest-created active Admin (user ID breaks ties). If none is available, capture it unassigned in the Admin-only queue. Invalid supplied values or a deleted linked ticket still produce a review/failure record. Retry only the original identity/body; already processed messages remain duplicates.

These are the rule-based routing steps. The optional AI provider can supply validated fields/routing before the Gmail reader calls MCP; exact findings still win. See [AI provider setup](email-ai-setup.md). An existing thread is never automatically rerouted.

## Setup

### Admin portal

Open **Admin → MCP Server** (`/admin/mcp`). Only Admin can read or change these settings; Managers and Users are denied at both the page and API.

1. Enable MCP and save. Existing environment credentials continue working until explicitly replaced. Generate a new credential only when needed, copy it once and update any external integration using the old credential. Portal credentials are encrypted using a derived key from the existing server `EMAIL_ENCRYPTION_KEY`; back up that key with the database.
2. Add or select a support mailbox. Use Advanced settings only if sender-domain or routing-scope restrictions are needed. Ticket defaults are no longer collected or applied. Required custom fields come from the application's live field configuration. An empty department selection allows all active destinations. Existing mailbox addresses cannot be renamed, so saved message/thread identity is preserved; disable a mailbox instead of deleting its history.
3. Click **Check connection**. This initializes the actual local MCP HTTP endpoint using its configured credential, discovers the five tools and reads active mailbox routing context. It creates no tickets and sends no email. **Connected and ready** means this check passed and the saved setup is complete. Changing server/mailbox settings invalidates the check; missing defaults, inactive destinations or server mailbox restrictions block readiness.
4. Gmail has a separate connection flow described in [Gmail setup](gmail-setup.md). Saving a mailbox address alone does not authenticate Gmail. Connect it using the Google OAuth controls to enable the Stage 2 reader. Optional AI provider setup is available in the same Admin page.

The portal does not accept an arbitrary MCP destination URL: this application exposes its own `/api/mcp` endpoint. Settings apply without an API restart. Environment `SERVIT_MCP_MAILBOXES` remains a server-enforced upper limit on allowed mailboxes. The CLI below remains available for initial setup and scripted mailbox provisioning; the portal's saved enable/credential settings take precedence over environment defaults.

Run from the repository root after installing server dependencies:

```powershell
node database/migrate.js
node server/scripts/configure-email-mcp.js --init-token
```

This stores a new strong `SERVIT_MCP_TOKEN` in the ignored `.env` file (without printing it) and enables `SERVIT_MCP_ENABLED=true`. Restart the backend. Keep the token private and supply it to your trusted MCP client through its secret configuration. Never put it in frontend code, a committed file or an email.

Create a local JSON defaults file using IDs and values from your application, for example:

```json
{
  "moduleText": "Storage",
  "categoryId": "REPLACE-WITH-ACTIVE-CATEGORY-UUID",
  "priority": "MEDIUM",
  "customData": {
    "country": "REPLACE-WITH-APPROVED-DEFAULT"
  }
}
```

Optional fields include customerName, typeId, subcategoryId and custom field defaults. Missing values remain empty; sender email stays requester metadata. A ticket is still created with Details incomplete. Reviewed values must match configured options.

```powershell
node server/scripts/configure-email-mcp.js --mailbox support@example.com --defaults-file mailbox-defaults.json
node server/scripts/configure-email-mcp.js --list
```

Legacy fallback flags are retained for configuration compatibility, but unclear routes now go to Admin review instead of a configured department. Optional mailbox flags: `--fallback-department UUID`, `--fallback-subdepartment UUID`, `--departments UUID,UUID`, `--sender-domains dell.example,customer.example`, `--disable`. Re-running preserves existing defaults unless a defaults file is supplied. An empty department allowlist means all active destinations. A department grant includes its children; a child grant exposes only that child as a destination.

No real mailbox is configured automatically: its address, required defaults and allowed scope must be chosen by the administrator. Configuration alone does not authenticate to Google or import historical messages.

## MCP connection

- Local endpoint: `http://127.0.0.1:5000/api/mcp`
- Transport: stateless Streamable HTTP; POST supports initialization and tool calls, GET/DELETE return 405.
- Header: `Authorization: Bearer <SERVIT_MCP_TOKEN>`
- Production: use HTTPS through the existing reverse proxy. The configured `CLIENT_URL` determines the allowed browser Origin/Host. Credentials are checked before parsing large request bodies, with a request rate limit.
- Optional `SERVIT_MCP_MAILBOXES=support@example.com,other@example.com` further limits the credential to those configured mailboxes. Empty means all explicitly configured mailboxes, not arbitrary addresses.
- Tools: `get_routing_context`, `preview_email_routing`, `process_email`, `get_ticket`, `list_email_processing`.
- `get_ticket` can read only tickets linked to the specified allowed mailbox; it cannot browse unrelated portal tickets. There are no generic SQL, delete-ticket or individual assignment tools.

Example `process_email` arguments (send through an authenticated MCP client):

```json
{
  "mailbox": "support@example.com",
  "messageId": "MSG-001",
  "threadId": "THREAD-100",
  "sender": "support@dell.example",
  "subject": "Dell storage performance issue",
  "body": "Our Dell storage is responding slowly.",
  "externalCaseReference": "DELL-4587"
}
```

A reply uses a new messageId and the same threadId. Reusing the same messageId skips already processed work. Retrying a failed or reviewed message must retain its original sender/body/thread identity.

Supported inline attachment input: `attachments: [{name, mimeType, contentBase64}]`. Limit: 10 files, 25 MB total decoded bytes per call, 36 MB JSON request. Unsupported names/types or invalid base64 are recorded in `attachmentErrors`; allowed files and the email are retained. Larger bundles must wait for the Stage 2 attachment ingestion design. The portal's existing attachment rules remain separate.

## Verification

```powershell
node server/scripts/test-email-mcp.js
node server/scripts/test-mcp-config.js
node server/scripts/test-organization.js
node server/scripts/test-migrations.js
node server/scripts/test-client-bindings.js
node server/scripts/sync-email-automation.js --check
npm --prefix server audit
```

The MCP suite covers protocol discovery, authorization, routing findings, description/fallback/review paths, required fields, different mailboxes, same-case new threads, concurrent duplicates/replies, reopening, reconnection, rollback/retry, attachment handling, protected System identity and absence of outbound email. All business test records live in temporary schemas, removed by the suites.

## Incident numbering and temporary AI outages

All new email conversations create Incident tickets using the configured INC counter, even if the email mentions another type or AI is disabled/unavailable. Missing/inactive Incident configuration is retained for review and never falls back to PSH. Exact labelled business and dynamic fields can be captured against valid configured options without AI. Exact Department/Sub Department labels are matched within mailbox scope; conflicting findings or labels go to Admin. Temporary provider 502/503/504 responses are retried once within the same 30-second deadline and reported as temporary unavailability. Successfully processed messages are never reprocessed automatically to change saved ticket details. Explicit operator repair of an untouched legacy intake preserves its ticket ID, original email, comments, attachments and thread links, with an audit trail.
