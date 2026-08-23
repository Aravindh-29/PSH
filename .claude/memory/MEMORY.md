# Project Memory — Pure Storage Horizon

This file indexes all memory entries for the Pure Storage Horizon project.

## Entries

### project_psh_overview.md
- **Name:** project-psh-overview
- **Description:** Pure Storage Horizon internal ticketing system - Phase 1 requirements and architecture
- **Type:** project
- **Summary:** Phase 1 internal ticketing system for ~1000 users. Modular monolith: React + Node.js/Express + PostgreSQL. One repo, one `docker compose up --build`. Auth via Argon2id + HTTP-only sessions + RBAC. Roles: ADMIN and EMPLOYEE. Ticket IDs: PSH000001+. Soft delete and full audit logging.

### project_psh_ui_design.md
- **Name:** project-psh-ui-design
- **Description:** Pure Storage Horizon UI design spec - exact color scheme, layout, components from approved mockups
- **Type:** project
- **Summary:** User-approved UI from mockup images. Must match exactly. Dark navy sidebar (#0D1B2A), orange CTA (#E85D04). Split-screen login with animated left panel. Dashboard with left sidebar nav, top bar, 6 stat cards, line + donut charts, recent tickets table. Status/priority pill badges with defined color coding.

### project_psh_features_built.md
- [Features built](project_psh_features_built.md) — Complete inventory: auth, tickets, My Reports + Global Reports (date filter), bulk user upload, scripts (install/uninstall/healthcheck/update), deployment flow

### project_psh_tech_stack.md
- [Tech stack & key files](project_psh_tech_stack.md) — Stack, key file paths, date filter pattern, CSS class naming gotchas
