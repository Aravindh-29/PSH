---
name: project-psh-features-built
description: All features built and shipped in PSH ticketing system - complete feature inventory
metadata: 
  node_type: memory
  type: project
  originSessionId: 7be858f0-1fe3-44f0-9408-2c45405b5259
  modified: 2026-08-23T15:53:44.458Z
---

# Features Built — Pure Storage Horizon

## Auth & Users
- Login with Argon2id + HTTP-only sessions; RBAC (ADMIN / EMPLOYEE)
- User management: create, edit, toggle active/inactive, soft-delete, reset password
- **Inactive user** = cannot log in; account + tickets fully preserved; re-activatable anytime
- **Bulk user creation via Excel upload**: download template → upload → preview modal with validation → admin password confirm → POST `/users/bulk`
  - Uses ExcelJS (not xlsx) for parsing; handles hyperlink cell objects Excel auto-creates for emails
  - Eye icon toggle in preview Password column to show/hide passwords
  - Template has "Users" sheet (headers + example row) + "Instructions" sheet

## Tickets
- Create / edit / view tickets; ticket IDs PSH000001+
- Soft delete; full audit logging
- Status/priority pill badges with defined color coding

## Reports (Employee — "My Reports")
- Date picker: All Time / Last 7/14/30 days / This month / Last month / Custom range
- All stat cards, donuts, bar charts, ticket table filtered by selected range
- Monthly bar chart: when range selected → generates series for that range; else last 12 months
- Weekly bar chart: same logic; else last 12 weeks
- Chart titles update dynamically to show active range
- Export to Excel (ExcelJS-based, styled)

## Reports (Admin — "Global Reports")
- Same date picker as My Reports (Calendar icon + presets + custom range)
- All queries (summary cards, monthly chart, weekly chart, status donut, priority donut, employees table, all-tickets) respect selected date range
- Employees table shows per-user ticket counts filtered to selected date range
- Export to Excel (8 sheets: Global Summary, Monthly Trend, Weekly Trend, Per Employee, By Status, By Priority, Visual Charts, All Tickets)

## Scripts
- `scripts/install.sh` — full install: Node.js, PostgreSQL, Nginx, SSL, systemd service
- `scripts/uninstall.sh` — full wipe (type DELETE to confirm): removes packages, DB, swap, Nginx, Certbot
- `scripts/healthcheck.sh` — 8-section health report: services, memory, disk, log sizes, DB stats, recent errors
- `scripts/update.sh` — **4 steps** (no git pull): npm install → Vite build → DB migrations → restart servit
  - Deploy by manually copying code folder to /opt/PSH, then run `sudo bash /opt/PSH/scripts/update.sh`

## Infrastructure
- Deployed to Linux server at /opt/PSH; served via Nginx → Node.js (port 5000) + static dist/
- systemd service: `servit`; logs via `journalctl -u servit`
- Dev: `npm run dev` from root (concurrently runs nodemon API on :5000 + Vite on :5173)
- Build: `npm run build:client` → dist/ served by Nginx
- Swap: 2GB /swapfile (needed for Vite build on low-RAM instances)

**Why:** [[project-psh-overview]]
