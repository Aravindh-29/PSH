# PSH Ticketing System

Internal IT ticketing platform built with React 18 + Node.js/Express + PostgreSQL.

- **Frontend** — React 18, Vite, Recharts, ExcelJS
- **Backend** — Node.js, Express, Argon2id passwords, HTTP-only session cookies
- **Database** — PostgreSQL 14+, JSONB custom fields, full audit logging
- **Auth** — Role-based (Admin / Employee), session-based + optional SSO (OIDC)

Default credentials after first boot:
| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@123` |
| Employee | `john.smith` | `Employee@123` |

> **Change all passwords immediately after first login in production.**

---

## Environment Variables

Create a `.env` file at the project root (copy from `.env.example`):

```env
# ── Required ──────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/psh_ticketing
SESSION_SECRET=replace-with-64-char-random-hex-string

# ── Server ────────────────────────────────────────────────────────────────────
PORT=5000
NODE_ENV=production
CLIENT_URL=https://your-domain.com

# ── Database SSL (set true for cloud-managed Postgres: RDS, Azure, Supabase) ──
DATABASE_SSL=false

# ── SSO / OIDC (optional — leave blank to disable SSO on login page) ──────────
SSO_ISSUER_URL=
SSO_CLIENT_ID=
SSO_CLIENT_SECRET=
SSO_REDIRECT_URI=https://your-domain.com/api/auth/sso/callback
SSO_PROVIDER_NAME=
SSO_AUTO_PROVISION=false
```

Generate a strong session secret:
```bash
# Linux / macOS
openssl rand -hex 64

# Windows PowerShell
[System.BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(64)) -replace '-',''
```

---

## Option 1 — Local Development (Single Machine)

### Prerequisites
- Node.js 18+ (`node -v`)
- PostgreSQL 14+ running locally

### Steps

```bash
# 1. Clone
git clone https://github.com/Aravindh-29/PSH.git
cd PSH

# 2. Create .env
cp .env.example .env
# Edit .env — set DATABASE_URL and SESSION_SECRET

# 3. Install all dependencies and build the React client
npm run setup

# 4. Start
npm start
# App available at http://localhost:5000
```

For development with hot-reload:
```bash
npm run dev
# API: http://localhost:5000
# UI:  http://localhost:5173  (Vite HMR)
```

---

## Option 2 — Two-Server Setup (App VM + DB VM)

One VM runs the Node.js app. A separate VM runs PostgreSQL. Both can be on-prem or any cloud (AWS EC2, Azure VM, GCP Compute Engine).

```
[Browser] → [App Server :5000] → [DB Server :5432]
```

---

### 2A — Linux VMs (Ubuntu 22.04 / 24.04)

#### DB Server — set up PostgreSQL

```bash
# 1. Install PostgreSQL
sudo apt update && sudo apt install -y postgresql postgresql-contrib

# 2. Start and enable
sudo systemctl enable postgresql
sudo systemctl start postgresql

# 3. Create DB user and database
sudo -u postgres psql <<'SQL'
CREATE USER psh_user WITH PASSWORD 'StrongPassword123!';
CREATE DATABASE psh_ticketing OWNER psh_user;
GRANT ALL PRIVILEGES ON DATABASE psh_ticketing TO psh_user;
SQL

# 4. Allow remote connections
# Edit postgresql.conf
sudo nano /etc/postgresql/*/main/postgresql.conf
# Change:  listen_addresses = 'localhost'
# To:      listen_addresses = '*'

# Edit pg_hba.conf — add line for App Server IP (e.g. 10.0.0.10)
sudo nano /etc/postgresql/*/main/pg_hba.conf
# Add at the bottom:
# host  psh_ticketing  psh_user  10.0.0.10/32  scram-sha-256

# 5. Restart PostgreSQL
sudo systemctl restart postgresql

