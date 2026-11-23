# Incomplete email tickets and AI provider setup

## Email capture without complete details

An incoming email is captured even if Customer, Module, Category, Priority, Impact, Urgency or required custom fields are missing. Missing scalar values are stored as NULL; custom values remain absent/null. SERVIT still generates its ticket number, sets System as creator, New as status and leaves the assignee Unassigned. Sender email is stored as requester metadata, not invented as a customer name. Mailbox ticket defaults are retired and no longer applied to new email tickets. Existing ticket values are preserved.

The ticket shows **Details incomplete** and lists missing fields. Agents can save partial edits; opening/editing does not silently change missing Priority/Impact/Urgency to Medium. Completing all required details clears the label. The marker follows the current required-field configuration. Regular manually created portal tickets retain their existing validation.

If findings, rules and selected AI cannot establish a route, the email creates a ticket assigned to an active Admin, with empty department fields. The earliest-created active, nondeleted Admin is selected (user ID breaks ties). If no active Admin exists, the email is still captured unassigned in the Admin queue. A valid department-only route does not require a sub department. **Needs routing** tickets are visible to Admin only, under **All Tickets → Needs routing** or the queue link in MCP Server. Admin can route them with a work note. Original body, comments, attachments, Gmail identity and ticket number remain unchanged. Subsequent replies update the same ticket; they do not generate a replacement or automatically overwrite human routing/fields.

Malformed identity, invalid supplied values, unsafe/out-of-scope destinations, oversized email bodies or a reply linked to a deleted ticket still produce an explicit processing failure/review record. They do not fabricate values or bypass authorization. Correct the issue and retry the original message where appropriate.

## Configure one or more AI providers

1. Sign in as Admin and open **MCP Server → AI providers**.
2. Choose **Google Gemini**, **OpenAI** or **Anthropic Claude**. You can save credentials for all three. These are API credentials, separate from Gmail OAuth and consumer Gemini/ChatGPT/Claude chat subscriptions.
3. Enter an API key and the exact model ID available to your API account. Choose a model that supports structured JSON outputs. No model or API key is guessed by SERVIT.
4. Click **Save provider settings**, then **Check saved connection**. The check makes a small synthetic inference request, without customer email data; provider API usage charges/quotas apply. Only a successful structured response marks the saved configuration connected.
5. Choose the **Active AI provider**, enable **AI for new email conversations**, and click **Save AI selection**. Until this explicit activation, Gmail capture uses findings/rules only and no customer content is sent to AI.
6. A new conversation sends sender, subject, plain-text body, scoped department names/descriptions/findings, category/type options and field definitions to only the selected provider. Attachments are not sent. Missing data stays empty; a provider error does not prevent capture. Changing the active provider's model/key disables AI until checked and enabled again. Disable AI to continue with findings/rules.

Official setup/API documentation:

