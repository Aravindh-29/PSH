# Email Configuration Guide
### Pure Storage Horizon — Internal Ticketing System

---

> **Who is this guide for?**
> Anyone who needs to set up email notifications in PSH. No technical background needed. Follow each step exactly and you will have email notifications working.

---

## Table of Contents

1. [What is Email Configuration?](#1-what-is-email-configuration)
2. [What You Need Before You Start](#2-what-you-need-before-you-start)
3. [How to Open Email Configuration](#3-how-to-open-email-configuration)
4. [Understanding Every Field on the Page](#4-understanding-every-field-on-the-page)
5. [Setup Guide — Microsoft Office 365 / Outlook (Company Email)](#5-setup-guide--microsoft-office-365--outlook-company-email)
6. [Setup Guide — Gmail](#6-setup-guide--gmail)
7. [Setup Guide — Any Other SMTP Server](#7-setup-guide--any-other-smtp-server)
8. [How to Send a Test Email](#8-how-to-send-a-test-email)
9. [How to Enable Email Notifications](#9-how-to-enable-email-notifications)
10. [What Emails Are Sent and When](#10-what-emails-are-sent-and-when)
11. [Common Problems and Fixes](#11-common-problems-and-fixes)

---

## 1. What is Email Configuration?

When someone creates a ticket, assigns it, changes its status, or adds a comment — the system can **automatically send an email** to the right person to inform them.

For example:
- A ticket is assigned to Bob → Bob gets an email saying "A ticket has been assigned to you"
- Alice changes a ticket status to RESOLVED → The ticket creator gets an email
- Someone adds a comment → The other person on the ticket gets an email

**This does not happen by default.** You need to tell the system *which email server to use* to send those emails. That is what Email Configuration is for.

Think of it like this: your ticketing system needs to borrow an email account (like your company's Outlook account) to send messages. You give it the details of that account, and from that point on it automatically sends emails for every action.

---

## 2. What You Need Before You Start

Before you open the settings page, collect the following information. You will need it during setup.

### If using Microsoft Office 365 (Company Outlook):

| What you need | Where to get it |
|---|---|
| A company email address to use for sending | Ask your IT/admin team. Example: `notifications@yourcompany.com` |
| The password or App Password for that email | Ask your IT/admin team or create one (steps below) |
| Confirmation that SMTP AUTH is enabled | Ask your IT/admin team to enable SMTP AUTH for that mailbox |

### If using Gmail:

| What you need | Where to get it |
|---|---|
| A Gmail address | You already have one or create a new one |
| A Gmail App Password | You will create this in step 6 of this guide |
| 2-Step Verification must be ON | Required to create an App Password |

### For any SMTP server:

| What you need | Example |
|---|---|
| SMTP Host (server address) | `smtp.office365.com` or `smtp.gmail.com` |
| SMTP Port number | Usually `587` |
| Your email username | `notifications@company.com` |
| Your email password | Your email password |

> **IMPORTANT:** Do NOT use your personal email or admin email for sending. Always use a dedicated shared email like `no-reply@company.com` or `notifications@company.com`. Ask your IT team to create one if needed.

---

## 3. How to Open Email Configuration

**Step 1.** Open your browser and go to:
```
http://localhost:5173
```
(or whatever URL your PSH system runs on)

**Step 2.** Log in with your **admin account**.
- Username: `admin` (or your admin username)
- Password: your admin password

**Step 3.** Look at the left sidebar (the menu on the left side of the screen).

**Step 4.** Scroll down in the sidebar until you see the **Admin** section.

**Step 5.** Click on **"Email Config"** (it has a mail/envelope icon next to it).

You are now on the Email Configuration page. It looks like this:

```
┌─────────────────────────────────────────────────────────────┐
│  Email Configuration                          [ Disabled ▼] │
│  Configure SMTP to enable email notifications...            │
├─────────────────────────────────────────────────────────────┤
│  Quick Setup                                                │
│  [ Office 365 ] [ Outlook.com ] [ Gmail ] [ Generic SMTP ] │
├─────────────────────────────────────────────────────────────┤
│  SMTP Server                                                │
│  SMTP Host: [                    ]  Port: [ 587 ]          │
│  Encryption: [ TLS (STARTTLS) ▼ ]                          │
├─────────────────────────────────────────────────────────────┤
│  Authentication                                             │
│  Username: [                    ]                           │
│  Password: [                    ] 👁                        │
├─────────────────────────────────────────────────────────────┤
│  Sender Identity                                            │
│  From Name: [PSH Notifications  ]                           │
│  From Email:[                   ]                           │
├─────────────────────────────────────────────────────────────┤
│  Test Connection                                            │
│  [  recipient@company.com       ] [ Send Test Email ]       │
├─────────────────────────────────────────────────────────────┤
│  Email Triggers  (what emails are sent and to whom)         │
├─────────────────────────────────────────────────────────────┤
│                              [ Save Configuration ]         │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Understanding Every Field on the Page

This section explains what every single input box and button does. Read this before you start filling in values.

---

### Enable / Disable Toggle (top right corner)

```
[ Disabled ]   ←── currently off
[ Enabled  ]   ←── turned on
```

- This is the **master switch** for all email notifications.
- When it says **Disabled** — no emails will be sent even if you save SMTP settings.
- When it says **Enabled** — emails will start going out for every ticket action.
- You should configure and test everything first, then turn this ON at the end.

---

### Quick Setup (Office 365 / Outlook.com / Gmail / Generic SMTP)

These are **preset buttons** that automatically fill in the SMTP Host, Port, and Encryption for you.

- **Office 365** — For company Microsoft 365 / Outlook accounts (e.g. your work email). Fills in `smtp.office365.com`, port `587`, TLS.
- **Outlook.com** — For personal Outlook/Hotmail accounts. Fills in `smtp-mail.outlook.com`, port `587`, TLS.
- **Gmail** — For Google Gmail accounts. Fills in `smtp.gmail.com`, port `587`, TLS.
- **Generic SMTP** — Leaves the host blank. Fill it manually if you have a custom mail server.

> **TIP:** Click the preset that matches your email provider first. It will auto-fill the SMTP section for you. Then you only need to fill in your username and password.

---

### SMTP Server Section

#### SMTP Host
- **What it is:** The address of the email server that will send the emails.
- **Example values:**
  - Office 365: `smtp.office365.com`
  - Gmail: `smtp.gmail.com`
  - Outlook personal: `smtp-mail.outlook.com`
- **How to get it:** Click one of the preset buttons — it fills automatically. Or ask your IT team.

#### Port
- **What it is:** A number that tells the system which "door" to knock on when connecting to the email server.
- **Common values:**
  - `587` — Used for TLS (most common, recommended)
  - `465` — Used for SSL
  - `25` — Old, usually blocked by companies
- **Recommendation:** Leave it as `587` unless your IT team says otherwise.

#### Encryption
- **What it is:** How the connection to the email server is secured.
- **Options:**
  - **TLS (STARTTLS)** — Most modern and recommended. Use this for Office 365, Gmail.
  - **SSL** — Older method, used with port 465.
  - **None** — No security. Only use on private internal servers.
- **Recommendation:** Choose **TLS (STARTTLS)** for all company and public email providers.

---

### Authentication Section

#### Username / Email
- **What it is:** The email address that the system logs in with to send emails.
- **Example:** `notifications@yourcompany.com`
- **Important:** This must be a real, working email address. The system uses this to log in to the email server.

#### Password / App Password
- **What it is:** The password to log in to that email account.
- **Important for Office 365 / Gmail:** Many companies block regular passwords for SMTP access. You will need to create an **App Password** instead (see steps 5 and 6 below).
- The eye icon (👁) next to the field lets you show or hide what you typed.
- Once you save, the password is hidden and shows as `••••••••` for security. You can change it any time by typing a new password.

> **Note:** If you see `••••••••` in the password field when you come back to this page — that means a password is already saved. Leave it as is if you don't want to change it. Type a new password only if you want to update it.

---

### Sender Identity Section

#### From Name
- **What it is:** The name that appears in the "From" field when users receive an email.
- **Example:** If you set `PSH Notifications`, users will see: `PSH Notifications <no-reply@company.com>`
- **Recommendation:** Use something like `Pure Storage Horizon` or `PSH Notifications` so users immediately know where the email is from.

#### From Email
- **What it is:** The email address that appears as the sender.
- **Example:** `no-reply@yourcompany.com`
- **Important:** This should match or be allowed by your SMTP username. Some email providers (like Gmail) force the From Email to be the same as the username.

---

### Test Connection Section

#### Test Email Recipient
- **What it is:** The email address that will receive the test email when you click the test button.
- **Leave it blank** to send the test to your SMTP username (the email you configured above).
- Or type any email address to send the test there — for example, your personal email.

#### Send Test Email Button
- **What it does:** Connects to the SMTP server using your settings and sends a real test email.
- If it works, you will see a **green success message**.
- If it fails, you will see a **red error message** explaining what went wrong.
- Always do this before enabling notifications.

---

### Email Triggers Section (Read-only info table)

This section does not have inputs. It just shows you **what actions send emails and to whom**. You cannot change these — they are built in.

| Ticket Action | Who Receives the Email |
|---|---|
| Ticket Created & Assigned | The person it is assigned to |
| Ticket Reassigned to someone | The new assignee |
| Status Changed | Both the creator and the assignee |
| Ticket Resolved or Closed | Both the creator and the assignee |
| Comment Added | The other person (not the one who wrote it) |
| Work Note Added | The other person (not the one who wrote it) |

---

### Save Configuration Button

- Saves all your settings to the database.
- You must click this after filling in the form, even after making small changes.
- The toggle (Enabled/Disabled) is also saved when you click this button.

---

## 5. Setup Guide — Microsoft Office 365 / Outlook (Company Email)

Follow these steps exactly if your company uses Microsoft 365 email (Outlook).

### Part A — Enable SMTP AUTH for the mailbox (IT Admin Task)

This must be done by someone who has access to the Microsoft 365 Admin Centre. If you are the IT admin, do this. Otherwise, ask your IT team to do it.

**Step 1.** Go to [https://admin.microsoft.com](https://admin.microsoft.com) and sign in with your Microsoft 365 admin account.

**Step 2.** In the left menu, click **Users** → **Active Users**.

**Step 3.** Find and click on the email account you want to use for sending (e.g. `notifications@yourcompany.com`). Click on it.

**Step 4.** In the panel that opens on the right, click the **Mail** tab.

**Step 5.** Scroll down and click **Manage email apps**.

**Step 6.** Make sure **Authenticated SMTP** checkbox is ticked (turned on).

**Step 7.** Click **Save changes**.

> If you skip this step, the test email will fail with an "authentication failed" or "5.7.57" error.

---

### Part B — Fill in the Email Config Page

**Step 1.** Go to Admin → Email Config in PSH.

**Step 2.** Click the **"Office 365"** preset button. The SMTP Host, Port, and Encryption will be filled automatically:
- SMTP Host: `smtp.office365.com`
- Port: `587`
- Encryption: `TLS (STARTTLS)`

**Step 3.** In the **Username / Email** field, type the full email address:
```
notifications@yourcompany.com
```
(Replace with your actual email)

**Step 4.** In the **Password** field, type the password for that email account.

> **If Multi-Factor Authentication (MFA) is enabled** on that account, a regular password will not work. You will need to create an App Password:
>
> 1. Sign in to [https://myaccount.microsoft.com](https://myaccount.microsoft.com) with that email.
> 2. Click **Security info** on the left.
> 3. Click **+ Add sign-in method**.
> 4. Select **App password** from the dropdown and click **Add**.
> 5. Give it a name like `PSH Notifications`.
> 6. Copy the generated password (it looks like: `abcd efgh ijkl mnop`).
> 7. Paste that into the Password field in PSH Email Config.

**Step 5.** In **From Name**, type:
```
PSH Notifications
```
(or whatever name you want users to see)

**Step 6.** In **From Email**, type the same email address you used for Username:
```
notifications@yourcompany.com
```

**Step 7.** You are ready to test. Go to [Section 8 — How to Send a Test Email](#8-how-to-send-a-test-email).

---

## 6. Setup Guide — Gmail

Follow these steps if you want to use a Gmail account to send notifications.

> **Note:** Google has blocked "less secure apps" since 2022. You MUST use an App Password. A regular Gmail password will not work.

### Part A — Create a Gmail App Password

**Step 1.** Open a browser and go to [https://myaccount.google.com](https://myaccount.google.com).

**Step 2.** Sign in with the Gmail account you want to use.

**Step 3.** In the left menu, click **Security**.

**Step 4.** Scroll down and look for **"2-Step Verification"**. If it says "Off", you must turn it on first:
- Click on it.
- Follow the steps to enable 2-Step Verification using your phone.
- Come back to this page after enabling it.

**Step 5.** In the Security page, scroll down and look for **"App passwords"**. Click on it.
- If you don't see App passwords, search for it in the search bar at the top of myaccount.google.com.

**Step 6.** You will see a dropdown. Under "Select app", choose **"Mail"**.

**Step 7.** Under "Select device", choose **"Other (Custom name)"**.

**Step 8.** Type a name like `PSH Ticketing` and click **Generate**.

**Step 9.** Google will show you a **16-character password** like: `abcd efgh ijkl mnop`. Copy this entire password (spaces included or without spaces — both work).

**Step 10.** Click **Done**.

> Store this password safely. Google will not show it again. If you lose it, you will need to generate a new one.

---

### Part B — Fill in the Email Config Page

**Step 1.** Go to Admin → Email Config in PSH.

**Step 2.** Click the **"Gmail"** preset button. This fills in:
- SMTP Host: `smtp.gmail.com`
- Port: `587`
- Encryption: `TLS (STARTTLS)`

**Step 3.** In **Username / Email**, type your full Gmail address:
```
yourname@gmail.com
```

**Step 4.** In **Password**, paste the **16-character App Password** you got in Part A.
- Remove the spaces if any (type it as one string like `abcdefghijklmnop`)

**Step 5.** In **From Name**, type:
```
PSH Notifications
```

**Step 6.** In **From Email**, type the same Gmail address:
```
yourname@gmail.com
```
(Gmail requires the From Email to be the same as the logged-in account)

**Step 7.** You are ready to test. Go to [Section 8 — How to Send a Test Email](#8-how-to-send-a-test-email).

---

## 7. Setup Guide — Any Other SMTP Server

If your company has its own mail server (not Office 365 or Gmail), use these steps.

**Step 1.** Ask your IT team or email provider for these details:
- SMTP Host (e.g. `mail.yourcompany.com`)
- SMTP Port (usually `587` or `465`)
- Encryption type (TLS or SSL)
- Username (your email address)
- Password

**Step 2.** Go to Admin → Email Config in PSH.

**Step 3.** Click **"Generic SMTP"** preset button (this just sets port to 587 and encryption to TLS — you still fill the host manually).

**Step 4.** In **SMTP Host**, type the server address your IT team gave you:
```
mail.yourcompany.com
```

**Step 5.** In **Port**, type the port number (usually `587`).

**Step 6.** In **Encryption**, choose:
- `TLS (STARTTLS)` if port is 587
- `SSL` if port is 465
- `None` only if your IT team says so (not recommended)

**Step 7.** In **Username / Email**, type your email address.

**Step 8.** In **Password**, type your password.

**Step 9.** In **From Name** and **From Email**, fill in as described in Section 4.

**Step 10.** Go to [Section 8 — How to Send a Test Email](#8-how-to-send-a-test-email).

---

## 8. How to Send a Test Email

This is the most important step. Always send a test email before enabling notifications. This confirms your settings are correct.

**Step 1.** Fill in all the SMTP fields as described in the section above (Section 5, 6, or 7 depending on your email provider).

**Step 2.** Scroll down to the **"Test Connection"** section on the Email Config page.

**Step 3.** In the email input box, type the email address where you want to receive the test:
```
your.personal.email@gmail.com
```
Or leave it blank — it will send to the SMTP username you configured.

**Step 4.** Click the **"Send Test Email"** button.

**Step 5.** Wait 5–10 seconds. One of two things will happen:

#### If it works — GREEN success message:
```
✓ Test email sent to your.email@company.com
```
- Check your inbox. You should receive an email with subject "Test Email — Pure Storage Horizon"
- If you see the green message but no email in inbox, check your Spam/Junk folder
- Once you confirm the email arrived, go to [Section 9](#9-how-to-enable-email-notifications)

#### If it fails — RED error message:
```
✗ Invalid login credentials
```
or
```
✗ Connection refused
```
- Read [Section 11 — Common Problems and Fixes](#11-common-problems-and-fixes) to fix the error
- After fixing, try the test again

**Step 6.** Do NOT click Save Configuration yet. Only save after the test is successful.

---

## 9. How to Enable Email Notifications

Once your test email is successful, follow these steps to turn on email notifications for all users.

**Step 1.** On the Email Config page, look at the **top-right corner**.

**Step 2.** You will see a toggle that says **"Disabled"**. Click it.

**Step 3.** It should now say **"Enabled"** and the toggle background turns orange.

**Step 4.** Click the **"Save Configuration"** button at the bottom of the page.

**Step 5.** You will see a green toast message: **"Email configuration saved"**.

Email notifications are now live. From this moment, every ticket action (create, assign, status change, comment, resolve) will send an automatic email to the relevant users.

---

### How to Turn Off Email Notifications

If you ever need to stop emails (for maintenance or testing):

**Step 1.** Go to Admin → Email Config.

**Step 2.** Click the **"Enabled"** toggle so it changes back to **"Disabled"**.

**Step 3.** Click **"Save Configuration"**.

Emails will stop immediately. Your SMTP settings are still saved — just turn the toggle back on when you are ready.

---

## 10. What Emails Are Sent and When

Once enabled, the system automatically sends emails for the following actions. You do not need to do anything — it happens automatically.

---

### 1. Ticket Created and Assigned

**When:** Someone creates a new ticket AND assigns it to a person at the same time.

**Who gets the email:** The person the ticket is assigned to (the assignee).

**Subject line:** `[PSH000001] New ticket assigned to you`

**Email contains:** Ticket ID, subject, customer name, priority, status, who created it, and a "View Ticket" button.

---

### 2. Ticket Reassigned to Someone

**When:** An existing ticket's "Assigned To" field is changed to a different person.

**Who gets the email:** The new assignee.

**Subject line:** `[PSH000001] Ticket assigned to you by Alice Johnson`

**Email contains:** Ticket details and a "View Ticket" button.

---

### 3. Ticket Status Changed

**When:** The status of a ticket is changed (e.g. NEW → IN PROGRESS, or OPEN → PENDING).

**Who gets the email:** Both the ticket creator AND the assignee.

**Subject line:** `[PSH000001] Status changed to IN_PROGRESS`

**Email contains:** What the old status was, what the new status is (shown as a clear before → after), and a "View Ticket" button.

---

### 4. Ticket Resolved or Closed

**When:** Status is changed to RESOLVED or CLOSED.

**Who gets the email:** Both the ticket creator AND the assignee.

**Subject line:** `[PSH000001] Ticket has been resolved`

**Email contains:** Ticket details, who resolved it, and a "View Ticket" button.

---

### 5. Comment Added to a Ticket

**When:** Someone adds a regular Comment on a ticket.

**Who gets the email:** The other person on the ticket (if the creator comments, the assignee gets the email; if the assignee comments, the creator gets the email). The person who wrote the comment does NOT get an email about their own comment.

**Subject line:** `[PSH000001] New comment from Alice Johnson`

**Email contains:** The full comment text and a "View Ticket" button.

---

### 6. Work Note Added to a Ticket

**When:** Someone adds a Work Note (internal note) on a ticket.

**Who gets the email:** Same as comments — the other person on the ticket.

**Subject line:** `[PSH000001] New work note from Alice Johnson`

**Email contains:** The work note text and a "View Ticket" button.

---

### Emails that are NOT sent

- Attachments uploaded or removed (no email)
- Ticket deleted (no email)
- Admin actions like bulk upload (no email)
- Password changes or login activity (no email)

---

## 11. Common Problems and Fixes

---

### Problem: "Invalid login credentials" or "Authentication failed"

**Cause:** The username or password is wrong.

**Fix:**
1. Double-check the email address in the Username field — make sure there are no extra spaces.
2. Re-type the password carefully. If using an App Password, paste it fresh from where you generated it.
3. For Office 365 — check that SMTP AUTH is enabled for that mailbox (see Section 5 Part A).
4. For Gmail — make sure you are using an App Password, not your regular Gmail password.

---

### Problem: "5.7.57 SMTP; Client was not authenticated" (Office 365 specific)

**Cause:** SMTP AUTH is not enabled for the mailbox in Microsoft 365.

**Fix:** Follow Section 5 Part A exactly. Ask your Microsoft 365 admin to enable SMTP AUTH for the mailbox. This must be done in the Microsoft 365 Admin Centre, not inside PSH.

---

### Problem: "Connection refused" or "Connection timeout"

**Cause:** The SMTP Host or Port is wrong, or a firewall is blocking the connection.

**Fix:**
1. Make sure SMTP Host is exactly correct (no typos, no `http://` prefix — just the hostname like `smtp.office365.com`).
2. Make sure Port is `587` for TLS or `465` for SSL.
3. Contact your IT team — they may have a firewall rule blocking outbound SMTP connections from the server.

---

### Problem: "Self-signed certificate" or "SSL error"

**Cause:** The encryption setting doesn't match what the server expects.

**Fix:**
1. Try changing Encryption to `TLS (STARTTLS)` and Port to `587`.
2. If that doesn't work, try `SSL` with Port `465`.
3. If still failing, try `None` temporarily just to test — but re-enable TLS after confirming it works.

---

### Problem: Test email shows success but email never arrives in inbox

**Cause:** The email was sent successfully but ended up in Spam/Junk folder.

**Fix:**
1. Check your Spam or Junk folder.
2. Mark the email as "Not Spam" so future emails go to inbox.
3. Ask your IT team to whitelist the From Email address so it doesn't get filtered.

---

### Problem: I saved the config but forgot to enable it. No emails are going out.

**Fix:**
1. Go to Admin → Email Config.
2. Check the toggle in the top-right corner. If it says **"Disabled"**, click it to enable.
3. Click **"Save Configuration"**.

---

### Problem: I want to update the password but the field shows `••••••••`

**Explanation:** This is normal. The password is hidden for security after you save it.

**Fix:** Simply type your new password in that field — it will overwrite the old saved password when you click Save Configuration.

---

### Problem: The From Email shows a different address than what I configured

**Cause:** Some providers (especially Gmail) override the From address with the account's real address.

**Fix:** Set the **From Email** to the same address as the **Username**. Gmail does not allow you to send "as" a different address unless you have configured it in Gmail settings.

---

## Quick Reference — SMTP Settings by Provider

| Email Provider | SMTP Host | Port | Encryption |
|---|---|---|---|
| Microsoft Office 365 | `smtp.office365.com` | 587 | TLS |
| Outlook.com / Hotmail | `smtp-mail.outlook.com` | 587 | TLS |
| Gmail | `smtp.gmail.com` | 587 | TLS |
| Yahoo Mail | `smtp.mail.yahoo.com` | 587 | TLS |
| Zoho Mail | `smtp.zoho.com` | 587 | TLS |
| Amazon SES (AWS) | `email-smtp.<region>.amazonaws.com` | 587 | TLS |
| Mailgun | `smtp.mailgun.org` | 587 | TLS |
| SendGrid | `smtp.sendgrid.net` | 587 | TLS |

---

## Checklist — Before You Go Live

Use this as a final checklist before enabling email notifications for all users.

- [ ] SMTP Host is filled in correctly
- [ ] Port is `587` (or `465` if using SSL)
- [ ] Encryption is set to `TLS (STARTTLS)`
- [ ] Username is the full email address (no typos)
- [ ] Password is entered (App Password if using Office 365 with MFA or Gmail)
- [ ] From Name is set to something recognisable (e.g. `PSH Notifications`)
- [ ] From Email is filled in
- [ ] Test email was sent and **received successfully** in the inbox
- [ ] Toggle is set to **Enabled**
- [ ] **Save Configuration** button was clicked

Once all boxes are checked — you are done. Email notifications are live.

---

*Document version: 1.0 — Pure Storage Horizon*
*Generated: August 2026*
