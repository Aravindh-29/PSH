#!/bin/bash
# ================================================================
#  SERV-IT — Uninstall / Clean-slate Script
#
#  Removes everything installed by install-nodejs-and-postgres.sh:
#    - systemd service
#    - Nginx config
#    - App directory /opt/PSH  (and /opt/servit if old install)
#    - PostgreSQL database + role
#    - SSL certificates
#    - Swap file (if created by install script)
#    - Credentials file
#
#  Node.js and PostgreSQL packages are kept (they may be shared).
#
#  Usage:  sudo bash /opt/PSH/scripts/uninstall.sh
# ================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

step() { echo -e "\n${GREEN}${BOLD}━━━ $1 ━━━${NC}"; }
info() { echo -e "  ${BLUE}→ $1${NC}"; }
ok()   { echo -e "  ${GREEN}✓ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${NC}"; }

[[ $EUID -ne 0 ]] && { echo -e "${RED}Run as root:  sudo bash uninstall.sh${NC}"; exit 1; }

SERVICE_NAME="servit"
NGINX_CONF="servit"
APP_DIRS=("/opt/PSH" "/opt/servit")   # both old and new paths
DB_NAME="psh_db"
DB_USER="psh_user"
SSL_DIR="/etc/ssl/servit"
CRED_FILE="/root/servit-credentials.txt"
SWAP_FILE="/swapfile"

echo ""
echo -e "${RED}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${RED}${BOLD}║   SERV-IT — Full Uninstall                   ║${NC}"
echo -e "${RED}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}  This will remove:${NC}"
echo    "    • systemd service '${SERVICE_NAME}'"
echo    "    • Nginx config '${NGINX_CONF}'"
echo    "    • App directories: ${APP_DIRS[*]}"
echo    "    • PostgreSQL database '${DB_NAME}' and role '${DB_USER}'"
echo    "    • SSL certs in ${SSL_DIR}"
echo    "    • Swap file ${SWAP_FILE} (if created by install script)"
echo ""
read -r -p "  Continue? [y/N]: " CONFIRM
[[ "${CONFIRM,,}" != "y" ]] && { echo "Aborted."; exit 0; }
echo ""

# ════════════════════════════════════════════════════════════════
step "1 / 6  Stop and remove systemd service"
# ════════════════════════════════════════════════════════════════
if systemctl is-active --quiet "${SERVICE_NAME}" 2>/dev/null; then
  systemctl stop "${SERVICE_NAME}"
  ok "Service stopped"
fi
if systemctl is-enabled --quiet "${SERVICE_NAME}" 2>/dev/null; then
  systemctl disable "${SERVICE_NAME}"
  ok "Service disabled"
fi
if [[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]]; then
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  ok "Service file removed"
else
  warn "Service file not found — skipping"
fi

# ════════════════════════════════════════════════════════════════
step "2 / 6  Remove Nginx config"
# ════════════════════════════════════════════════════════════════
rm -f "/etc/nginx/sites-enabled/${NGINX_CONF}"
rm -f "/etc/nginx/sites-available/${NGINX_CONF}"

# Re-enable default page so Nginx still works
if [[ -f /etc/nginx/sites-available/default ]]; then
  ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default 2>/dev/null || true
fi

if systemctl is-active --quiet nginx 2>/dev/null; then
  nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
  ok "Nginx config removed and reloaded"
else
  ok "Nginx config removed (nginx not running)"
fi

rm -rf "${SSL_DIR}"
ok "SSL certificates removed"

# ════════════════════════════════════════════════════════════════
step "3 / 6  Remove app directories"
# ════════════════════════════════════════════════════════════════
for DIR in "${APP_DIRS[@]}"; do
  if [[ -d "${DIR}" ]]; then
    rm -rf "${DIR}"
    ok "Removed ${DIR}"
  else
    warn "${DIR} not found — skipping"
  fi
done
rm -f "${CRED_FILE}"

# ════════════════════════════════════════════════════════════════
step "4 / 6  Drop PostgreSQL database and role"
# ════════════════════════════════════════════════════════════════
if command -v psql &>/dev/null && systemctl is-active --quiet postgresql 2>/dev/null; then
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${DB_NAME};" 2>/dev/null && ok "Database '${DB_NAME}' dropped" || warn "Could not drop database"
  sudo -u postgres psql -c "DROP ROLE IF EXISTS ${DB_USER};"     2>/dev/null && ok "Role '${DB_USER}' dropped"     || warn "Could not drop role"
else
  warn "PostgreSQL not running — skipping DB cleanup"
  warn "Run manually: sudo -u postgres psql -c 'DROP DATABASE IF EXISTS ${DB_NAME};'"
  warn "              sudo -u postgres psql -c 'DROP ROLE IF EXISTS ${DB_USER};'"
fi

# ════════════════════════════════════════════════════════════════
step "5 / 6  Remove swap file (if created by install script)"
# ════════════════════════════════════════════════════════════════
if [[ -f "${SWAP_FILE}" ]]; then
  swapoff "${SWAP_FILE}" 2>/dev/null || true
  rm -f "${SWAP_FILE}"
  sed -i "\|${SWAP_FILE}|d" /etc/fstab 2>/dev/null || true
  ok "Swap file removed"
else
  warn "Swap file not found — skipping"
fi

# ════════════════════════════════════════════════════════════════
step "6 / 6  Done"
# ════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}${BOLD}  ✓  Uninstall complete — system is clean${NC}"
echo ""
echo "  To reinstall from scratch:"
echo "    git clone https://github.com/Aravindh-29/PSH.git"
echo "    cd PSH"
echo "    sudo bash install-nodejs-and-postgres.sh"
echo ""