# 6. Open firewall port
sudo ufw allow 5432/tcp
```

#### Create Tables on DB Server

The app creates tables automatically on first startup. If you want to create them manually:

```bash
# On DB server — run schema.sql
psql -U psh_user -d psh_ticketing -h localhost -f /path/to/database/schema.sql
psql -U psh_user -d psh_ticketing -h localhost -f /path/to/database/seed.sql
```

Copy these two files from the repo to the DB server:
- `database/schema.sql`
- `database/seed.sql`

```bash
# From your local machine, copy schema files to DB server
scp database/schema.sql database/seed.sql ubuntu@DB_SERVER_IP:/home/ubuntu/
# Then SSH into DB server and run:
psql "postgresql://psh_user:StrongPassword123!@localhost:5432/psh_ticketing" -f /home/ubuntu/schema.sql
psql "postgresql://psh_user:StrongPassword123!@localhost:5432/psh_ticketing" -f /home/ubuntu/seed.sql
```

---

#### App Server — set up Node.js + app

```bash
# 1. Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node -v   # v20.x.x
npm -v

# 2. Install git
sudo apt install -y git

# 3. Clone repo
cd /opt
sudo git clone https://github.com/Aravindh-29/PSH.git
sudo chown -R $USER:$USER /opt/PSH
cd /opt/PSH

# 4. Create .env
cat > .env <<EOF
DATABASE_URL=postgresql://psh_user:StrongPassword123!@DB_SERVER_IP:5432/psh_ticketing
SESSION_SECRET=PASTE_YOUR_64_CHAR_SECRET_HERE
PORT=5000
NODE_ENV=production
CLIENT_URL=http://APP_SERVER_IP:5000
EOF

# 5. Install dependencies and build React
npm run setup

# 6. Test run
npm start
# Visit http://APP_SERVER_IP:5000

# 7. Run as a systemd service (keeps app alive on reboot)
sudo nano /etc/systemd/system/psh.service
```

Paste into the service file:
```ini
[Unit]
Description=PSH Ticketing System
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/PSH
ExecStart=/usr/bin/node server/src/server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable psh
sudo systemctl start psh
sudo systemctl status psh

# Logs
sudo journalctl -u psh -f
```

---

### 2B — Windows Server VMs

#### DB Server — Install PostgreSQL on Windows

1. Download PostgreSQL installer: https://www.postgresql.org/download/windows/
2. Run installer — set a `postgres` superuser password when prompted
3. After install, open **pgAdmin** or use `psql` from Start menu

```sql
-- In pgAdmin Query Tool or psql:
CREATE USER psh_user WITH PASSWORD 'StrongPassword123!';
CREATE DATABASE psh_ticketing OWNER psh_user;
GRANT ALL PRIVILEGES ON DATABASE psh_ticketing TO psh_user;
```

4. Allow remote connections:
   - Edit `C:\Program Files\PostgreSQL\16\data\postgresql.conf`:
     ```
     listen_addresses = '*'
     ```
   - Edit `C:\Program Files\PostgreSQL\16\data\pg_hba.conf`, add:
     ```
     host  psh_ticketing  psh_user  APP_SERVER_IP/32  scram-sha-256
     ```
   - Restart service: `services.msc` → PostgreSQL → Restart

5. Open Windows Firewall port 5432:
   ```powershell
   New-NetFirewallRule -DisplayName "PostgreSQL" -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Allow
   ```

#### Create Tables on DB Server (Windows)

Copy `database/schema.sql` and `database/seed.sql` to the DB server, then:

```powershell
# In psql (run from PostgreSQL bin folder or add to PATH)
psql -U psh_user -d psh_ticketing -h localhost -f C:\schema.sql
psql -U psh_user -d psh_ticketing -h localhost -f C:\seed.sql
```

---

#### App Server — Install Node.js + app on Windows

```powershell
# 1. Install Node.js 20 LTS
# Download from https://nodejs.org/ and run the installer
# OR using winget:
winget install OpenJS.NodeJS.LTS

# Verify (open new terminal)
node -v
npm -v

# 2. Install Git
winget install Git.Git

# 3. Clone repo
cd C:\
git clone https://github.com/Aravindh-29/PSH.git
cd C:\PSH

# 4. Create .env file
# Open Notepad or use this PowerShell command:
@"
DATABASE_URL=postgresql://psh_user:StrongPassword123!@DB_SERVER_IP:5432/psh_ticketing
SESSION_SECRET=PASTE_YOUR_64_CHAR_SECRET_HERE
PORT=5000
NODE_ENV=production
CLIENT_URL=http://APP_SERVER_IP:5000
"@ | Out-File -FilePath .env -Encoding utf8

# 5. Install and build
npm run setup

# 6. Test run
npm start
# Visit http://APP_SERVER_IP:5000
```

#### Run as a Windows Service (keep alive on reboot)

```powershell
# Install PM2
npm install -g pm2
npm install -g pm2-windows-startup

