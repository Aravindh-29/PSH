#!/bin/bash
# ================================================================
#  SERV-IT / PSH — COMPLETE UNINSTALL SCRIPT
#
#  Removes everything created/installed by scripts/install.sh:
#    - PSH application: /opt/PSH
#    - systemd service: servit.service
#    - Nginx SERV-IT configuration
#    - SERV-IT SSL certificate
#    - SERV-IT credentials file
#    - PostgreSQL database + user
#    - Node.js / npm
#    - NodeSource repository
#    - PostgreSQL (packages + data)
#    - Nginx
#    - Certbot
#    - 2 GB /swapfile created by installer
#
#  WARNING: Do NOT run if this server has other applications
#  using PostgreSQL or Nginx — this removes the packages entirely.
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
die()  { echo -e "\n${RED}${BOLD}ERROR: $1${NC}" >&2; exit 1; }

[[ $EUID -ne 0 ]] && die "Run as root: sudo bash $0"

# ── Config — must match install.sh ──────────────────────────────
APP_DIR="/opt/PSH"
DB_NAME="psh_db"
DB_USER="psh_user"
SERVICE_NAME="servit"
NGINX_CONF="servit"
SSL_DIR="/etc/ssl/servit"
CRED_FILE="/root/servit-credentials.txt"
SWAP_FILE="/swapfile"

# ── Confirmation ─────────────────────────────────────────────────
echo ""
echo -e "${RED}${BOLD}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║        SERV-IT / PSH COMPLETE UNINSTALL             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "${YELLOW}${BOLD}WARNING:${NC} This will permanently remove:"
echo ""
echo "  Application       : ${APP_DIR}"
echo "  Systemd service   : ${SERVICE_NAME}.service"
echo "  Database          : ${DB_NAME}  (all data deleted)"
echo "  DB user           : ${DB_USER}"
echo "  Nginx config      : ${NGINX_CONF}"
echo "  SSL directory     : ${SSL_DIR}"
echo "  Credentials       : ${CRED_FILE}"
echo "  Node.js / npm"
echo "  PostgreSQL (packages + data)"
echo "  Nginx"
echo "  Certbot"
echo "  NodeSource repository"
echo "  ${SWAP_FILE} (if created by installer)"
echo ""
read -r -p "Type DELETE to continue: " CONFIRM
[[ "${CONFIRM}" != "DELETE" ]] && { echo ""; warn "Uninstall cancelled."; exit 0; }
echo ""; ok "Confirmation received."

# ════════════════════════════════════════════════════════════════
step "1 / 10 — Stop SERV-IT systemd service"
# ════════════════════════════════════════════════════════════════
if systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE_NAME}.service"; then
  systemctl stop    "${SERVICE_NAME}" 2>/dev/null || true
  systemctl disable "${SERVICE_NAME}" 2>/dev/null || true
  ok "SERV-IT service stopped and disabled"
else
  info "SERV-IT service not found"
fi

# ════════════════════════════════════════════════════════════════
step "2 / 10 — Remove systemd service file"
# ════════════════════════════════════════════════════════════════
if [[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]]; then
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  systemctl reset-failed "${SERVICE_NAME}" 2>/dev/null || true
  ok "Removed ${SERVICE_NAME}.service"
else
  info "Systemd service file not found"
fi

# ════════════════════════════════════════════════════════════════
step "3 / 10 — Remove PSH application"
# ════════════════════════════════════════════════════════════════
for DIR in "${APP_DIR}" "/opt/servit"; do
  if [[ -d "${DIR}" ]]; then
    rm -rf "${DIR}"
    ok "Removed ${DIR}"
  fi
done
[[ -f "${CRED_FILE}" ]] && { shred -u "${CRED_FILE}" 2>/dev/null || rm -f "${CRED_FILE}"; ok "Removed credentials file"; }

# ════════════════════════════════════════════════════════════════
step "4 / 10 — Drop PostgreSQL database and role"
# ════════════════════════════════════════════════════════════════
if command -v psql >/dev/null 2>&1 && systemctl is-active --quiet postgresql 2>/dev/null; then
  sudo -u postgres psql -v ON_ERROR_STOP=0 -c "DROP DATABASE IF EXISTS ${DB_NAME};" >/dev/null 2>&1 || true
  ok "Database ${DB_NAME} dropped"
  sudo -u postgres psql -v ON_ERROR_STOP=0 -c "DROP ROLE IF EXISTS ${DB_USER};"     >/dev/null 2>&1 || true
  ok "PostgreSQL role ${DB_USER} dropped"
else
  info "PostgreSQL not running — skipping DB drop (will be removed with package anyway)"
fi

# ════════════════════════════════════════════════════════════════
step "5 / 10 — Remove Nginx SERV-IT configuration"
# ════════════════════════════════════════════════════════════════
rm -f "/etc/nginx/sites-enabled/${NGINX_CONF}"  && ok "Removed enabled Nginx site"   || true
rm -f "/etc/nginx/sites-available/${NGINX_CONF}" && ok "Removed Nginx site config"    || true
[[ -d "${SSL_DIR}" ]] && { rm -rf "${SSL_DIR}"; ok "Removed SSL directory: ${SSL_DIR}"; }

