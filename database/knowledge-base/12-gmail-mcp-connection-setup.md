# Connect Gmail to SERVIT MCP - Complete Google Cloud Setup Guide

This guide connects a Gmail mailbox to SERVIT so incoming customer emails create or update tickets. Complete the steps as a SERVIT Admin. You need access to the Google account that will receive customer emails and permission to configure a Google Cloud project.

## What you are connecting

```text
Customer sends email
        |
        v
Connected support Gmail mailbox
        |
        v
SERVIT reads new emails through the Gmail API
        |
        v
MCP processes the Message ID and Thread ID
        |
        +-- Known Message ID: skip duplicate
        +-- Known Thread ID: update the linked ticket
        +-- New Thread ID: create a System ticket
                              |
                              +-- Clear department match: Unassigned in that team
                              +-- Unclear match: assigned to Admin for routing
```

Gmail authorization, MCP readiness and AI readiness are separate connections. Gmail and MCP can work with department findings while AI is disabled. No acknowledgement email is sent to the customer.

## The three setup cards

The MCP Server page shows **MCP server → Gmail mailbox → AI routing**. Click a card to show only that step's settings.

For a new installation, complete the MCP server card first: enable MCP, save/generate its integration credential, register the support mailbox address, then click **Check connection & continue**. This unlocks the Gmail card. After Gmail authorization succeeds, the AI routing card unlocks. Existing successful connections unlock the appropriate cards automatically.

Saved secrets appear as dots. **Copy** retrieves the saved credential for Admin; **Replace** opens an empty replacement field. Keeping a saved key leaves it unchanged. Disconnect Gmail and Disable AI routing are red actions. A successful connection displays a success notification and updates the setup card.

## 1. Choose the support mailbox

1. Choose a Gmail account, for example `servit.support@gmail.com`. For testing, an existing personal Gmail account is enough. SERVIT does not create the Google account.
2. Make sure you can sign in to that Gmail account and receive messages.
3. Use a second email account to send the test emails later.
4. For company use, ask your Google Workspace administrator to approve or provide the support mailbox. A Google Group or mailing list is not itself the Gmail user account to authorize; connect the actual mailbox receiving the messages.

## 2. Open Google Cloud Console and create a project

