#!/bin/bash
# ================================================================
#  SERV-IT — Update Script
#  Rebuild client, run DB migrations, restart service
#  (copy the updated code folder to /opt/PSH before running)
#
#  Usage:  sudo bash /opt/PSH/scripts/update.sh
#          (run from anywhere inside the app folder)
# ================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

step() { echo -e "\n${GREEN}${BOLD}━━━ $1 ━━━${NC}"; }
info() { echo -e "  ${BLUE}→ $1${NC}"; }
ok()   { echo -e "  ${GREEN}✓ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${NC}"; }
die()  { echo -e "\n${RED}${BOLD}ERROR: $1${NC}" >&2; exit 1; }

[[ $EUID -ne 0 ]] && die "Run as root:  sudo bash /opt/PSH/scripts/update.sh"

# ── App directory — always /opt/PSH regardless of where script is called from ──
APP_DIR="/opt/PSH"

[[ -f "${APP_DIR}/package.json" ]] || die "package.json not found in ${APP_DIR} — run the install script first"
[[ -f "${APP_DIR}/.env" ]]         || die ".env not found in ${APP_DIR} — run the install script first"

# ── Detect owner and binaries ────────────────────────────────────
APP_DIR_OWNER="$(stat -c '%U' "${APP_DIR}")"
[[ "${APP_DIR_OWNER}" == "root" ]] && APP_DIR_OWNER="ubuntu"

NODE_BIN="$(which node 2>/dev/null)" || die "node not found in PATH"
NPM_BIN="$(which npm  2>/dev/null)"  || die "npm not found in PATH"

SERVICE_NAME="servit"

echo -e "\n${BOLD}  SERV-IT Update${NC}"
echo -e "  App dir  : ${APP_DIR}"
echo -e "  Run as   : ${APP_DIR_OWNER}"
echo -e "  Node     : $(${NODE_BIN} --version)"

cd "${APP_DIR}"

# ════════════════════════════════════════════════════════════════
step "1 / 4  npm install — sync any new dependencies"
# ════════════════════════════════════════════════════════════════
sudo -u "${APP_DIR_OWNER}" bash -c "
  export HOME=$(eval echo ~${APP_DIR_OWNER})
  cd '${APP_DIR}'
  ${NPM_BIN} run install:all 2>&1
" | tail -6
ok "Dependencies up to date"

# ════════════════════════════════════════════════════════════════
step "2 / 4  Build React client"
# ════════════════════════════════════════════════════════════════

# Ensure swap exists (Vite needs ~1.5 GB; small instances have no swap)
if [[ "$(swapon --show | wc -l)" -le 1 ]]; then
  info "Creating 2 GB swap file for build..."
  SWAP_FILE="/swapfile"
  if fallocate -l 2G "${SWAP_FILE}" 2>/dev/null || dd if=/dev/zero of="${SWAP_FILE}" bs=1M count=2048 status=none; then
    chmod 600 "${SWAP_FILE}"
    mkswap "${SWAP_FILE}" > /dev/null
    swapon "${SWAP_FILE}"
    grep -q "${SWAP_FILE}" /etc/fstab || echo "${SWAP_FILE} none swap sw 0 0" >> /etc/fstab
    ok "Swap enabled (2 GB)"
  else
    warn "Could not create swap — build may fail on low-memory instances"
  fi
fi

sudo -u "${APP_DIR_OWNER}" bash -c "
  export HOME=$(eval echo ~${APP_DIR_OWNER})
  export NODE_OPTIONS='--max-old-space-size=1536'
  cd '${APP_DIR}'
  ${NPM_BIN} run build:client 2>&1
" | tail -5
ok "Client built"

# ════════════════════════════════════════════════════════════════
step "3 / 4  Database migrations"
# ════════════════════════════════════════════════════════════════
# Read DB credentials from .env
DB_URL="$(grep '^DATABASE_URL=' "${APP_DIR}/.env" | cut -d= -f2-)"
DB_USER="$(echo "${DB_URL}" | sed 's|.*://\([^:]*\):.*|\1|')"
DB_PASS="$(echo "${DB_URL}" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')"
DB_HOST="$(echo "${DB_URL}" | sed 's|.*@\([^:/]*\)[:/].*|\1|')"
DB_PORT="$(echo "${DB_URL}" | sed 's|.*:\([0-9]*\)/.*|\1|')"
DB_NAME="$(echo "${DB_URL}" | sed 's|.*/\([^?]*\).*|\1|')"

info "Applying schema migrations to ${DB_NAME}..."
PGPASSWORD="${DB_PASS}" psql \
  -U "${DB_USER}" -h "${DB_HOST}" -p "${DB_PORT}" -d "${DB_NAME}" \
  -f "${APP_DIR}/database/schema.sql" \
  -v ON_ERROR_STOP=0 \
  --quiet 2>&1 | grep -v "^$\|NOTICE\|already exists" || true
ok "Schema migrations applied"

# ════════════════════════════════════════════════════════════════
step "4 / 4  Restart service"
# ════════════════════════════════════════════════════════════════
if systemctl is-active --quiet "${SERVICE_NAME}"; then
  systemctl restart "${SERVICE_NAME}"
  ok "Service '${SERVICE_NAME}' restarted"
else
  systemctl start "${SERVICE_NAME}"
  ok "Service '${SERVICE_NAME}' started"
fi

sleep 2

# ── Quick health check ───────────────────────────────────────────
PORT="$(grep '^PORT=' "${APP_DIR}/.env" | cut -d= -f2 | tr -d ' ')"
PORT="${PORT:-5000}"

API_CODE="$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://127.0.0.1:${PORT}/api/auth/me" 2>/dev/null || echo "000")"
HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "http://127.0.0.1" 2>/dev/null || echo "000")"

echo ""
if [[ "${API_CODE}" == "200" || "${API_CODE}" == "401" ]] && \
   [[ "${HTTP_CODE}" == "200" || "${HTTP_CODE}" == "301" || "${HTTP_CODE}" == "302" ]]; then
  echo -e "${GREEN}${BOLD}"
  echo "  ╔══════════════════════════════════════╗"
  echo "  ║   ✓  Update complete — app is live   ║"
  echo "  ╚══════════════════════════════════════╝"
  echo -e "${NC}"
  SERVER_IP="$(curl -s --max-time 4 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || hostname -I | awk '{print $1}')"
  echo -e "  ${BOLD}URL :${NC}  https://${SERVER_IP}"
  echo -e "  ${BOLD}API :${NC}  HTTP ${API_CODE}  |  Port 80: HTTP ${HTTP_CODE}"
else
  echo -e "${YELLOW}${BOLD}"
  echo "  ╔══════════════════════════════════════╗"
  echo "  ║  ⚠  Update done — check app status  ║"
  echo "  ╚══════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "  Port 80 : HTTP ${HTTP_CODE}"
  echo -e "  API     : HTTP ${API_CODE}"
  echo ""
  echo "  Diagnose:"
  echo "    systemctl status ${SERVICE_NAME}"
  echo "    journalctl -u ${SERVICE_NAME} -n 30"
fi
echo ""