# Start app with PM2
cd C:\PSH
pm2 start server/src/server.js --name psh-ticketing

# Save process list and configure autostart
pm2 save
pm2-startup install

# Useful PM2 commands
pm2 status
pm2 logs psh-ticketing
pm2 restart psh-ticketing
pm2 stop psh-ticketing
```

---

## Option 3 — Cloud Managed Services

### Azure App Service + Azure Database for PostgreSQL

#### Step 1 — Create Azure Database for PostgreSQL (Flexible Server)

```
Azure Portal → Create a resource → Azure Database for PostgreSQL → Flexible Server

Settings:
  Resource group:  psh-rg
  Server name:     psh-db
  Region:          (your region)
  PostgreSQL version: 16
  Compute tier:    Burstable, Standard_B1ms (1 vCore, cheapest)
  Admin username:  psh_admin
  Password:        StrongPassword123!
  
Networking tab:
  Connectivity:    Public access
  Add current client IP  ← tick this to run schema from your machine
  Allow public access from any Azure service ← tick this for App Service
```

After creation, note the **Server name**: `psh-db.postgres.database.azure.com`

**Create the database and tables:**
```bash
# From your local machine (your IP must be in the firewall allowlist)
psql "postgresql://psh_admin:StrongPassword123!@psh-db.postgres.database.azure.com:5432/postgres?sslmode=require"

# In psql:
CREATE DATABASE psh_ticketing;
\c psh_ticketing
\i database/schema.sql
\i database/seed.sql
\q
```

---

#### Step 2 — Create Azure App Service

```
Azure Portal → Create a resource → Web App

Settings:
  Resource group:  psh-rg
  Name:            psh-ticketing
  Publish:         Code
  Runtime stack:   Node 20 LTS
  OS:              Linux
  Region:          (same as DB)
  Plan:            Basic B1 (cheapest with always-on)
```

**Configure environment variables:**
```
App Service → Configuration → Application settings → + New application setting

Add each:
  DATABASE_URL    = postgresql://psh_admin:StrongPassword123!@psh-db.postgres.database.azure.com:5432/psh_ticketing?sslmode=require
  SESSION_SECRET  = (your 64-char random string)
  NODE_ENV        = production
  CLIENT_URL      = https://psh-ticketing.azurewebsites.net
  DATABASE_SSL    = true
  PORT            = 8080
```

**Deploy from GitHub:**
```
App Service → Deployment Center
  Source: GitHub
  Org / Repo / Branch: Aravindh-29 / PSH / main
  Save → triggers automatic build & deploy
```

App Service runs `npm run build` and `npm start` automatically via the build pipeline. After deploy, visit: `https://psh-ticketing.azurewebsites.net`

---

### AWS App Runner + Amazon RDS PostgreSQL

#### Step 1 — Create RDS PostgreSQL

```
AWS Console → RDS → Create database

Settings:
  Engine:         PostgreSQL 16
  Template:       Free tier (or Production)
  DB identifier:  psh-db
  Master username: psh_admin
  Master password: StrongPassword123!
  Instance:       db.t3.micro
  Storage:        20 GB gp3
  
Connectivity:
  VPC:            Default VPC
  Public access:  Yes  (to run schema from local; disable after setup)
  VPC security group: create new, allow TCP 5432 from your IP
```

Note the **Endpoint**: `psh-db.xxxx.us-east-1.rds.amazonaws.com`

**Create database and tables:**
```bash
psql "postgresql://psh_admin:StrongPassword123!@psh-db.xxxx.us-east-1.rds.amazonaws.com:5432/postgres?sslmode=require"
# In psql:
CREATE DATABASE psh_ticketing;
\c psh_ticketing
\i database/schema.sql
\i database/seed.sql
\q
```

---

#### Step 2 — Deploy to AWS App Runner

```
AWS Console → App Runner → Create service

Source:
  Repository type: Source code repository
  Connect to GitHub → select Aravindh-29/PSH, branch: main
  
Build:
  Runtime: Node.js 20
  Build command:  npm run setup
  Start command:  npm start
  Port:           5000

Environment variables:
  DATABASE_URL   = postgresql://psh_admin:StrongPassword123!@psh-db.xxxx.us-east-1.rds.amazonaws.com:5432/psh_ticketing?sslmode=require
  SESSION_SECRET = (your 64-char random string)
  NODE_ENV       = production
  CLIENT_URL     = https://xxxx.us-east-1.awsapprunner.com  (fill after service is created)
  DATABASE_SSL   = true

Health check:
  Path: /api/health
```