# ════════════════════════════════════════════════════════════════
step "6 / 10 — Remove Certbot"
# ════════════════════════════════════════════════════════════════
if dpkg -l 2>/dev/null | grep -qE '^ii\s+(certbot|python3-certbot-nginx)\s'; then
  systemctl stop certbot.timer    2>/dev/null || true
  systemctl disable certbot.timer 2>/dev/null || true
  apt-get purge -y certbot python3-certbot-nginx 2>/dev/null || true
  ok "Certbot removed"
else
  info "Certbot not installed"
fi

# ════════════════════════════════════════════════════════════════
step "7 / 10 — Remove Node.js and NodeSource"
# ════════════════════════════════════════════════════════════════
if command -v node >/dev/null 2>&1; then
  info "Removing Node.js $(node --version)..."
  apt-get purge -y nodejs 2>/dev/null || true
  ok "Node.js removed"
else
  info "Node.js not installed"
fi
rm -f /etc/apt/sources.list.d/nodesource.list \
      /etc/apt/sources.list.d/nodesource.sources \
      /usr/share/keyrings/nodesource.gpg \
      /usr/share/keyrings/nodesource-keyring.gpg
ok "NodeSource repository configuration removed"

# ════════════════════════════════════════════════════════════════
step "8 / 10 — Remove Nginx"
# ════════════════════════════════════════════════════════════════
if dpkg -l 2>/dev/null | grep -qE '^ii\s+nginx'; then
  systemctl stop    nginx 2>/dev/null || true
  systemctl disable nginx 2>/dev/null || true
  apt-get purge -y nginx nginx-common nginx-core 2>/dev/null || true
  ok "Nginx removed"
else
  info "Nginx not installed"
fi
# Clean up leftover nginx dirs/configs
rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default 2>/dev/null || true
rmdir /etc/nginx/sites-enabled  2>/dev/null || true
rmdir /etc/nginx/sites-available 2>/dev/null || true

# ════════════════════════════════════════════════════════════════
step "9 / 10 — Remove PostgreSQL (packages + data)"
# ════════════════════════════════════════════════════════════════
if command -v psql >/dev/null 2>&1 || dpkg -l 2>/dev/null | grep -qE '^ii\s+postgresql'; then
  systemctl stop     postgresql 2>/dev/null || true
  systemctl disable  postgresql 2>/dev/null || true
  apt-get purge -y postgresql 'postgresql-*' libpq-dev 2>/dev/null || true
  ok "PostgreSQL packages removed"
else
  info "PostgreSQL not installed"
fi
# Remove all PostgreSQL data (all versions)
rm -rf /var/lib/postgresql /var/log/postgresql /etc/postgresql
ok "PostgreSQL data directories removed"

# ════════════════════════════════════════════════════════════════
step "10 / 10 — Remove installer swap file"
# ════════════════════════════════════════════════════════════════
if grep -qE "^${SWAP_FILE}[[:space:]]" /etc/fstab 2>/dev/null; then
  sed -i "\|^${SWAP_FILE}[[:space:]]|d" /etc/fstab
  info "Removed ${SWAP_FILE} from /etc/fstab"
fi
if swapon --show 2>/dev/null | grep -q "^${SWAP_FILE}"; then
  swapoff "${SWAP_FILE}" 2>/dev/null || true
fi
if [[ -f "${SWAP_FILE}" ]]; then
  rm -f "${SWAP_FILE}"
  ok "Removed ${SWAP_FILE}"
else
  info "${SWAP_FILE} not found — skipping"
fi

# ════════════════════════════════════════════════════════════════
step "APT cleanup"
# ════════════════════════════════════════════════════════════════
apt-get autoremove -y
apt-get autoclean  -y
ok "APT cleanup completed"

systemctl daemon-reload
systemctl reset-failed 2>/dev/null || true

# ════════════════════════════════════════════════════════════════
step "FINAL VERIFICATION"
# ════════════════════════════════════════════════════════════════
echo ""
[[ ! -d "${APP_DIR}" ]]                                  && ok "PSH application removed"            || warn "PSH directory still exists"
[[ ! -f "/etc/systemd/system/${SERVICE_NAME}.service" ]] && ok "SERV-IT systemd service removed"    || warn "SERV-IT service file still exists"
[[ ! -f "/etc/nginx/sites-available/${NGINX_CONF}" ]]    && ok "SERV-IT Nginx config removed"       || warn "Nginx SERV-IT config still exists"
[[ ! -d "${SSL_DIR}" ]]                                  && ok "SSL certificate removed"             || warn "SSL directory still exists"
[[ ! -f "${CRED_FILE}" ]]                                && ok "Credentials file removed"            || warn "Credentials file still exists"
[[ ! -f "${SWAP_FILE}" ]]                                && ok "Installer swap removed"              || warn "Swap file still exists"
command -v node >/dev/null 2>&1                          && warn "Node.js still present: $(node --version)" || ok "Node.js removed"
command -v psql >/dev/null 2>&1                          && warn "psql still present"                || ok "PostgreSQL removed"

echo ""
echo -e "${GREEN}${BOLD}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║             UNINSTALL COMPLETED                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "  /opt/PSH, servit.service, psh_db, Node.js,"
echo "  PostgreSQL, Nginx, Certbot and swap have been removed."
echo ""
echo "  To reinstall from scratch:"
echo "    git clone https://github.com/Aravindh-29/PSH.git /opt/PSH"
echo "    sudo bash /opt/PSH/scripts/install.sh"
echo ""
