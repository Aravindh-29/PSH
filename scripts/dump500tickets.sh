#!/bin/bash
# ================================================================
#  SERV-IT — Demo Data Loader
#  Cleans up previous demo data, then creates 3 users + 500 tickets
#
#  Usage:  sudo bash /opt/PSH/scripts/dump500tickets.sh
# ================================================================

APP_DIR="/opt/PSH"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BOLD='\033[1m'; NC='\033[0m'

[[ $EUID -ne 0 ]] && { echo -e "${RED}Run as root:  sudo bash $0${NC}"; exit 1; }
[[ -f "${APP_DIR}/.env" ]] || { echo -e "${RED}ERROR: ${APP_DIR}/.env not found — run the install script first${NC}"; exit 1; }

echo ""
echo -e "${BOLD}  SERV-IT — Demo Data Loader${NC}"
echo -e "  App dir: ${APP_DIR}"
echo ""

# ── Read DB credentials from .env ───────────────────────────────
DB_URL="$(grep '^DATABASE_URL=' "${APP_DIR}/.env" | cut -d= -f2-)"
DB_USER="$(echo "${DB_URL}" | sed 's|.*://\([^:]*\):.*|\1|')"
DB_PASS="$(echo "${DB_URL}" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')"
DB_HOST="$(echo "${DB_URL}" | sed 's|.*@\([^:/]*\)[:/].*|\1|')"
DB_PORT="$(echo "${DB_URL}" | sed 's|.*:\([0-9]*\)/.*|\1|')"
DB_NAME="$(echo "${DB_URL}" | sed 's|.*/\([^?]*\).*|\1|')"

run_sql() {
  PGPASSWORD="${DB_PASS}" psql -U "${DB_USER}" -h "${DB_HOST}" -p "${DB_PORT}" -d "${DB_NAME}" -c "$1" -q 2>/dev/null
}

# ── Clean up ALL previous tickets and demo users ─────────────────
echo -e "  ${YELLOW}Cleaning up all existing tickets and demo users...${NC}"

run_sql "TRUNCATE TABLE ticket_comments, ticket_attachments, tickets RESTART IDENTITY CASCADE;"
run_sql "DELETE FROM users WHERE username IN ('alice.johnson','bob.williams','carol.smith');"

echo -e "  ${GREEN}✓ Cleanup done${NC}"
echo ""

# ── Run the Node.js loader ───────────────────────────────────────
NODE_BIN="$(which node 2>/dev/null)" || { echo -e "${RED}node not found in PATH${NC}"; exit 1; }

NODE_PATH="${APP_DIR}/node_modules:${APP_DIR}/server/node_modules" \
  "${NODE_BIN}" "${APP_DIR}/scripts/dump500tickets.js"
