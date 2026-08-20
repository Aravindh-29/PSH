#!/bin/bash
# ================================================================
#  SERV-IT — Complete Ubuntu Setup Script
#  Installs Node.js, PostgreSQL, clones app, creates .env,
#  builds client, inits DB, registers systemd service on port 5000
#
#  Usage:  sudo bash install-nodejs-and-postgres.sh
# ================================================================

set -euo pipefail

# ── Colour helpers ───────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
step() { echo -e "\n${GREEN}${BOLD}━━━ STEP $1 ━━━${NC}"; }
info() { echo -e "  ${BLUE}→ $1${NC}"; }
ok()   { echo -e "  ${GREEN}✓ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${NC}"; }
die()  { echo -e "\n${RED}${BOLD}ERROR: $1${NC}" >&2; exit 1; }

# ── Must run as root ─────────────────────────────────────────────
[[ $EUID -ne 0 ]] && die "Run this script as root:  sudo bash $0"

# ── Fixed configuration ──────────────────────────────────────────
APP_USER="servit"
APP_DIR="/opt/servit"
REPO_URL="https://github.com/Aravindh-29/PSH.git"
DB_NAME="psh_db"
DB_USER="psh_user"
PORT=5000
SERVICE_NAME="servit"
NODE_MAJOR="20"
CRED_FILE="/root/servit-credentials.txt"

# ── Generate secrets (preserved if .env already exists) ──────────
NEW_DB_PASS="$(openssl rand -hex 16)"
NEW_SESSION_SECRET="$(openssl rand -hex 32)"

if [[ -f "${APP_DIR}/.env" ]]; then
  warn "Existing .env found — reusing DB password and session secret"
  DB_PASS="$(grep '^DATABASE_URL=' "${APP_DIR}/.env" \
    | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')"
  SESSION_SECRET="$(grep '^SESSION_SECRET=' "${APP_DIR}/.env" \
    | cut -d= -f2-)"
  [[ -z "${DB_PASS}" ]]         && DB_PASS="${NEW_DB_PASS}"
  [[ -z "${SESSION_SECRET}" ]]  && SESSION_SECRET="${NEW_SESSION_SECRET}"
else
  DB_PASS="${NEW_DB_PASS}"
  SESSION_SECRET="${NEW_SESSION_SECRET}"
fi

SERVER_IP="$(hostname -I | awk '{print $1}')"
CLIENT_URL="http://${SERVER_IP}:${PORT}"

# ── Banner ───────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   SERV-IT — Automated Ubuntu Setup           ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo -e "  Server IP  : ${BOLD}${SERVER_IP}${NC}"
echo -e "  App URL    : ${BOLD}${CLIENT_URL}${NC}"
echo -e "  App dir    : ${APP_DIR}"
echo -e "  DB         : ${DB_NAME} / ${DB_USER}"
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 1 — System update & prerequisites
# ════════════════════════════════════════════════════════════════
step "1 / 9  System update & prerequisites"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  curl wget git build-essential ca-certificates gnupg openssl \
  libpq-dev 2>&1 | tail -3
ok "System packages ready"

# ════════════════════════════════════════════════════════════════
# STEP 2 — Node.js 20 LTS
# ════════════════════════════════════════════════════════════════
step "2 / 9  Node.js ${NODE_MAJOR} LTS"
NEED_NODE=true
if command -v node &>/dev/null; then
  CURRENT_MAJOR="$(node -v | cut -d. -f1 | tr -d 'v')"
  if [[ "${CURRENT_MAJOR}" == "${NODE_MAJOR}" ]]; then
    NEED_NODE=false
    ok "Node.js $(node -v) already installed — skipping"
  fi
fi
if [[ "${NEED_NODE}" == "true" ]]; then
  info "Downloading NodeSource setup script..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - 2>&1 | tail -5
  apt-get install -y nodejs 2>&1 | tail -3
  ok "Node.js $(node -v) installed"
fi
NODE_BIN="$(which node)"
NPM_BIN="$(which npm)"
info "node: ${NODE_BIN}  npm: ${NPM_BIN}"

# ════════════════════════════════════════════════════════════════
# STEP 3 — PostgreSQL
# ════════════════════════════════════════════════════════════════
step "3 / 9  PostgreSQL"
if ! command -v psql &>/dev/null; then
  apt-get install -y postgresql postgresql-contrib 2>&1 | tail -3
  ok "PostgreSQL installed"
else
  ok "PostgreSQL already installed — skipping"
fi
systemctl enable postgresql
systemctl start postgresql
ok "PostgreSQL service running"

# ════════════════════════════════════════════════════════════════
# STEP 4 — App system user
# ════════════════════════════════════════════════════════════════
step "4 / 9  App user: ${APP_USER}"
if ! id "${APP_USER}" &>/dev/null; then
  useradd --system --create-home --shell /bin/bash \
    --comment "SERV-IT application user" "${APP_USER}"
  ok "User '${APP_USER}' created"
else
  ok "User '${APP_USER}' already exists — skipping"
fi

# ════════════════════════════════════════════════════════════════
# STEP 5 — Clone repository
# ════════════════════════════════════════════════════════════════
step "5 / 9  Repository"
if [[ -d "${APP_DIR}/.git" ]]; then
  warn "Repo already cloned — pulling latest changes"
  git -C "${APP_DIR}" pull origin main 2>&1 | tail -3
else
  info "Cloning ${REPO_URL} → ${APP_DIR}"
  git clone "${REPO_URL}" "${APP_DIR}" 2>&1 | tail -5
  ok "Repository cloned"