After deploy, copy the App Runner URL, update `CLIENT_URL` env var to that URL, then redeploy.

---

## Updating a Deployment

After pushing new code to `main`:

**Azure App Service** — Deployment Center auto-deploys on push.

**AWS App Runner** — Auto-deploys on push if automatic deployments are enabled.

**Linux VM:**
```bash
cd /opt/PSH
git pull origin main
npm run setup        # rebuilds React client
sudo systemctl restart psh
```

**Windows VM:**
```powershell
cd C:\PSH
git pull origin main
npm run setup
pm2 restart psh-ticketing
```

---

## Health Check

All environments expose:
```
GET /api/health
→ { "status": "healthy", "database": "connected", "timestamp": "..." }
```

Use this URL for load balancer health probes, uptime monitors, and K8s liveness checks.

---

## Database Files Reference

| File | Purpose |
|---|---|
| `database/schema.sql` | Creates all tables, indexes, constraints. Safe to re-run (idempotent). |
| `database/seed.sql` | Inserts default modules and categories. Safe to re-run. |
| `server/src/dbInit.js` | Called on every server startup — runs schema + seed + creates default users if they don't exist. |

Default users created automatically on first startup:
| Username | Password | Role |
|---|---|---|
| `admin` | `Admin@123` | Admin |
| `john.smith` | `Employee@123` | Employee |
| `sarah.johnson` | `Employee@123` | Employee |
| `mike.davis` | `Employee@123` | Employee |

**Change passwords immediately after first login in production.**

---

## SSO / Single Sign-On

The app supports **any OIDC-compliant identity provider** — Microsoft Azure AD, Okta, Google Workspace, Auth0, Keycloak, and others. SSO and password login coexist; disabling one does not affect the other.

---

### How SSO Works

```
1. User clicks "Sign in with <Provider>" on the login page
2. Browser redirects to  GET /api/auth/sso
3. Server generates a PKCE code_verifier + state, stores them in the session,
   then redirects the browser to the identity provider's login page
4. User authenticates with their org credentials (MFA if configured by the org)
5. Provider redirects back to  GET /api/auth/sso/callback?code=...&state=...
6. Server validates state, exchanges the authorization code for tokens (PKCE)
7. Server calls the provider's /userinfo endpoint to get email + name
8. Server looks up the user in the database by email
9. Server creates the same HTTP-only session cookie used by password login
10. Browser is redirected to the dashboard  /
```

**Security properties of the implementation:**
- PKCE (`code_challenge_method: S256`) — prevents authorization code interception attacks
- `state` parameter validated on callback — prevents CSRF on the OAuth flow
- Session stored in PostgreSQL (`connect-pg-simple`) — not in memory, survives restarts
- Cookie is `httpOnly`, `sameSite: lax`, and `secure: true` in production
- Provider discovery via RFC 8414 (`/.well-known/openid-configuration`) — metadata is fetched once and cached

---

### SSO Login Page Behaviour

- The **"Sign in with SSO"** button is **hidden** when SSO is not configured (all 4 required env vars must be set)
- When configured, the button label changes to **"Sign in with \<SSO_PROVIDER_NAME\>"** (e.g. "Sign in with Microsoft")
- If SSO login fails, the user is redirected back to `/login?error=<code>` and a toast message explains the reason:

| Error code | Message shown |
|---|---|
| `sso_failed` | SSO sign-in failed. Please try again or use your password. |
| `sso_no_email` | Your SSO account did not provide an email address. |
| `sso_user_not_found` | No account found for your SSO identity. Contact your administrator. |
| `account_disabled` | Your account has been disabled. Contact your administrator. |
| `sso_not_configured` | SSO is not configured on this server. |

---

### SSO API Endpoints

| Method | Path | Auth required | Purpose |
|---|---|---|---|
| `GET` | `/api/auth/sso-status` | No | Returns `{ enabled: true/false, providerName }` — used by login page to show/hide button |
| `GET` | `/api/auth/sso` | No | Redirects browser to identity provider's login page |
| `GET` | `/api/auth/sso/callback` | No | Handles provider redirect; creates session; redirects to `/` |