- [Google Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key), [GenerateContent](https://ai.google.dev/api/generate-content).
- [OpenAI API keys](https://platform.openai.com/api-keys), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
- [Claude API access](https://platform.claude.com/docs/en/api/overview), [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

## Validation and failure behavior

- The provider returns structured suggestions; it does not write to the database or receive general-purpose tools. Gmail passes validated suggestions to MCP `process_email`; mailbox + Message ID / Thread ID remain the only matching keys.
- New conversations may receive AI extraction/routing. Successfully processed duplicates and linked conversations skip AI; existing human fields/assignee/department are preserved.
- Extracted values require a quote present in the original subject/body and matching the extracted value or approved option label. Unknown fields, unsupported values, foreign IDs, missing evidence and privileged assignments/status changes are discarded. Incomplete tickets are preferred to guesses. Semantic grounding cannot guarantee that a model understands every email; agents should review extracted details.
- Exact findings matches take precedence over AI routing. AI destinations must belong to the active mailbox scope. Unclear results are assigned to Admin for routing; legacy configured department fallbacks are retained but no longer used to guess a destination.
- Requests use fixed HTTPS vendor endpoints, server-side encrypted API keys, timeouts, bounded input/output and no arbitrary destination URLs. The API response and logs do not echo credentials or raw provider error bodies. OpenAI Responses uses `store:false`; other provider data handling follows your provider account terms.
- API/model connection checks are separate for each provider. A failed/stale check cannot leave that configuration falsely ready. There is no automatic fallback to a different vendor.
- AI provider/model/application status is recorded in the ticket audit history. Failed AI extraction is shown in Gmail processing history while the email itself is still captured.

## Verification

`node server/scripts/test-email-ai.js` simulates each vendor API while exercising real Admin authorization, encryption, request/response handling, evidence validation, provider switching and database ticket writes. Real vendor authentication/model availability requires your API credentials and the connection button. Email, Gmail, migration and UI binding suites also cover partial creation, completing details, routing access, replay/concurrency, notifications, attachment bytes, rollback and existing manual behavior.

## Incident numbering and temporary AI outages

All new email conversations create Incident tickets using the configured INC counter, even if the email mentions another type or AI is disabled/unavailable. Missing/inactive Incident configuration is retained for review and never falls back to PSH. Exact labelled business and dynamic fields can be captured against valid configured options without AI. Exact Department/Sub Department labels are matched within mailbox scope; conflicting findings or labels go to Admin. Temporary provider 502/503/504 responses are retried once within the same 30-second deadline and reported as temporary unavailability. Successfully processed messages are never reprocessed automatically to change saved ticket details. Explicit operator repair of an untouched legacy intake preserves its ticket ID, original email, comments, attachments and thread links, with an audit trail.

## Connection stability and provider recovery

Saved credential verification is separate from runtime availability. Temporary network failures, timeouts, rate limits and provider 5xx responses keep an already verified provider configured and AI enabled. The portal shows an amber service warning and retry time rather than requesting a new key. Invalid credentials/model configuration still require Admin attention, and changing a key/model still disables activation until verified.

Network failures and 502/503/504 get one bounded retry within a shared 30-second deadline. Provider Retry-After is honored. Persistent transient failures use a 30/60/120/240/300-second cooldown (a longer provider Retry-After may extend it, up to one hour). Emails arriving during that cooldown are captured using exact labelled details and routing rules; unclear destinations go to Admin. Successfully processed email tickets are not silently reprocessed or overwritten afterward.

For an enabled, previously verified provider with a due transient warning, the backend performs a small synthetic availability check. This sends no customer email and may use provider credits. It runs separately from Gmail polling, with a lock preventing duplicate recovery checks across server instances. A successful check clears the warning automatically. Healthy/disabled/unverified providers are not polled for recovery. Version guards prevent an old request from marking changed credentials ready.
# AI process history and retention

Open **Audit Logs → AI Logs** as Admin. Choose a calendar date, outcome,
provider or process type, or search by ticket, mailbox, message ID or error.
The list refreshes every 15 seconds. **View details** shows the process ID,
model, timestamps, duration, safe failure reason, HTTP codes and each retry.
Email analysis rows link to the resulting ticket once capture has completed.

Outcomes are success, failed, deferred (provider cooldown/configuration needs
attention) and skipped (existing conversation or already processed email).
A successful provider response does not guarantee a department match: validated
findings and routing rules still determine the final destination, including
Admin review when needed. Replies reuse the existing ticket without AI rerouting.

Connection tests and automatic recovery probes are also recorded. Detailed
history starts with installation of this feature; older request diagnostics
cannot be reconstructed. Keys, prompts, email bodies, extracted personal values
and raw provider responses are not stored in AI logs.

In **Retention Policy**, AI logs have a separate setting, enabled for **30 days**
by default. Admin can choose 1–3650 whole days or disable automatic deletion.
Cleanup runs after startup and every 24 hours. Only expired AI log records are
deleted; original emails, tickets, comments, attachments, thread links and
provider credentials are preserved. Logging failures do not block email capture.
