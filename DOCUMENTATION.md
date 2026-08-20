# SERV-IT — Internal Ticketing System
### Complete Technical Documentation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Features](#3-features)
4. [Local Development Setup](#4-local-development-setup)
5. [Production Deployment (Ubuntu)](#5-production-deployment-ubuntu)
6. [Environment Variables](#6-environment-variables)
7. [Database](#7-database)
8. [User Roles & Permissions](#8-user-roles--permissions)
9. [Admin Guide](#9-admin-guide)
10. [AWS Hosting](#10-aws-hosting)
11. [Backup & Restore](#11-backup--restore)
12. [Security](#12-security)
13. [API Reference](#13-api-reference)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Overview

**SERV-IT** is an internal IT ticketing system built for ~500–1000 users. It allows employees to raise support tickets and gives administrators full control over ticket management, user accounts, reporting, and audit logging.

| Item | Detail |
|---|---|
| Ticket ID format | PSH000001, PSH000002, … |
| Default admin login | `admin` / `Admin@123` |
| Default port | `5000` |
| Tech stack | React 18 + Vite, Node.js/Express, PostgreSQL |

---

## 2. Architecture

```
┌─────────────────────────────────────────┐
│                EC2 Server               │
│                                         │
│  ┌──────────┐    ┌────────────────────┐ │
│  │  Nginx   │───▶│   Node.js :5000    │ │
│  │ (proxy)  │    │                    │ │
│  └──────────┘    │  ┌──────────────┐  │ │
│                  │  │ React (dist) │  │ │
│                  │  └──────────────┘  │ │
│                  │  ┌──────────────┐  │ │
│                  │  │  Express API │  │ │
│                  │  └──────┬───────┘  │ │
│                  └─────────┼──────────┘ │
│                            │            │
│                  ┌─────────▼──────────┐ │
│                  │    PostgreSQL       │ │
│                  │  (tickets, users,   │ │
│                  │   attachments,      │ │
│                  │   audit logs)       │ │
│                  └────────────────────┘ │
│                                         │
│            30 GB EBS Volume             │
└──────────────────────┬──────────────────┘
                       │ nightly pg_dump
                       ▼
              S3 Bucket (5 backups)
```

**Key design decisions:**
- Single-server monolith — React static files served by Node.js (no separate web server needed in dev)
- File attachments stored as `bytea` in PostgreSQL — no S3/filesystem dependency for attachments
- Server-side sessions stored in PostgreSQL via `connect-pg-simple`
- Soft-delete pattern for tickets and users — data is never permanently destroyed unless explicitly requested

---

## 3. Features

### Employee
- Create, view, edit, and delete own tickets
- Add comments and attachments to tickets
- View ticket history timeline
- Knowledge base (read-only)

### Admin
- All employee features
- **User Management** — create, deactivate, reset password, soft-delete users
- **User Wise Tickets** — browse and manage every user's tickets
- **Audit Logs** — full activity log with calendar view, search by name/ticket
- **Reports** — per-user and global Excel export
- **Dashboard** — stats, charts, recent activity
- **SSO** — configurable OIDC/OAuth2 single sign-on
- **Custom Fields** — add extra fields to tickets
- **Knowledge Base** — create and manage articles

---

## 4. Local Development Setup

### Prerequisites
- Node.js 20 LTS
- PostgreSQL 14+
- Git

### Steps

```bash
# 1. Clone
git clone https://github.com/Aravindh-29/PSH.git
cd PSH

# 2. Create .env in project root
cp .env.example .env
# Edit .env with your local DB credentials

# 3. Install all dependencies
npm run install:all

# 4. Initialise the database (creates tables + seeds admin user)
npm run db:init

# 5. Start dev servers (React on :5173, API on :3001, with hot-reload)
npm run dev
```

Open `http://localhost:5173`

### NPM Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start API + React dev servers with hot-reload |
| `npm start` | Production mode — serve built React from Node.js |
| `npm run build:client` | Build React for production (`client/dist/`) |
| `npm run install:all` | Install server + client dependencies |
| `npm run db:init` | Create tables and seed default admin user |

---

## 5. Production Deployment (Ubuntu)

The repo includes a fully automated setup script.

### One-command install

```bash
# Clone the repo
git clone https://github.com/Aravindh-29/PSH.git
cd PSH

# Run as root
sudo bash install-nodejs-and-postgres.sh
```

### What the script does

| Step | Action |
|---|---|
| 1 | System update & install prerequisites |
| 2 | Install Node.js 20 LTS (NodeSource) |
| 3 | Install PostgreSQL |
| 4 | Create `servit` system user |
| 5 | Clone/pull repository |
| 6 | Create PostgreSQL role + database |
| 7 | Write `.env` with generated secrets |
| 8 | `npm install` + `npm run build:client` + `db:init` |
| 9 | Register and start `systemd` service |

After completion, credentials are saved to `/root/servit-credentials.txt`.

### Systemd service commands

```bash
# Status
systemctl status servit

# Live logs
journalctl -u servit -f

# Restart
systemctl restart servit

# Stop
systemctl stop servit
```

### Running inside existing cloned repo

If you already cloned the repo and want to run the script from inside it:

```bash
cd /home/ubuntu/PSH
sudo bash install-nodejs-and-postgres.sh
```

The script auto-detects it is already inside the repo and skips cloning.

---

## 6. Environment Variables

File location: `<app-root>/.env`

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://psh_user:PASSWORD@localhost:5432/psh_db
SESSION_SECRET=your-random-64-char-secret
CLIENT_URL=http://YOUR_SERVER_IP:5000
DATABASE_SSL=false

# SSO (optional — configure via Admin UI instead)
# SSO_ISSUER_URL=
# SSO_CLIENT_ID=
# SSO_CLIENT_SECRET=
# SSO_REDIRECT_URI=
# SSO_PROVIDER_NAME=
# SSO_AUTO_PROVISION=false
```

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `production` or `development` |
| `PORT` | Yes | Port the server listens on |
| `DATABASE_URL` | Yes | Full PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Random secret for signing session cookies |
| `CLIENT_URL` | Yes | Public URL of the app (used for CORS + SSO redirect) |
| `DATABASE_SSL` | No | Set `true` if DB requires SSL |

---

## 7. Database

### Schema overview

| Table | Purpose |
|---|---|
| `users` | Accounts — employees and admins |
| `tickets` | Support tickets |
| `ticket_comments` | Comments and work notes on tickets |
| `ticket_attachments` | File attachments stored as `bytea` |
| `ticket_audit_logs` | Every field change, creation, deletion |
| `modules` | Ticket module categories (e.g. Network, Server) |
| `categories` | Sub-categories within modules |
| `kb_articles` | Knowledge base articles |
| `app_config` | SSO config and custom field definitions |
| `session` | express-session storage (auto-managed) |

### Soft-delete pattern

Tickets and users are never hard-deleted by default:

```sql
-- Soft-deleted tickets
SELECT * FROM tickets WHERE deleted_at IS NOT NULL;

-- Soft-deleted users
SELECT * FROM users WHERE deleted_at IS NOT NULL;
```

### Useful queries

```sql
-- All active users
SELECT username, email, role, is_active FROM users WHERE deleted_at IS NULL;

-- Tickets by status
SELECT status, COUNT(*) FROM tickets WHERE deleted_at IS NULL GROUP BY status;

-- Recent audit activity
SELECT u.full_name, tal.action, t.ticket_number, tal.created_at
FROM ticket_audit_logs tal
JOIN users u ON tal.user_id = u.id
JOIN tickets t ON tal.ticket_id = t.id
ORDER BY tal.created_at DESC LIMIT 20;

-- Storage used by attachments
SELECT pg_size_pretty(SUM(file_size)) AS total_attachment_size FROM ticket_attachments;
```

---

## 8. User Roles & Permissions

| Action | Employee | Admin |
|---|---|---|
| Create ticket | ✅ | ✅ |
| View own tickets | ✅ | ✅ |
| View all tickets | ❌ | ✅ |
| Edit own tickets | ✅ | ✅ |
| Edit any ticket | ❌ | ✅ |
| Delete ticket | ✅ (own) | ✅ (any) |
| Add comment | ✅ | ✅ |
| Add attachment | ✅ | ✅ |
| Create user | ❌ | ✅ |
| Delete user | ❌ | ✅ |
| Reset password | ❌ | ✅ |
| View audit logs | ❌ | ✅ |
| Export reports | ❌ | ✅ |
| Configure SSO | ❌ | ✅ |
| Manage KB | ❌ | ✅ |

---

## 9. Admin Guide

### Create a user
Admin → User Management → **+ Add User**
- Fill name, username, email, password, role
- Password has show/hide toggle

### Delete a user
Admin → User Management → **Delete**
- Type the username to confirm
- Checkbox: optionally delete all their tickets too
- Deleted users cannot log in but their tickets remain visible under User Wise Tickets

### View deleted user's tickets
Admin → User Wise Tickets → click the user (shows **Deleted** badge)
- **Delete All N Tickets** button appears — type username to confirm

### Reset a password
Admin → User Management → **Reset Password**

### Audit Logs
Admin → Audit Logs
- Calendar on the left — highlighted dates have activity
- Click any date to see that day's log
- Search bar filters by employee name or ticket number
- Click any ticket number to see its full change history modal

### Restore from backup
See [Backup & Restore](#11-backup--restore) section.

---

## 10. AWS Hosting

### Recommended architecture

| Component | Choice | Reason |
|---|---|---|
| Compute | EC2 t4g.medium (2 vCPU, 4 GB RAM) | Enough for ≤500 users, ARM64 is cheaper |
| Storage | 30 GB EBS gp3 | OS + app + PostgreSQL data + attachments |
| Backups | S3 Standard-IA | Low cost for infrequently accessed backups |
| Auth | EC2 IAM Role | No credentials in scripts |
| DNS | Route 53 | Maps domain to EC2 public IP |

### Estimated monthly cost (us-east-1)

| Item | ~Cost/month |
|---|---|
| EC2 t4g.medium | $24.53 |
| 30 GB EBS gp3 | $2.40 |
| Public IPv4 | $3.65 |
| S3 (5 backups ~500 MB each) | ~$0.15 |
| **Total** | **~$31–33** |

### Scaling path

```
30 GB EBS
  → 50 GB (when disk > 80%)
  → 100 GB (as attachments grow)

EC2 t4g.medium
  → t4g.large (if CPU/RAM becomes bottleneck)
  → Add RDS (if DB needs separate scaling)
```

---

## 11. Backup & Restore

### Backup script

Location: `scripts/backup.sh`

**What it does:**
1. Reads DB credentials from `.env` automatically
2. Runs `pg_dump` and compresses with `gzip`
3. Uploads to S3 (`STANDARD_IA` storage class)
4. Deletes the oldest backup, keeping only the latest 5
5. Checks disk usage — sends email alert at 70% (warning) and 80% (critical)
6. Sends a success email on completion

### Setup

```bash
# 1. Install dependencies
sudo apt install awscli mailutils -y

# 2. Edit the 3 config lines at the top of the script
nano /home/ubuntu/PSH/scripts/backup.sh
#   S3_BUCKET="your-bucket-name"
#   S3_REGION="us-east-1"
#   ALERT_EMAIL="you@email.com"

# 3. Make executable
chmod +x /home/ubuntu/PSH/scripts/backup.sh

# 4. Test manually
sudo bash /home/ubuntu/PSH/scripts/backup.sh

# 5. Schedule nightly at 1 AM
sudo crontab -e
# Add:
# 0 1 * * * /home/ubuntu/PSH/scripts/backup.sh >> /var/log/servit-backup.log 2>&1
```

### IAM policy for EC2 role (S3 access only)

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "s3:PutObject",
      "s3:GetObject",
      "s3:ListBucket",
      "s3:DeleteObject"
    ],
    "Resource": [
      "arn:aws:s3:::your-bucket-name",
      "arn:aws:s3:::your-bucket-name/*"
    ]
  }]
}
```

### Restore procedure

```bash
# 1. Download the latest backup from S3
aws s3 cp s3://your-bucket/psh-backups/psh_backup_YYYY-MM-DD_HH-MM-SS.sql.gz /tmp/

# 2. Decompress
gunzip /tmp/psh_backup_YYYY-MM-DD_HH-MM-SS.sql.gz

# 3. Stop the app
sudo systemctl stop servit

# 4. Restore into PostgreSQL
PGPASSWORD='your-db-password' psql \
  -U psh_user -h localhost -d psh_db \
  -f /tmp/psh_backup_YYYY-MM-DD_HH-MM-SS.sql

# 5. Restart the app
sudo systemctl start servit
```

### View backup logs

```bash
cat /var/log/servit-backup.log
```

---

## 12. Security

### Implemented protections

| Area | Implementation |
|---|---|
| Password hashing | Argon2id (best-in-class) |
| SQL injection | 100% parameterized queries — no string interpolation |
| Session storage | Server-side PostgreSQL — cookie holds only signed ID |
| Session cookies | `HttpOnly`, `SameSite=lax`, `Secure` in production |
| CSRF | Covered by `SameSite=lax` on all state-changing endpoints |
| Brute force | Rate limiter — 10 login attempts per 15 minutes |
| CORS | Single explicit origin allowlist |
| Admin routes | All admin endpoints guarded by `requireAdmin` middleware |
| XSS | React JSX auto-escaping; no `dangerouslySetInnerHTML` |
| File uploads | MIME allowlist, 25 MB size limit, filename sanitised |

### Default admin password

Change immediately after first login:
> Admin → User Management → Reset Password on the admin account

---

## 13. API Reference

All endpoints are prefixed with `/api`.

### Authentication
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/auth/login` | Public | Login (rate-limited: 10/15 min) |
| POST | `/auth/logout` | Auth | Logout |
| GET | `/auth/me` | Auth | Get current session user |

### Tickets
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/tickets` | Auth | List tickets (scoped to own for employees) |
| POST | `/tickets` | Auth | Create ticket |
| GET | `/tickets/:id` | Auth | Get single ticket |
| PUT | `/tickets/:id` | Auth | Update ticket |
| DELETE | `/tickets/:id` | Auth | Soft-delete ticket |
| GET | `/tickets/:id/comments` | Auth | Get comments |
| POST | `/tickets/:id/comments` | Auth | Add comment |
| GET | `/tickets/:id/attachments` | Auth | List attachments |
| POST | `/tickets/:id/attachments` | Auth | Upload attachment |
| GET | `/tickets/:id/attachments/:aid/download` | Auth | Download file |
| DELETE | `/tickets/:id/attachments/:aid` | Auth | Delete attachment |

### Users
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/users` | Admin | List users (`?scope=with_tickets` includes deleted) |
| POST | `/users` | Admin | Create user |
| GET | `/users/:id` | Admin | Get user + ticket counts |
| PUT | `/users/:id` | Admin | Update user (name, email, role, status) |
| DELETE | `/users/:id` | Admin | Soft-delete user |
| POST | `/users/:id/reset-password` | Admin | Reset password |
| DELETE | `/users/:id/tickets` | Admin | Soft-delete all tickets for a user |

### Audit Logs
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/audit` | Admin | Get logs for a date (`?date=&tz=&page=`) |
| GET | `/audit/ticket/:ticketNumber` | Admin | Full history for a ticket |

### Reports & Dashboard
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/reports` | Admin | Per-user report data |
| GET | `/reports/global` | Admin | Global report data |
| GET | `/dashboard/stats` | Auth | Dashboard KPI counts |
| GET | `/dashboard/charts` | Auth | Chart data |

---

## 14. Troubleshooting

### App not starting
```bash
# Check service status
systemctl status servit

# Check last 50 log lines
journalctl -u servit -n 50

# Common cause: port already in use
sudo lsof -i :5000
sudo kill -9 <PID>
sudo systemctl start servit
```

### Database connection error
```bash
# Check PostgreSQL is running
systemctl status postgresql

# Test connection manually
psql -U psh_user -d psh_db -h localhost
# Enter password from /root/servit-credentials.txt

# Check DATABASE_URL in .env
cat /home/ubuntu/PSH/.env | grep DATABASE_URL
```

### pg_dump fails in backup script
```bash
# Verify pg_dump is installed
which pg_dump

# Test manually
PGPASSWORD='yourpass' pg_dump -U psh_user -h localhost -d psh_db | gzip > /tmp/test.sql.gz
echo $?   # should be 0
```

### S3 upload fails
```bash
# Check IAM role is attached to EC2
aws sts get-caller-identity

# Test S3 access
aws s3 ls s3://your-bucket-name/

# Check AWS CLI is installed
aws --version
```

### Forgot admin password
```bash
# Connect to PostgreSQL
sudo -u postgres psql -d psh_db

# Reset via SQL (replace hash with a known Argon2 hash, or use Node.js)
# Easiest: create a temp script
cd /home/ubuntu/PSH/server
node -e "
const argon2 = require('argon2');
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
argon2.hash('NewPassword@123').then(h =>
  pool.query('UPDATE users SET password_hash=\$1 WHERE username=\$2', [h, 'admin'])
    .then(() => { console.log('done'); pool.end(); })
);
"
```

### Disk expanding (EBS)
```bash
# Check current disk usage
df -h

# Resize EBS in AWS Console first (EC2 → Volumes → Modify)
# Then extend the filesystem:
sudo growpart /dev/xvda 1
sudo resize2fs /dev/xvda1
df -h   # confirm new size
```

---

*Last updated: August 2026 — SERV-IT v1.0*