1. Open [Google Cloud Console](https://console.cloud.google.com/) and sign in.
2. Click the project selector near the Google Cloud logo.
3. Click **New Project**. You can also use **Menu → IAM & Admin → Create a Project**.
4. Enter a name such as **SERVIT Test**.
5. Select the organization/location if your company requires one. Personal accounts may show **No organization**.
6. Click **Create**, wait for completion, then select the new project.

Keep this same project selected for the following Google Cloud steps.

## 3. Enable Gmail API

1. Open **Menu → APIs & Services → Library**.
2. Search for **Gmail API**.
3. Select **Gmail API** by Google. Do not choose Gmail Postmaster Tools API or a search suggestion for Gmail MCP API.
4. Click **Enable**.
5. Confirm the API page shows **Enabled**. If it shows **Disable API**, Gmail API is already enabled.

## 4. Create the OAuth consent screen

1. Open **APIs & Services → OAuth consent screen**. Google may open **Google Auth Platform**.
2. If this is the first setup, click **Get started**.
3. Set the app name to **SERVIT Test** and choose a user support email.
4. For a personal Gmail test, choose **External** as the audience. Choose **Internal** only if your eligible Google Workspace organization supports it and the connecting accounts belong to that organization.
5. Provide the requested contact email, accept the required terms, and click **Create** or finish the setup wizard.
6. Confirm that the OAuth overview appears. Branding, Audience, Clients and Data Access should now be available.

## 5. Add the test mailbox as a test user

For an External application in Testing:

1. Open **Google Auth Platform → Audience**.
2. Find **Test users** and click **Add users**.
3. Enter the exact support Gmail account chosen in step 1.
4. Click **Save**.

This must be the Google account you will authorize in SERVIT. The separate account sending customer test emails does not need to authorize SERVIT.

## 6. Add read-only Gmail access

1. Open **Google Auth Platform → Data Access**.
2. Click **Add or remove scopes**.
3. Search for Gmail read-only access, or add this scope manually:

   `https://www.googleapis.com/auth/gmail.readonly`

4. Add/select the scope and click **Update**, then **Save** if shown.
5. Confirm that `gmail.readonly` appears in the saved scopes. It may appear under **Your restricted scopes → Gmail scopes**; that is expected for this scope.

This connection reads emails and attachments. It does not require Gmail send, modify or delete permissions.

## 7. Copy the redirect URI from SERVIT

1. Open SERVIT and sign in as Admin.
2. Open **MCP Server** in the Admin menu and select the **Gmail mailbox** card after completing the MCP server step.
3. Find **Gmail connection → Authorized redirect URI — copy exactly into Google Cloud**.
4. Copy the complete displayed value. For our local setup it is:

   `http://localhost:5173/api/config/admin/mcp/gmail/callback`

5. Keep SERVIT open using that same address origin: `http://localhost:5173` for the example above.

**Use the value displayed by your installation.** Do not switch between `localhost` and `127.0.0.1`. They use different browser sessions even when both open the same local application. The protocol, hostname, port and callback path must match exactly.

## 8. Create the OAuth client

1. Return to the same Google Cloud project.
2. Open **Google Auth Platform → Clients → Create client**. The overview may instead show **Create OAuth client**.
3. Choose **Web application** as the application type.
4. Enter a name such as **SERVIT Local Test**.
5. Leave **Authorized JavaScript origins** empty for this server-side authorization flow.
6. Under **Authorized redirect URIs**, click **Add URI** and paste the exact URI copied from SERVIT.
7. Click **Create**.
8. Keep the **Client ID** and **Client Secret** available to enter in SERVIT. Enter secrets only in the portal; do not put them in a Knowledge Base article, chat or screenshot.

## 9. Save Google settings in SERVIT

1. Return to **Admin → MCP Server → Gmail connection**.
2. Enter the Google Client ID.
3. Enter the Google Client Secret.
4. Click **Save Google settings** and wait for success.

When editing later, a blank secret keeps the saved secret. Changing saved credentials requires reconnecting existing mailbox authorizations; it does not delete their tickets or processing history.

## 10. Add the mailbox and department findings

1. On the **MCP server** card, find **Configured mailboxes**. If the address is already registered, select it to edit; otherwise click **Add mailbox**.
2. Enter the exact support Gmail address from step 1.
3. Keep the mailbox active.
4. For a simple setup, leave **Advanced settings** closed. It accepts all sender domains and allows routing to all active departments by default. Existing mailbox restrictions are preserved when editing.
5. If needed, open **Advanced settings** to restrict sender domains or routing departments.
6. No default ticket fields are required or shown. AI extracts supported information from the email; missing information stays empty and shows **Details incomplete**. Older saved defaults are no longer applied to new email tickets.
7. Click **Save mailbox** and confirm that the mailbox appears in the list.
8. For predictable test routing, open **Departments → your test department or sub department → Department findings → Add findings**.
9. Add a specific test sender address or reference, for example `customer@example.com, Dell storage`, and click **Save Findings**. Use your real test sender address when testing.

If the findings or AI cannot identify a clear destination, SERVIT creates the ticket for Admin review instead of guessing a department. A known department with no sub department is a valid department-only destination.

## 11. Enable and check MCP

1. In **Server settings**, select **Enable MCP server**.
2. If no integration credential has been configured, select **Generate a new integration credential**, then click **Save server settings**. The saved integration credential appears masked. Use **Copy** beside it to copy the value as Admin.
3. If a credential is already configured, keep it unless you intend to replace it. Its value remains masked and can be copied by Admin. Replacing it requires updating any external integrations using the old credential.
4. Click **Check connection & continue** (or **Verify & continue to Gmail** for an existing connection).
5. Confirm the success message **MCP connected and ready. Gmail connection status is shown separately.** The MCP card should show **Connected and ready**.

MCP's green status does not authorize Gmail. Complete the next step as well.

## 12. Connect the Gmail account

1. Select the **Gmail mailbox** card. Under Gmail connection, select your saved **Support mailbox**.
2. Leave **Start processing from** empty for the first test. This starts with messages received after you click Connect. Selecting an earlier date intentionally imports matching older received emails.
3. Click **Connect Gmail**.
4. On Google's sign-in page, choose the exact support mailbox account. Sign in only on Google's page.
5. Review the app name and requested read-only Gmail permission, then approve it. If Google shows a testing/unverified warning for your own configured test app, verify that it is your project and the intended read-only permission before continuing through any available test-app option. A company policy block requires your Workspace administrator.
6. Google returns you to SERVIT.
7. Confirm the message **Gmail connected. New emails will be processed automatically.** The Gmail mailbox card should show **Connected**.
8. Click **Check Gmail** to verify access and **Sync now** to start an immediate check.

Keep the SERVIT backend running. Automatic checks run about every 30 seconds. This version uses polling; you do not need to configure Pub/Sub or a public email webhook.

## 13. Understand the three status cards

| Card | Successful state | Meaning |
| --- | --- | --- |
| MCP server | Connected and ready | SERVIT can use the email-processing tools |
| Gmail mailbox | Connected | The support mailbox has authorized Gmail access |
| AI routing | Connected/enabled for a checked provider | Optional AI analysis has been configured separately |

AI may remain disabled during your first Gmail test. Findings and description rules still work. AI provider API credentials are separate from Google Gmail OAuth credentials.

## 14. Test a new email

1. From your second email account, send a new email **to the connected support mailbox** after connecting it.
2. Use a subject such as **[SERVIT TEST 001] Dell storage issue**.
3. Write a body such as **Dell storage is slow. Please investigate this test issue.** Include a reference matching the findings created earlier.
4. Wait about 30 seconds or click **Sync now**.
5. In **Recent email processing**, find the email and open its ticket.
6. Confirm the creator is **System**, the status is **New**, and the matched department/sub department is correct. A clearly routed new ticket is **Unassigned** so the team can take it.
7. Missing business fields should stay empty and show **Details incomplete**.
8. If no clear destination was found, confirm **Needs routing** and assignment to an active **Admin**. When several Admins exist, SERVIT selects the earliest-created active Admin, using the user ID to break a tie. If none is available, the ticket remains safely in the Admin Needs routing queue.

## 15. Test replies and duplicate protection

| Test | Expected result |
| --- | --- |
| Reply to the original email conversation | A comment is added to the same ticket; no second ticket |
| Reply without repeating the customer's case number | Same ticket, because the Gmail Thread ID is the same |
| Close the ticket, then send a reply | Same ticket becomes In Progress and keeps its assignee |
| Reply while the ticket is already In Progress | New comment and unread notification; status stays In Progress |
| Check/sync an already processed message again | No duplicate ticket or comment |
| Compose a new conversation with the same customer case number | New ticket, because it is a new Thread ID |

Make sure replies are addressed to the connected support mailbox. If replying from your Sent folder, check the **To** field; a reply addressed only to yourself will not reach the support mailbox.

Every newly processed incoming email makes the ticket unread for its eligible inbox recipients. Bell and My Query use the same ticket unread state. Opening that ticket clears both for that user; opening only the list does not. Several unseen replies on one ticket still count as one unread ticket.

Comments show the latest reply text. Older imported emails remain in earlier comments. **Open Original Email** requires access to the connected Gmail mailbox; SERVIT access alone cannot provide Gmail access.

## 16. How Admin handles an unclear destination

1. Admin opens the assigned ticket from the bell, My Query, My Tickets, or the Admin **Needs routing** ticket view.
2. Admin reads the email and clicks **Edit**.
3. Admin selects the correct department. Use **Other departments** when the destination is outside the normally listed teams, then select the destination in the new field.
4. Select a sub department if appropriate.
5. Choose **Unassigned** for the destination team to pick up, or select an eligible person from the destination's Assign to list.
6. Add the required work note explaining the transfer and click **Save Changes**.
7. The ticket leaves Needs routing once a department is selected. Other missing fields can still show Details incomplete until filled.

The ticket number, email conversation link, comments, attachments and activity history remain on the same ticket.

## 17. Common problems and fixes

| Problem | What to check |
| --- | --- |
| Message says to open SERVIT using the application address in the redirect URI | Use the displayed origin throughout, for example `localhost`, not `127.0.0.1`. Sign in as Admin there and start Connect Gmail again |
| Google shows redirect_uri_mismatch | Copy the portal's complete callback URI into the correct Google OAuth Web application client; check protocol, host, port and path |
| Google rejects the test account | Add the support account under Audience → Test users; connect the same account saved as the mailbox |
| Gmail API is disabled | Enable Gmail API in the same project that owns the OAuth client |
| Saved settings but Gmail is not connected | Saving a Client ID/Secret is only setup; complete Connect Gmail and Google's permission screen |
| Connected but no ticket | Send a new email from another account after connection, check recipient and sender-domain rules, click Sync now, and inspect Recent email processing |
| Ticket has Needs routing | Check department findings and mailbox scope; Admin can transfer the ticket after reading it |
| Ticket shows Details incomplete | Open Edit and fill missing information when available; values are not invented |
| Recent processing shows Failed or Needs review | Read the error, correct the cause, then use Retry email and Sync now where available. A processed email is not retried as a new ticket |
| Gmail says Reconnect required | Connect the same mailbox again. Testing grants can expire; reconnecting preserves existing ticket links and history |
| Connection attempt expired or session was lost | Return to the correct SERVIT origin, sign in as Admin, and start a fresh Connect Gmail attempt |

## 18. When hosting SERVIT on a server

1. Choose the public HTTPS application address, for example `https://servit.example.com`.
2. Have the server administrator set SERVIT's `CLIENT_URL` to that address and restart the backend. Serve the portal and its `/api` routes through the intended public address.
3. Open that address and copy the newly displayed Authorized redirect URI. Example:

   `https://servit.example.com/api/config/admin/mcp/gmail/callback`

4. Add that exact URI to the OAuth client's Authorized redirect URIs in Google Cloud. SERVIT cannot register it in Google Cloud automatically.
5. Save the appropriate Google settings and reconnect the mailbox from the hosted portal.
6. Keep the database and encryption key backed up together so stored connection credentials remain usable.

For an External app in Testing with Gmail access, Google's refresh token normally expires after seven days. For ongoing company use, follow the suitable Google Internal or Production publishing and verification process. Simply hosting SERVIT does not change Google authorization requirements.

## Google reference guides

- [Create a Google Cloud project](https://developers.google.com/workspace/guides/create-project)
- [Enable Google Workspace APIs](https://developers.google.com/workspace/guides/enable-apis)
- [Configure OAuth consent and scopes](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Web-server OAuth and redirect URIs](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Gmail scope descriptions](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [OAuth refresh token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)
