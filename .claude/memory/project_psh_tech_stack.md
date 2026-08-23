---
name: project-psh-tech-stack
description: "PSH tech stack, key file paths, and API route map"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7be858f0-1fe3-44f0-9408-2c45405b5259
  modified: 2026-08-23T15:54:01.556Z
---

# Tech Stack & Key Files

## Stack
- **Frontend**: React + Vite, Recharts (charts), ExcelJS (Excel export/import), lucide-react (icons), date-fns
- **Backend**: Node.js + Express, pg (PostgreSQL), Argon2id (passwords), express-session
- **DB**: PostgreSQL; schema in `database/schema.sql`
- **CSS**: Plain CSS per page (`Reports.css`, `Admin.css`, etc.) — no Tailwind/CSS-in-JS

## Key File Paths
| File | Purpose |
|------|---------|
| `server/src/controllers/reportController.js` | `getReport` (personal) + `getGlobalReport` (admin) — both accept `startDate`/`endDate` query params |
| `server/src/controllers/userController.js` | User CRUD + `bulkCreate` |
| `server/src/controllers/authController.js` | Login: checks `is_active = true AND deleted_at IS NULL` |
| `server/src/routes/users.js` | Includes `POST /bulk` → `requireAdmin` → `bulkCreate` |
| `client/src/pages/Reports/Reports.jsx` | My Reports page with date picker |
| `client/src/pages/Reports/GlobalReports.jsx` | Global Reports page with date picker |
| `client/src/pages/Reports/Reports.css` | Shared CSS for both report pages incl. `.date-preset-btn`, `.date-picker-*` |
| `client/src/pages/Admin/AdminUsers.jsx` | User management + bulk upload |
| `client/src/utils/xlsxShim.js` | ExcelJS wrapper with xlsx-style API (write-only; use ExcelJS directly for reading) |

## Date Filter Pattern (backend)
```js
const startDate = req.query.startDate || null;
const endDate   = req.query.endDate   || null;
let dateCond = '';
const dateParams = [];
if (startDate && endDate) {
  dateParams.push(startDate, endDate);
  const s = baseParams.length + 1;
  dateCond = `AND t.created_at >= $${s}::date AND t.created_at < ($${s+1}::date + INTERVAL '1 day')`;
}
```
- Personal reports: `baseParams = [userId]` so `$2`/`$3`
- Global reports: no userId, so `$1`/`$2`

## CSS Class Naming
- Date picker preset buttons: `.date-preset-btn` and `.date-preset-btn.active` (NOT `.date-picker-preset-btn`)
- Date picker wrapper: `.date-picker-wrap`, `.date-picker-btn`, `.date-picker-dropdown`, `.date-picker-presets`

**Why:** [[project-psh-overview]] [[project-psh-features-built]]