---

### SSO Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `SSO_ISSUER_URL` | Yes | OIDC discovery URL of your identity provider (see provider-specific values below) |
| `SSO_CLIENT_ID` | Yes | Client / Application ID from your provider's app registration |
| `SSO_CLIENT_SECRET` | Yes | Client secret from your provider's app registration |
| `SSO_REDIRECT_URI` | Yes | Must exactly match the redirect URI registered in your provider. Format: `https://your-domain.com/api/auth/sso/callback` |
| `SSO_PROVIDER_NAME` | No | Display name shown on the login button, e.g. `Microsoft`, `Google`, `Okta` |
| `SSO_AUTO_PROVISION` | No | `true` = automatically create a new Employee account on first SSO login. `false` (default) = admin must pre-create the user account before they can SSO in |

---

### User Account Matching

When a user completes SSO authentication, the server resolves their account in this order:

1. **Match by `sso_sub`** — the provider's unique subject identifier (strongest, fastest). Used after the first SSO login.
2. **Match by email** — used on the very first SSO login to link an existing password-based account. The `sso_sub` is then stored so future logins use match #1.
3. **Auto-provision** — if no match is found and `SSO_AUTO_PROVISION=true`, a new Employee account is created with the provider's email and display name.
4. **Block** — if no match and `SSO_AUTO_PROVISION=false`, the user sees "No account found" and is redirected back to the login page.

> An SSO user that was linked to an existing password account can still log in with their password. Both methods are always available simultaneously.

---

### Database Columns Added for SSO

The following columns are added to the `users` table (safe to apply on existing installs via `ALTER TABLE IF NOT EXISTS`):

| Column | Type | Purpose |
|---|---|---|
| `sso_sub` | `TEXT` | Provider's unique subject ID — stored after first SSO login |
| `sso_provider` | `VARCHAR(50)` | Provider name stored at link time, e.g. `azure`, `okta`, `google` |

The `password_hash` column defaults to `''` (empty string) for SSO-only users who never set a password. These users cannot log in with a password since argon2 will never verify an empty hash.

---

### Provider Setup — Step by Step

---

#### Microsoft Azure AD / Entra ID

**In Azure Portal:**

```
Azure Active Directory → App registrations → New registration

  Name:                PSH Ticketing
  Supported account types: Accounts in this organizational directory only (Single tenant)
  Redirect URI:        Web  →  https://your-domain.com/api/auth/sso/callback

→ Register
```

After registration:

```
Overview page:
  Copy → Application (client) ID     → this is SSO_CLIENT_ID
  Copy → Directory (tenant) ID       → used in SSO_ISSUER_URL

Certificates & secrets → New client secret:
  Description: psh-prod
  Expires: 24 months
  → Add → Copy the Value immediately  → this is SSO_CLIENT_SECRET

API permissions → Add permission → Microsoft Graph → Delegated:
  openid, email, profile  (usually pre-added)
  → Grant admin consent
```

**`.env` values:**
```env
SSO_ISSUER_URL=https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0
SSO_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SSO_CLIENT_SECRET=your-client-secret-value
SSO_REDIRECT_URI=https://your-domain.com/api/auth/sso/callback
SSO_PROVIDER_NAME=Microsoft
```

---

#### Google Workspace

**In Google Cloud Console:**

```
APIs & Services → Credentials → Create Credentials → OAuth client ID

  Application type: Web application
  Name:             PSH Ticketing
  Authorized redirect URIs: https://your-domain.com/api/auth/sso/callback

→ Create → Copy Client ID and Client Secret
```

Enable the People API:
```
APIs & Services → Library → search "People API" → Enable
```

**`.env` values:**
```env
SSO_ISSUER_URL=https://accounts.google.com
SSO_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
SSO_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxx
SSO_REDIRECT_URI=https://your-domain.com/api/auth/sso/callback
SSO_PROVIDER_NAME=Google
```

---

#### Okta

**In Okta Admin Console:**

```
Applications → Create App Integration

  Sign-in method: OIDC - OpenID Connect
  Application type: Web Application

  App name:         PSH Ticketing
  Sign-in redirect URIs:  https://your-domain.com/api/auth/sso/callback
  Sign-out redirect URIs: https://your-domain.com/login
  Assignments: assign to the groups/people who should access PSH

→ Save → Copy Client ID and Client Secret
```

