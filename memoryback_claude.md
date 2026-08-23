# Claude Memory Backup & Restore Guide

## Where Claude stores memory

Claude keeps project memory in a hidden folder on your machine:
```
C:\Users\<username>\.claude\projects\<project-key>\memory\
```

The `<project-key>` is derived from the full project path:
- Drive letter → lowercase
- `:` → `-`
- `\` → `-`
- spaces → `-`

Example:
```
C:\Users\aravi\OneDrive\Desktop\Pure Storage Horizon
→ c--Users-aravi-OneDrive-Desktop-Pure-Storage-Horizon
```

---

## What is backed up

A copy of all memory files is stored inside the repo at:
```
.claude\memory\
├── MEMORY.md                        ← index of all memory entries
├── project_psh_overview.md          ← project goals, architecture, roles
├── project_psh_ui_design.md         ← colors, layout, component specs
├── project_psh_features_built.md    ← every feature built so far
└── project_psh_tech_stack.md        ← key file paths, code patterns, gotchas
```

Since the project is on OneDrive and pushed to GitHub, the backup is always in sync.

---

## How to restore memory on a new machine

### Step 1 — Clone the repo
```bash
git clone <repo-url>
cd "Pure Storage Horizon"
```

### Step 2 — Run this in PowerShell (from inside the repo folder)
```powershell
$key = ($PWD.Path -replace '\\','-' -replace ':','-' -replace ' ','-')
$key = $key[0].ToString().ToLower() + $key.Substring(1)
$dest = "$env:USERPROFILE\.claude\projects\$key\memory"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item ".claude\memory\*.md" -Destination $dest -Force
Write-Host "Done. Memory restored to:" $dest
```

This command is fully dynamic — it auto-detects your username and the project path. Works on any machine regardless of where the repo is cloned.

---

## How to verify Claude has the memory

Start a new conversation with Claude Code in this project folder and ask:

> *"What do you know about this project?"*

Claude should correctly recall:
- PSH internal ticketing system, React + Node.js + PostgreSQL
- Orange CTA `#E85D04`, dark navy sidebar `#0D1B2A`
- `update.sh` runs 4 steps (no git pull — copy-based deployment)
- Bulk upload uses ExcelJS; date filter in `reportController.js`
- Inactive user = cannot log in, account preserved

If Claude says it has no context → the files didn't land in the right place. Re-run the PowerShell command and check the output path.

---

## How to keep memory up to date

Whenever Claude saves new memories during a session, copy them back to the repo:

```powershell
# Run from inside the repo folder
$key = ($PWD.Path -replace '\\','-' -replace ':','-' -replace ' ','-')
$key = $key[0].ToString().ToLower() + $key.Substring(1)
$src = "$env:USERPROFILE\.claude\projects\$key\memory"
Copy-Item "$src\*.md" -Destination ".claude\memory\" -Force
Write-Host "Memory backup updated."
```

Then commit and push:
```bash
git add .claude/memory/
git commit -m "chore: update Claude memory backup"
git push
```
