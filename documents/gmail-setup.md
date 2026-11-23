# Gmail connection and incoming-email tickets

Stage 2 connects a real Gmail or Google Workspace Gmail mailbox to SERVIT. It uses read-only Gmail API access, a persistent discovery/delivery queue and the existing MCP `process_email` tool. Optional Stage 3 AI providers are configured in the same Admin page; see [AI provider setup](email-ai-setup.md). Existing findings/description rules work without AI. No acknowledgement or other customer email is sent by this ingestion service.

## 1. Choose a mailbox

- Use a dedicated support mailbox that receives customer requests, or a separate Gmail account for a controlled test. An existing mailbox is sufficient; SERVIT does not create Google accounts.
- For company use, have the Google Workspace administrator provision or approve the support account. A mailing-list address/Google Group is not itself an authorized Gmail user's mailbox. Connect the actual Gmail account that receives the messages.
- Save that exact account address under **Admin → MCP Server → Add mailbox**. Add the address; sender-domain and routing-scope restrictions are optional Advanced settings. Missing details do not prevent email ticket creation. A sign-in to a different Google address is rejected.

## 2. Create Google OAuth credentials

1. Open [Google Cloud Console](https://console.cloud.google.com/), create/select a project such as **SERVIT Email Integration**.
2. Under **APIs & Services → Library**, find **Gmail API** and enable it.
3. Open **Google Auth Platform**. Complete **Branding** with an app name, support email and developer contact email.
4. Under **Audience**, choose **Internal** only when all users belong to your eligible Google Workspace organization. Otherwise choose **External**. For an External app in Testing, add the support mailbox under **Test users**.
5. Under **Data Access**, add `https://www.googleapis.com/auth/gmail.readonly`. SERVIT requests this single Gmail scope, not sending, modifying or deleting mail.
6. Under **Clients**, create a client with type **Web application**, for example **SERVIT Portal**.
7. In SERVIT **Admin → MCP Server → Gmail connection**, copy the displayed **Authorized redirect URI** exactly into the OAuth client's **Authorized redirect URIs**. With the local default this is:

   `http://localhost:5173/api/config/admin/mcp/gmail/callback`

   The value is generated from server `CLIENT_URL`; use the displayed value if it differs. Ports, hostname and path must match. Browser-side JavaScript origins/API keys are not used for this server-side flow.
8. Copy the Client ID and Client Secret into SERVIT and click **Save Google settings**. Enter secrets only in the portal, not in chat, source files or screenshots. Blank secret preserves the saved one. Replacing credentials requires reconnecting mailboxes but preserves tickets and queue history.

Google references: [Enable APIs](https://developers.google.com/workspace/guides/enable-apis), [configure consent](https://developers.google.com/workspace/guides/configure-oauth-consent), [web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## 3. Connect and start processing

1. Open SERVIT using the same origin as the redirect URI. Do not switch between `localhost` and `127.0.0.1`, because the sign-in session belongs to that host.
2. Enable MCP and complete its mailbox/default settings. Use **Check connection** to verify the MCP endpoint.
3. In **Gmail connection**, choose the configured support mailbox. Leave **Start processing from** empty to process only messages received after clicking Connect. Selecting an earlier date explicitly imports matching older received mail. The field uses the browser's local time.
4. Click **Connect Gmail**, sign in to that exact support account, and approve read access. Only an Admin session can complete the callback. State expires after ten minutes and can be used once.
5. On return, Gmail shows its verified account and connection state. Click **Check Gmail** to test access and **Sync now** to begin immediately. Automatic polling runs every 30 seconds while the backend is running. No Pub/Sub project or public inbound webhook is required for this polling version.
6. Review **Recent email processing**. Statuses are pending, processed, needs review, failed or skipped. Ticket links open created/updated tickets. Attachment warnings explain unsupported or oversized files. Use the Admin Needs routing queue for unrouted tickets. Correct invalid supplied values or processing problems, then use **Retry email** and **Sync now** for a review/failed item.

## 4. Verify real emails

Send from a different customer/test account to the support mailbox:

| Test | Expected result |
| --- | --- |
| New conversation matching findings | New System ticket, New status, Unassigned, correct department/sub department |
| Reply in the same conversation | Same ticket; email body and supported attachments added as a comment |
| Sync the same message again | No duplicate ticket/comment |
| Close the ticket, then reply | Same ticket becomes In Progress; assignee remains; shared bell/My Query unread event |
| Reply while already In Progress, Pending, Resolved or another state | State remains unchanged; latest reply is added and bell/My Query mark the ticket unread again |
| New conversation, same customer case number | Separate ticket, because Thread ID is new |
| No clear routing match | Ticket assigned to an active Admin and flagged Needs routing; if no Admin is active, retained in the Admin queue |
| Pause, send email, resume | Catches up from the preserved checkpoint; no duplicate successful processing |
| Disconnect and reconnect | Existing tickets/history remain; original start time and unfinished queue are preserved |

Gmail links require access to the connected mailbox. Verify the message/conversation deep links with the real account during the first test.

## Operation and limits

- Discovery uses the Gmail history cursor for new message additions plus fixed timestamp windows, persisted pagination and a two-minute search overlap for initial import/reconciliation. Cursor expiration falls back to the timestamp scan without discarding the queue. A checkpoint advances only after discovered IDs are durably queued. A crash after MCP commits is safe: replay uses the saved Message ID and skips duplicate ticket work. History IDs are discovery checkpoints only; ticket matching still uses only mailbox + Message ID / Thread ID.
- Only incoming mail is processed: Sent, Drafts, Spam and Trash are excluded. Self-sent support messages and disallowed sender domains are skipped. No Gmail messages are marked read, labelled, deleted or sent.
- At most five pages each for history/search discovery (100 results/page) and twenty queued messages per mailbox per worker pass; backlog is resumed later. Failed processing retries with backoff up to five attempts and then remains visible for manual retry. Review items wait for an Admin retry.
- MIME/encoded headers and plain-text bodies are parsed; HTML-only mail is converted to plain text. At most ten supported attachments and 25 MB total decoded attachment bytes are imported per email. Oversized/unsupported attachments are reported without losing the email. Bodies over 200,000 characters are retained in Gmail and appear as import failures, not silently truncated into a ticket.
- Tokens and client secrets are encrypted with the existing `EMAIL_ENCRYPTION_KEY`; keep that key with backups. Access tokens are short-lived and used only server-side. Public Admin responses omit secrets. Disconnect clears SERVIT's stored refresh token and pauses polling; remove the application's permission in Google's account **Third-party connections** as well if revocation at Google is wanted.
- Revoked/expired grants show **Reconnect required**. Temporary Google/MCP failures keep the durable queue and checkpoint for retry. Changing OAuth credentials pauses existing connections until reconnect. Missing required fields result in Details incomplete tickets; invalid supplied values still require review.
- External OAuth apps in Testing normally receive refresh tokens that expire after seven days for Gmail access. Use Google's appropriate Internal/Production publishing and verification process for an ongoing company deployment; `gmail.readonly` is a restricted scope. See [token expiration](https://developers.google.com/identity/protocols/oauth2#expiration) and [scope requirements](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Automated verification

`node server/scripts/test-gmail.js` simulates Google responses while exercising actual OAuth sessions/state, encryption, Gmail MIME parsing, PostgreSQL persistence and the official MCP HTTP client/server in a disposable database schema. It cannot prove that a real Google project/account has been configured correctly; the sign-in and real-email tests above complete that verification.

## Guided Admin interface

The MCP Server page uses three clickable cards: MCP server, Gmail mailbox, AI routing. Register the mailbox and verify MCP in the first card, authorize Gmail in the second, then configure AI in the third. Later cards unlock from saved verified prerequisite states. Each card shows only its own controls. Saved credentials stay masked; an explicit Admin-only Copy action retrieves one secret with no-store headers and a credential-access audit event. Normal configuration responses never include credentials. Red actions disconnect Gmail or disable AI without deleting ticket history.

## Controlled parallel email queue

Discovery runs independently every 30 seconds, including while previous emails wait for AI. Delivery uses three shared PostgreSQL worker slots by default, up to two mailboxes in parallel and 50 queued messages per mailbox batch. Backlogs continue in short subsequent passes without waiting for the next discovery tick. Queue metadata is prepared ahead; large MIME bodies/attachments are fetched only after a worker slot is obtained. Per-mailbox delivery locks prevent two processes from claiming the same mailbox, while mailbox-scoped Message ID uniqueness and transactional Thread ID locking remain the final duplicate protections.

Messages in a conversation are handled serially by received time. For a newly encountered conversation, Gmail thread metadata queues any earlier incoming messages that were not in the current discovery page. A failed/review/delayed earlier message blocks later replies; other conversations continue. On process death, the next delivery owner recovers interrupted processing rows, then replays against saved Message IDs. A commit followed by lost acknowledgement does not create another ticket, comment or attachment. Pause stops new work; a request already committed may finish. Discovery/checkpoints do not wait for long-running ticket work.

Admin → MCP Server → Gmail mailbox → Email queue monitor shows global waiting, processing, retry, review, failure and hourly completion counts; oldest waiting age; worker limits; and a paginated mailbox/status-filtered list. Totals cover all mailboxes; filters apply to the list. Retry a failed/review predecessor after correcting its cause. Work that has been processing, or waiting, for over five minutes is highlighted. Interrupted work is reclaimed only after the prior mailbox delivery lock is released, never by stealing an active worker's lease.

Only the latest **40 completed processing history entries** (processed or skipped,
across all mailboxes) are retained. Older completed queue details are deleted after
delivery passes and during the 30-second automatic check. Pending, processing,
failed and review entries are excluded from deletion. Lightweight message-ID
receipts preserve duplicate suppression and aggregate completion counts; original
email/thread records, tickets, comments and attachments are not deleted. The
processed/skipped queue lists therefore show recent retained history, while the
monitor's aggregate counts include earlier completions.

Server settings in `.env.example`:

- `SERVIT_EMAIL_WORKERS=3`: maximum concurrent ticket payload workers; bounded 1–6. Slots are shared across instances using the same database schema.
- `SERVIT_EMAIL_MAILBOX_WORKERS=2`: simultaneous delivery/discovery mailboxes; bounded 1–3 per process.
- `SERVIT_EMAIL_BATCH_SIZE=50`: messages selected per mailbox batch; bounded 10–100.
- `SERVIT_MCP_RATE_LIMIT_PER_MINUTE=600`: authenticated MCP requests per minute per client IP; bounded 120–10000. Rate-limit responses defer work instead of exhausting message retries.

Restart after changing limits, and use matching worker limits on all instances. Tune only after measuring database connections, RAM, attachment sizes and vendor quotas. Default database pool capacity is 20 per process; raising concurrency blindly can increase contention. Gmail rate limits and Retry-After delay the mailbox rather than triggering tight retry loops.

`node server/scripts/test-email-bulk.js` runs isolated PostgreSQL records with real MCP HTTP, simulated Gmail/AI network, 300 unique emails across 100 conversations/two mailboxes, duplicate deliveries, exact attachment byte/body checks, pre/post-commit failures, a real forced worker-process exit, missing-original discovery, late reopening replies, pause/resume, and visible permanent failure/blockage. The report is written to `backups/email-bulk-test-report.json`. Its elapsed time is a synthetic test observation, not a production throughput claim or Gmail/AI quota guarantee. No real emails are sent and no production ticket records are used.