**`.env` values:**
```env
SSO_ISSUER_URL=https://your-org.okta.com/oauth2/default
SSO_CLIENT_ID=0oaxxxxxxxxxxxxxxx
SSO_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SSO_REDIRECT_URI=https://your-domain.com/api/auth/sso/callback
SSO_PROVIDER_NAME=Okta
```

---

#### Auth0

**In Auth0 Dashboard:**

```
Applications → Create Application

  Name:  PSH Ticketing
  Type:  Regular Web Application

Settings tab:
  Allowed Callback URLs:  https://your-domain.com/api/auth/sso/callback
  Allowed Logout URLs:    https://your-domain.com/login
  → Save Changes

→ Copy Domain, Client ID, Client Secret
```

**`.env` values:**
```env
SSO_ISSUER_URL=https://your-tenant.auth0.com
SSO_CLIENT_ID=your-client-id
SSO_CLIENT_SECRET=your-client-secret
SSO_REDIRECT_URI=https://your-domain.com/api/auth/sso/callback
SSO_PROVIDER_NAME=Auth0
```

---

### SSO + Auto-Provision Workflow

When `SSO_AUTO_PROVISION=true`, the first time a user from your org signs in via SSO, an Employee account is created automatically:

```
Email from provider:  john.doe@company.com
Name from provider:   John Doe

→ Created in DB:
    username:     john.doe
    email:        john.doe@company.com
    full_name:    John Doe
    role:         employee          ← always Employee, never Admin
    sso_sub:      <provider sub>
    sso_provider: azure / google / okta
    password_hash: ''               ← cannot log in with password
```

Admin must manually upgrade a user to `admin` role in the Users management page if needed.

When `SSO_AUTO_PROVISION=false` (default), the admin must create the user account first via the admin panel, and the email must exactly match what the identity provider sends.

---

### Checklist Before Enabling SSO in Production

- [ ] App is accessible via **HTTPS** — OIDC providers will not redirect to `http://`
- [ ] `SSO_REDIRECT_URI` registered in the provider **exactly matches** the value in `.env` (trailing slash, path case — must be identical)
- [ ] `NODE_ENV=production` is set — required for `secure` cookies
- [ ] `SESSION_SECRET` is a strong random string (64+ hex chars)
- [ ] Test with one user before rolling out to everyone
- [ ] If `SSO_AUTO_PROVISION=false` — pre-create user accounts in Admin → Users with the exact email address they use in your identity provider

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `column "password_hash" does not exist` | Table exists from old schema missing column | `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';` |
| `ECONNREFUSED 5432` | DB not reachable | Check `DATABASE_URL`, firewall rules, pg_hba.conf |
| `SSL SYSCALL error` | SSL required but not enabled | Add `?sslmode=require` to `DATABASE_URL` and set `DATABASE_SSL=true` |
| `EADDRINUSE :::5000` | Server already running | `npx kill-port 5000` or change `PORT` in `.env` |
| Blank page after deploy | React build not committed or `NODE_ENV` not set | Run `npm run build:client`, confirm `NODE_ENV=production` |
| Session lost on restart | `SESSION_SECRET` changed between restarts | Use a fixed secret stored in env; never rotate without invalidating all sessions |
| SSO button not showing | SSO env vars not set | All 4 required vars must be present: `SSO_ISSUER_URL`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_REDIRECT_URI` |
| `redirect_uri_mismatch` from provider | Redirect URI mismatch | The value in `SSO_REDIRECT_URI` must exactly match what is registered in the provider app (character-for-character) |
| SSO works in dev but not prod | Cookie `secure` flag | Ensure `NODE_ENV=production` and app is served over HTTPS |
| `RPError: state mismatch` | Session lost between SSO start and callback | Ensure only one instance is running or sessions are stored in shared Postgres (already the case in this app) |
| `sso_user_not_found` after login | Email not found + auto-provision off | Admin must pre-create the user in Admin → Users with the exact email from the identity provider; or set `SSO_AUTO_PROVISION=true` |
| SSO user can't log in with password | SSO-provisioned users have no password | Use SSO login; or admin can set a password via the Users management page |
| OIDC discovery fails at startup | Provider URL unreachable | Check `SSO_ISSUER_URL` is correct and the server has outbound internet access to the provider |