fi
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

# ════════════════════════════════════════════════════════════════
# STEP 6 — Database
# ════════════════════════════════════════════════════════════════
step "6 / 9  Database setup"

# Create role
if sudo -u postgres psql -tAc \
    "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  info "Role '${DB_USER}' exists — updating password"
  sudo -u postgres psql -c \
    "ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';" > /dev/null
else
  sudo -u postgres psql -c \
    "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';" > /dev/null
  ok "DB role '${DB_USER}' created"
fi

# Create database
if sudo -u postgres psql -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  ok "Database '${DB_NAME}' already exists — skipping"
else
  sudo -u postgres psql -c \
    "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" > /dev/null
  ok "Database '${DB_NAME}' created"
fi

# Ensure full privileges
sudo -u postgres psql -c \
  "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" > /dev/null
ok "Privileges granted"

# ════════════════════════════════════════════════════════════════
# STEP 7 — Write .env
# ════════════════════════════════════════════════════════════════
step "7 / 9  Writing .env"
cat > "${APP_DIR}/.env" << EOF
NODE_ENV=production
PORT=${PORT}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
SESSION_SECRET=${SESSION_SECRET}
CLIENT_URL=${CLIENT_URL}
DATABASE_SSL=false

# ── SSO (optional) ────────────────────────────────────────────
# Configure via Admin → SSO in the app — no env vars needed.
# Uncomment below only if you prefer env-var-based SSO config.
# SSO_ISSUER_URL=
# SSO_CLIENT_ID=
# SSO_CLIENT_SECRET=
# SSO_REDIRECT_URI=
# SSO_PROVIDER_NAME=
# SSO_AUTO_PROVISION=false
EOF
chown "${APP_USER}:${APP_USER}" "${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"
ok ".env written (permissions: 600)"

# ════════════════════════════════════════════════════════════════
# STEP 8 — Install dependencies, build client, init DB schema
# ════════════════════════════════════════════════════════════════
step "8 / 9  npm install + build + database schema"

info "Installing server and client dependencies..."
sudo -u "${APP_USER}" bash -c "
  export HOME=/home/${APP_USER}
  cd ${APP_DIR}
  ${NPM_BIN} run install:all 2>&1
" | tail -8
ok "Dependencies installed"

info "Building React client..."
sudo -u "${APP_USER}" bash -c "
  export HOME=/home/${APP_USER}
  cd ${APP_DIR}
  ${NPM_BIN} run build:client 2>&1
" | tail -5
ok "Client built"

info "Running database schema initialisation..."
# Export env vars so the init script can connect
export NODE_ENV=production
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"
export SESSION_SECRET="${SESSION_SECRET}"
export CLIENT_URL="${CLIENT_URL}"
export PORT="${PORT}"
export DATABASE_SSL=false

sudo -u "${APP_USER}" bash -c "
  export HOME=/home/${APP_USER}
  export DATABASE_URL='postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}'
  export NODE_ENV=production
  cd ${APP_DIR}
  ${NPM_BIN} run db:init 2>&1
"
ok "Database schema ready"

# ════════════════════════════════════════════════════════════════
# STEP 9 — Systemd service
# ════════════════════════════════════════════════════════════════
step "9 / 9  Systemd service: ${SERVICE_NAME}"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=SERV-IT Ticketing System
Documentation=https://github.com/Aravindh-29/PSH
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${NODE_BIN} server/src/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

# Wait a few seconds and verify
sleep 4
if systemctl is-active --quiet "${SERVICE_NAME}"; then
  ok "Service '${SERVICE_NAME}' is running"
else
  warn "Service did not start cleanly — check: journalctl -u ${SERVICE_NAME} -n 50"
fi

# ── Save credentials to file ─────────────────────────────────────
cat > "${CRED_FILE}" << EOF
╔══════════════════════════════════════════════════╗
  SERV-IT — Credentials  ($(date '+%Y-%m-%d %H:%M'))
╚══════════════════════════════════════════════════╝

App URL        : ${CLIENT_URL}
App directory  : ${APP_DIR}
Service name   : ${SERVICE_NAME}

─── Database ───────────────────────────────────────
Host           : localhost:5432
Database       : ${DB_NAME}
User           : ${DB_USER}
Password       : ${DB_PASS}

─── App ────────────────────────────────────────────
Session secret : ${SESSION_SECRET}
.env path      : ${APP_DIR}/.env

─── Default admin login ────────────────────────────
Username       : admin
Password       : Admin@123
  ⚠ Change this password immediately after first login!

─── Useful commands ────────────────────────────────
Status  : systemctl status ${SERVICE_NAME}
Logs    : journalctl -u ${SERVICE_NAME} -f
Restart : systemctl restart ${SERVICE_NAME}
Stop    : systemctl stop ${SERVICE_NAME}
EOF
chmod 600 "${CRED_FILE}"

# ── Final summary ────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║      SERV-IT setup complete!                 ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Open in browser:${NC}   ${BLUE}${CLIENT_URL}${NC}"
echo -e "  ${BOLD}Default login:${NC}     admin / Admin@123"
echo ""
echo -e "  ${BOLD}Service commands:${NC}"
echo -e "    systemctl status  ${SERVICE_NAME}"
echo -e "    journalctl -u ${SERVICE_NAME} -f"
echo -e "    systemctl restart ${SERVICE_NAME}"
echo ""
echo -e "  ${BOLD}Credentials saved to:${NC} ${CRED_FILE}"
echo ""
echo -e "${YELLOW}  ⚠  Change the admin password after first login!${NC}"
echo ""
