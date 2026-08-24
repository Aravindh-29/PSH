# SSO Configuration Guide
### Pure Storage Horizon — Single Sign-On Setup

---

> **Who is this guide for?**
> IT administrators who want to let employees sign in to PSH using their company account (Microsoft, Google, Okta, etc.) instead of a separate username and password.

---

## Table of Contents

1. [What is SSO?](#1-what-is-sso)
2. [How SSO Works in PSH](#2-how-sso-works-in-psh)
3. [What You Need Before You Start](#3-what-you-need-before-you-start)
4. [How to Open SSO Configuration](#4-how-to-open-sso-configuration)
5. [Understanding Every Field on the Page](#5-understanding-every-field-on-the-page)
6. [Setup Guide — Microsoft Azure AD / Entra ID](#6-setup-guide--microsoft-azure-ad--entra-id)
7. [Setup Guide — Google Workspace](#7-setup-guide--google-workspace)
8. [Setup Guide — Okta](#8-setup-guide--okta)
9. [Setup Guide — Auth0](#9-setup-guide--auth0)
10. [How to Test the SSO Connection](#10-how-to-test-the-sso-connection)
11. [How to Enable SSO](#11-how-to-enable-sso)
12. [Auto-Provision Users](#12-auto-provision-users)
13. [Common Problems and Fixes](#13-common-problems-and-fixes)

---

## 1. What is SSO?

SSO stands for **Single Sign-On**. It means users can click one button on the login page and sign in using their existing company account — the same account they use for Outlook, Teams, or Google Workspace — without needing a separate PSH username and password.

**Without SSO:** User types username + password specifically for PSH.

**With SSO:** User clicks "Sign in with Microsoft" (or Google/Okta) → redirected to company login → automatically logged into PSH.

Benefits:
- Users don't need to remember another password
- IT has central control — disabling a user in Azure AD/Google automatically blocks PSH access
- More secure — login is handled by the identity provider, not PSH

---

## 2. How SSO Works in PSH

PSH uses the **OpenID Connect (OIDC)** protocol, which is the standard used by Microsoft, Google, Okta, and Auth0.

The flow is:
1. User clicks "Sign in with [Provider]" on the PSH login page
2. PSH redirects the user to the provider's login page
3. User enters their company credentials on the provider's page
4. Provider confirms authentication and sends user info back to PSH
5. PSH logs the user in

PSH never sees the user's company password — the provider handles all of that.

---

## 3. What You Need Before You Start

Before configuring SSO, you need admin access to your identity provider. You will create an "application" or "client" registration there and get three pieces of information to enter in PSH:

| What you need | Description |
|---|---|
| **Issuer URL** | The address of your identity provider's server |
| **Client ID** | A unique ID assigned to PSH by the provider |
| **Client Secret** | A secret password the provider gives PSH to verify it |

You also need to know the **Redirect URI** — the address the provider sends users back to after login. PSH shows this automatically on the page. You copy it and paste it into the provider's settings.

---

## 4. How to Open SSO Configuration

**Step 1.** Go to your PSH application URL in a browser.

**Step 2.** Log in with your **admin account**.

**Step 3.** In the left sidebar, scroll to the **Admin** section.

**Step 4.** Click **"SSO"** (it has a key icon).

You are now on the SSO Configuration page.

---

## 5. Understanding Every Field on the Page

---

### Status Pill (top right corner)

Shows one of three states:
- **Not Configured** — No SSO settings saved yet
- **Configured — Disabled** — Settings saved but SSO login is turned off
- **Configured & Enabled** — SSO is live, users can sign in with it

---

### Quick Setup Presets

Four buttons: **Microsoft Azure AD**, **Google Workspace**, **Okta**, **Auth0**.

Clicking one automatically fills in the Issuer URL for that provider. You still need to enter your own Client ID and Client Secret.

---

### Provider Display Name

- What users see on the login button. Example: if you type `Microsoft`, the login page shows "Sign in with Microsoft".
- Keep it short and recognisable — `Microsoft`, `Google`, `Okta`.

---

### Issuer URL

- The URL of your identity provider's OpenID Connect server.
- This is filled automatically when you click a preset button.
- **Azure AD example:** `https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0`
- **Google:** `https://accounts.google.com`
- **Okta example:** `https://YOUR_ORG.okta.com/oauth2/default`

---

### Client ID

- A unique identifier that the provider assigns when you register PSH as an application.
- Looks like: `a1b2c3d4-e5f6-7890-abcd-ef1234567890` (Azure) or a long string (Google/Okta).
- You get this from the provider after creating the application — steps in sections 6–9 below.

---

### Client Secret

- A secret key the provider gives PSH to prove its identity during login.
- Once saved, it shows as "Secret saved securely" with a "Change" option.
- The eye icon (👁) lets you show/hide the secret while typing.
- Treat this like a password — never share it.

---

### Redirect URI

- This is the address in PSH that the provider sends users back to after they log in.
- It is **read-only** — PSH fills it in automatically based on your server URL.
- **You must copy this and paste it into your provider's settings** (steps below will tell you where).
- Example: `https://yourcompany.com/api/auth/sso/callback`
- There is a **Copy** button next to it — use that.

---

### Auto-Provision Users

- Toggle switch: ON or OFF.
- **ON:** When a user signs in with SSO for the first time and they don't have a PSH account yet, PSH automatically creates one for them with the Employee role.
- **OFF:** Users must be manually created in PSH before they can sign in with SSO.
- **Recommendation:** Turn this ON for convenience. New employees sign in immediately without admin needing to pre-create accounts.

---

### Enable SSO Toggle

- ON = SSO login button appears on the login page
- OFF = SSO is configured but hidden from users
- You can save your settings with this OFF, test everything, then turn it ON when ready.

---

### Test Connection Button

- Verifies that the Issuer URL is reachable and valid.
- Does NOT do a full login test — it just checks the provider's server responds correctly.
- You should always test before enabling.

---

### Save Configuration Button

- Saves all settings to the database.
- Must be clicked after making any changes.

---

### Clear Configuration Button

- Removes all SSO settings.
- Users will no longer see the SSO login button after clearing.
- A confirmation prompt appears before clearing.

---

## 6. Setup Guide — Microsoft Azure AD / Entra ID

### Part A — Register PSH in Azure

**Step 1.** Go to [https://portal.azure.com](https://portal.azure.com) and sign in with your Microsoft admin account.

**Step 2.** In the search bar at the top, type **"App registrations"** and click it.

**Step 3.** Click **"+ New registration"**.

**Step 4.** Fill in the form:
- **Name:** `Pure Storage Horizon` (or any name you like)
- **Supported account types:** Select "Accounts in this organizational directory only (Single tenant)"
- **Redirect URI:** Select **"Web"** from the dropdown, then paste the Redirect URI from the PSH SSO page (looks like `https://yourcompany.com/api/auth/sso/callback`)

**Step 5.** Click **Register**.

**Step 6.** You are now on the app's overview page. Copy the **Application (client) ID** — this is your **Client ID** for PSH.

**Step 7.** Copy the **Directory (tenant) ID** — you will use this in the Issuer URL.

**Step 8.** In the left menu, click **"Certificates & secrets"**.

**Step 9.** Click **"+ New client secret"**.

**Step 10.** Enter a description like `PSH SSO` and choose an expiry (e.g., 24 months). Click **Add**.

**Step 11.** **IMMEDIATELY copy the secret Value** (the long string). You will not be able to see it again after leaving this page.

---

### Part B — Fill in the PSH SSO Page

**Step 1.** Click the **"Microsoft Azure AD"** preset button. The Issuer URL fills in:
```
https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0
```

**Step 2.** Replace `YOUR_TENANT_ID` in the Issuer URL with the Directory (tenant) ID you copied in Part A Step 7.
Example: `https://login.microsoftonline.com/abc123-def456-789/v2.0`

**Step 3.** In **Provider Display Name**, type: `Microsoft`

**Step 4.** In **Client ID**, paste the Application (client) ID from Step 6.

**Step 5.** In **Client Secret**, paste the secret value from Step 11.

**Step 6.** Test and enable — go to Section 10.

---

## 7. Setup Guide — Google Workspace

### Part A — Register PSH in Google Cloud Console

**Step 1.** Go to [https://console.cloud.google.com](https://console.cloud.google.com) and sign in with your Google Workspace admin account.

**Step 2.** Create a new project (or select an existing one) using the dropdown at the top.

**Step 3.** In the left menu, go to **APIs & Services** → **OAuth consent screen**.

**Step 4.** Choose **"Internal"** (only your organization's users can sign in). Click **Create**.

**Step 5.** Fill in:
- App name: `Pure Storage Horizon`
- User support email: your admin email
- Developer contact: your admin email
- Click **Save and Continue** through the remaining screens.

**Step 6.** In the left menu, go to **APIs & Services** → **Credentials**.

**Step 7.** Click **"+ Create Credentials"** → **"OAuth client ID"**.

**Step 8.** Select **Application type: Web application**.

**Step 9.** Under **"Authorised redirect URIs"**, click **"+ Add URI"** and paste the Redirect URI from PSH.

**Step 10.** Click **Create**.

**Step 11.** A popup shows your **Client ID** and **Client Secret**. Copy both.

---

### Part B — Fill in the PSH SSO Page

**Step 1.** Click the **"Google Workspace"** preset button. Issuer URL fills in: `https://accounts.google.com`

**Step 2.** In **Provider Display Name**, type: `Google`

**Step 3.** In **Client ID**, paste the Client ID from Step 11.

**Step 4.** In **Client Secret**, paste the Client Secret from Step 11.

**Step 5.** Test and enable — go to Section 10.

---

## 8. Setup Guide — Okta

### Part A — Create Application in Okta

**Step 1.** Sign in to your Okta admin dashboard at `https://YOUR_ORG-admin.okta.com`.

**Step 2.** Go to **Applications** → **Applications** in the left menu.

**Step 3.** Click **"Create App Integration"**.

**Step 4.** Select **OIDC — OpenID Connect** and **Web Application**. Click **Next**.

**Step 5.** Fill in:
- App integration name: `Pure Storage Horizon`
- Sign-in redirect URIs: paste the Redirect URI from PSH
- Sign-out redirect URIs: leave blank or your app's homepage

**Step 6.** Under **Assignments**, choose who can access the app (e.g., all users or specific groups).

**Step 7.** Click **Save**.

**Step 8.** On the app settings page, copy the **Client ID** and **Client secret**.

---

### Part B — Fill in the PSH SSO Page

**Step 1.** Click the **"Okta"** preset button. The Issuer URL fills in with a placeholder:
```
https://YOUR_ORG.okta.com/oauth2/default
```

**Step 2.** Replace `YOUR_ORG` with your actual Okta subdomain.

**Step 3.** In **Provider Display Name**, type: `Okta`

**Step 4.** In **Client ID** and **Client Secret**, paste the values from Part A Step 8.

**Step 5.** Test and enable — go to Section 10.

---

## 9. Setup Guide — Auth0

### Part A — Create Application in Auth0

**Step 1.** Sign in to [https://manage.auth0.com](https://manage.auth0.com).

**Step 2.** Go to **Applications** → **Applications** in the left menu.

**Step 3.** Click **"+ Create Application"**.

**Step 4.** Name it `Pure Storage Horizon`, select **"Regular Web Applications"**, click **Create**.

**Step 5.** Go to the **Settings** tab of your new application.

**Step 6.** Under **"Allowed Callback URLs"**, paste the Redirect URI from PSH.

**Step 7.** Scroll down and click **Save Changes**.

**Step 8.** At the top of the Settings page, copy the **Domain**, **Client ID**, and **Client Secret**.

---

### Part B — Fill in the PSH SSO Page

**Step 1.** Click the **"Auth0"** preset button. Issuer URL fills with placeholder:
```
https://YOUR_TENANT.auth0.com
```

**Step 2.** Replace `YOUR_TENANT` with your Auth0 domain from Step 8 (just the subdomain, e.g. `mycompany`).

**Step 3.** In **Provider Display Name**, type: `Auth0`

**Step 4.** In **Client ID** and **Client Secret**, paste from Part A Step 8.

**Step 5.** Test and enable — go to Section 10.

---

## 10. How to Test the SSO Connection

**Step 1.** After filling in all fields, click the **"Test Connection"** button on the SSO page.

**Step 2.** Wait a few seconds. One of two things happens:

**Green success:**
```
✓ Issuer verified — [provider name]
```
This means PSH can reach the provider's server and the Issuer URL is valid. Proceed to Section 11.

**Red error:**
```
✗ Could not reach issuer or invalid OIDC configuration
```
- Check the Issuer URL for typos
- Make sure the tenant ID / org subdomain is replaced correctly
- Verify internet connectivity from the server

> Note: A successful test only verifies the Issuer URL. A full login test requires enabling SSO and testing an actual login in a separate browser tab.

---

## 11. How to Enable SSO

**Step 1.** After a successful test, toggle the **Enable SSO** switch to ON.

**Step 2.** Click **"Save Configuration"**.

**Step 3.** Open a **new private/incognito browser window** and go to the PSH login page.

**Step 4.** You should now see a **"Sign in with [Provider Name]"** button below the regular login form.

**Step 5.** Click it and complete the SSO login flow to confirm it works end-to-end.

> Always test SSO in a separate private window while keeping your admin session open. If SSO fails, you can still log in with your admin username/password.

---

## 12. Auto-Provision Users

When **Auto-Provision Users** is enabled:

- A new PSH employee account is created automatically the first time a user signs in with SSO
- The account gets the **Employee** role by default
- The account uses the name and email from the identity provider
- Admins can later change the role in the Users section

When it is disabled:
- Users must be manually added to PSH by an admin BEFORE they can use SSO
- If a user tries SSO without a PSH account, they get an access denied message

**Recommendation:** Enable auto-provisioning for most deployments.

---

## 13. Common Problems and Fixes

---

### Problem: "Could not reach issuer or invalid OIDC configuration"

**Cause:** The Issuer URL is wrong or unreachable.

**Fix:**
- For Azure AD: Make sure you replaced `YOUR_TENANT_ID` with the actual tenant ID
- For Okta: Make sure you replaced `YOUR_ORG` with the actual subdomain
- For Auth0: Make sure you replaced `YOUR_TENANT` with the actual domain
- Check that the server has internet access

---

### Problem: "redirect_uri_mismatch" error on the provider's login page

**Cause:** The Redirect URI in the provider does not exactly match the one PSH is using.

**Fix:**
- Go back to your provider's app settings
- Find the Redirect URI / Callback URL setting
- Delete the old value and paste the exact Redirect URI shown on the PSH SSO page (use the Copy button)
- Save in the provider and try again

---

### Problem: SSO login succeeds at the provider but fails returning to PSH

**Cause:** The CLIENT_URL in the `.env` file doesn't match the URL you are using to access PSH.

**Fix:**
- Check the `.env` file: `CLIENT_URL=https://yourcompany.com`
- Make sure this matches the URL in your browser exactly (including https vs http)
- Restart the PSH service after changing: `systemctl restart servit`

---

### Problem: "User not found" after SSO login

**Cause:** Auto-Provision is OFF and the user has no PSH account.

**Fix:**
- Either enable Auto-Provision in the SSO settings
- Or go to Admin → Users and create the user's account manually before they try SSO again

---

### Problem: I enabled SSO but the button doesn't appear on the login page

**Fix:**
- Make sure you clicked **Save Configuration** after enabling
- Hard refresh the browser (Ctrl+Shift+R)
- Check the status pill shows "Configured & Enabled" in the SSO settings

---

### Problem: I'm locked out — SSO is broken and I can't log in

**Fix:** You can always log in with the regular username/password form even when SSO is enabled. The SSO button is in addition to, not a replacement for, the normal login. Use your admin account credentials to log in and then fix the SSO settings.

---

## Quick Reference

| Provider | Issuer URL Format |
|---|---|
| Azure AD | `https://login.microsoftonline.com/TENANT_ID/v2.0` |
| Google | `https://accounts.google.com` |
| Okta | `https://ORG.okta.com/oauth2/default` |
| Auth0 | `https://TENANT.auth0.com` |

---

*Document version: 1.0 — Pure Storage Horizon*
*Generated: August 2026*
