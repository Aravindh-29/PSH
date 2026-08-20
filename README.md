# PSH Ticketing System

Internal IT ticketing platform built with React 18 + Node.js/Express + PostgreSQL.

- **Frontend** — React 18, Vite, Recharts, ExcelJS
- **Backend** — Node.js, Express, Argon2id passwords, HTTP-only session cookies
- **Database** — PostgreSQL 14+, JSONB custom fields, full audit logging
- **Auth** — Role-based (Admin / Employee), session-based

Default credentials after first boot:
| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@123` |
| Employee | `john.smith` | `Employee@123` |

---

## Environment Variables

Create a `.env` file at the project root (copy from `.env.example`):

```env
# Required
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/psh_ticketing
SESSION_SECRET=replace-with-64-char-random-hex-string

# Optional (defaults shown)
PORT=5000
NODE_ENV=production
CLIENT_URL=https://your-domain.com   # must be https:// for secure cookies
DATABASE_SSL=false                   # set true for cloud-managed Postgres (RDS, Azure, Supabase)
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

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `column "password_hash" does not exist` | Table exists from old schema missing column | `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';` |
| `ECONNREFUSED 5432` | DB not reachable | Check `DATABASE_URL`, firewall rules, pg_hba.conf |
| `SSL SYSCALL error` | SSL required but not enabled | Add `?sslmode=require` to `DATABASE_URL` and set `DATABASE_SSL=true` |
| `EADDRINUSE :::5000` | Server already running | `npx kill-port 5000` or change `PORT` in `.env` |
| Blank page after deploy | React build not committed or `NODE_ENV` not set | Run `npm run build:client`, confirm `NODE_ENV=production` |
| Session lost on restart | `SESSION_SECRET` changed between restarts | Use a fixed secret stored in env; never rotate without invalidating all sessions |
