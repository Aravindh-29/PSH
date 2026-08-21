#!/bin/bash
# ================================================================
#  SERV-IT — Complete Ubuntu Setup Script
#  Installs Node.js, PostgreSQL, Nginx (80/443), clones app,
#  creates .env, builds client, inits DB, registers systemd service
#
#  Ports:
#    80  — HTTP  (Nginx → Node :5000)
#    443 — HTTPS (Nginx + self-signed cert → Node :5000)
#   5000 — Node.js (internal only, not exposed externally)
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
PORT=5000                    # Node.js internal port (not exposed)
NGINX_CONF="servit"
SERVICE_NAME="servit"
NODE_MAJOR="20"
SSL_DIR="/etc/ssl/servit"
CRED_FILE="/root/servit-credentials.txt"

# ── Auto-detect: if script is run from inside the cloned repo ────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/package.json" && -d "${SCRIPT_DIR}/server" && -d "${SCRIPT_DIR}/client" ]]; then
  warn "Repo detected at ${SCRIPT_DIR} — using it instead of cloning"
  APP_DIR="${SCRIPT_DIR}"
fi

# Owner of APP_DIR — npm and service run as this user
APP_DIR_OWNER="$(stat -c '%U' "${APP_DIR}" 2>/dev/null || echo root)"
[[ "${APP_DIR_OWNER}" == "root" ]] && APP_DIR_OWNER="${APP_USER}"

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

# ── Public IP detection ──────────────────────────────────────────
SERVER_IP="$(curl -s --max-time 5 ifconfig.me 2>/dev/null \
  || curl -s --max-time 5 checkip.amazonaws.com 2>/dev/null \
  || curl -s --max-time 5 api.ipify.org 2>/dev/null \
  || hostname -I | awk '{print $1}')"

# Public URLs (no port — Nginx handles 80 and 443)
CLIENT_URL_HTTP="http://${SERVER_IP}"
CLIENT_URL_HTTPS="https://${SERVER_IP}"
CLIENT_URL="${CLIENT_URL_HTTP}"   # used in .env (CORS)

# ── Banner ───────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   SERV-IT — Automated Ubuntu Setup           ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo -e "  Server IP  : ${BOLD}${SERVER_IP}${NC}"
echo -e "  HTTP URL   : ${BOLD}${CLIENT_URL_HTTP}${NC}"
echo -e "  HTTPS URL  : ${BOLD}${CLIENT_URL_HTTPS}${NC}  (self-signed cert)"
echo -e "  App dir    : ${APP_DIR}"
echo -e "  DB         : ${DB_NAME} / ${DB_USER}"
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 1 — System update & prerequisites
# ════════════════════════════════════════════════════════════════
step "1 / 10  System update & prerequisites"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y \
  curl wget git build-essential ca-certificates gnupg openssl \
  libpq-dev nginx 2>&1 | tail -3
ok "System packages ready (including nginx)"

# ════════════════════════════════════════════════════════════════
# STEP 2 — Node.js 20 LTS
# ════════════════════════════════════════════════════════════════
step "2 / 10  Node.js ${NODE_MAJOR} LTS"
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
step "3 / 10  PostgreSQL"
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
step "4 / 10  App user: ${APP_USER}"
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
step "5 / 10  Repository"
if [[ "${APP_DIR}" == "${SCRIPT_DIR}" ]]; then
  ok "Already inside cloned repo at ${APP_DIR} — skipping clone"
elif [[ -d "${APP_DIR}/.git" ]]; then
  warn "Repo already exists at ${APP_DIR} — pulling latest changes"
  git -C "${APP_DIR}" pull origin main 2>&1 | tail -3
else
  info "Cloning ${REPO_URL} → ${APP_DIR}"
  git clone "${REPO_URL}" "${APP_DIR}" 2>&1 | tail -5
  ok "Repository cloned"
fi
chown -R "${APP_DIR_OWNER}:${APP_DIR_OWNER}" "${APP_DIR}"

# ════════════════════════════════════════════════════════════════
# STEP 6 — Database
# ════════════════════════════════════════════════════════════════
step "6 / 10  Database setup"

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

if sudo -u postgres psql -tAc \
    "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  ok "Database '${DB_NAME}' already exists — skipping"
else
  sudo -u postgres psql -c \
    "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" > /dev/null
  ok "Database '${DB_NAME}' created"
fi

sudo -u postgres psql -c \
  "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};" > /dev/null
ok "Privileges granted"

# ════════════════════════════════════════════════════════════════
# STEP 7 — Write .env
# ════════════════════════════════════════════════════════════════
step "7 / 10  Writing .env"
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
chown "${APP_DIR_OWNER}:${APP_DIR_OWNER}" "${APP_DIR}/.env"
chmod 600 "${APP_DIR}/.env"
ok ".env written (permissions: 600)"

# ════════════════════════════════════════════════════════════════
# STEP 8 — Install dependencies, build client, init DB schema
# ════════════════════════════════════════════════════════════════
step "8 / 10  npm install + build + database schema"

info "Running as user: ${APP_DIR_OWNER}"

info "Installing server and client dependencies..."
sudo -u "${APP_DIR_OWNER}" bash -c "
  export HOME=$(eval echo ~${APP_DIR_OWNER})
  cd '${APP_DIR}'
  ${NPM_BIN} run install:all 2>&1
" | tail -8
ok "Dependencies installed"

info "Building React client..."
sudo -u "${APP_DIR_OWNER}" bash -c "
  export HOME=$(eval echo ~${APP_DIR_OWNER})
  cd '${APP_DIR}'
  ${NPM_BIN} run build:client 2>&1
" | tail -5
ok "Client built"

info "Running database schema initialisation..."
sudo -u "${APP_DIR_OWNER}" bash -c "
  export HOME=$(eval echo ~${APP_DIR_OWNER})
  export DATABASE_URL='postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}'
  export NODE_ENV=production
  export SESSION_SECRET='${SESSION_SECRET}'
  export CLIENT_URL='${CLIENT_URL}'
  export PORT='${PORT}'
  export DATABASE_SSL=false
  export NODE_PATH='${APP_DIR}/server/node_modules'
  cd '${APP_DIR}/server'
  ${NODE_BIN} ../database/init.js 2>&1
"
ok "Database schema ready"

# ════════════════════════════════════════════════════════════════
# STEP 9 — Nginx reverse proxy (port 80 + 443)
# ════════════════════════════════════════════════════════════════
step "9 / 10  Nginx — ports 80 (HTTP) and 443 (HTTPS)"

# ── Generate self-signed SSL certificate (10-year) ──────────────
info "Generating self-signed SSL certificate..."
mkdir -p "${SSL_DIR}"
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout "${SSL_DIR}/servit.key" \
  -out    "${SSL_DIR}/servit.crt" \
  -subj "/C=US/ST=State/L=City/O=SERV-IT/CN=${SERVER_IP}" \
  2>/dev/null
chmod 600 "${SSL_DIR}/servit.key"
ok "Self-signed certificate generated (${SSL_DIR})"
info "Tip: replace with a Let's Encrypt cert for a real domain → sudo certbot --nginx"

# ── Write Nginx site config ──────────────────────────────────────
info "Writing Nginx config..."
cat > "/etc/nginx/sites-available/${NGINX_CONF}" << 'NGINXEOF'
# ── HTTP — redirect all traffic to HTTPS ───────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name _;

    # Allow Let's Encrypt challenge files through
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# ── HTTPS — proxy to Node.js on :5000 ──────────────────────────
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name _;

    ssl_certificate     /etc/ssl/servit/servit.crt;
    ssl_certificate_key /etc/ssl/servit/servit.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    # Max upload size (match app's 25 MB attachment limit + overhead)
    client_max_body_size 30M;

    # Proxy to Node.js
    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # Pass real client info to Node.js
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
    }
}
NGINXEOF

# ── Enable site, remove default, reload ─────────────────────────
ln -sf "/etc/nginx/sites-available/${NGINX_CONF}" \
       "/etc/nginx/sites-enabled/${NGINX_CONF}"

# Disable default Nginx page if still enabled
rm -f /etc/nginx/sites-enabled/default

# Validate config before reloading
nginx -t 2>&1 || die "Nginx config test failed — check /etc/nginx/sites-available/${NGINX_CONF}"

systemctl enable nginx
systemctl restart nginx

if systemctl is-active --quiet nginx; then
  ok "Nginx running — listening on ports 80 and 443"
else
  warn "Nginx did not start cleanly — check: journalctl -u nginx -n 20"
fi

# ── Certbot prompt ───────────────────────────────────────────────
CERTBOT_DOMAIN=""
echo ""
echo -e "${BOLD}────────────────────────────────────────────────────────${NC}"
echo -e "  ${BOLD}SSL Certificate Setup${NC}"
echo -e "  Currently using a self-signed cert (browser will warn)."
echo -e "  If you have a domain pointing to this server you can"
echo -e "  get a free trusted certificate from Let's Encrypt now."
echo -e "${BOLD}────────────────────────────────────────────────────────${NC}"
echo ""
read -r -p "  Want to configure a trusted SSL certificate (Let's Encrypt)? [y/N]: " CERT_CHOICE

if [[ "${CERT_CHOICE,,}" == "y" ]]; then
  echo ""
  read -r -p "  Enter your domain name (e.g. servit.company.com): " CERTBOT_DOMAIN
  CERTBOT_DOMAIN="${CERTBOT_DOMAIN// /}"   # strip any spaces

  if [[ -z "${CERTBOT_DOMAIN}" ]]; then
    warn "No domain entered — skipping Let's Encrypt, keeping self-signed cert"
  else
    echo ""
    echo -e "  ${YELLOW}Important: DNS for '${CERTBOT_DOMAIN}' must already point to ${SERVER_IP}${NC}"
    echo -e "  ${YELLOW}If DNS is not set up yet, certbot will fail. You can run it later:${NC}"
    echo -e "  ${YELLOW}  sudo certbot --nginx -d ${CERTBOT_DOMAIN}${NC}"
    echo ""
    read -r -p "  DNS is ready — proceed with certificate? [y/N]: " DNS_READY

    if [[ "${DNS_READY,,}" == "y" ]]; then
      info "Installing certbot..."
      apt-get install -y certbot python3-certbot-nginx 2>&1 | tail -3
      ok "Certbot installed"

      info "Requesting Let's Encrypt certificate for ${CERTBOT_DOMAIN}..."
      if certbot --nginx -d "${CERTBOT_DOMAIN}" --non-interactive --agree-tos \
          --register-unsafely-without-email --redirect 2>&1; then
        ok "Let's Encrypt certificate issued for ${CERTBOT_DOMAIN}"

        # Update CLIENT_URL in .env to use the real domain
        CLIENT_URL_HTTPS="https://${CERTBOT_DOMAIN}"
        CLIENT_URL="${CLIENT_URL_HTTPS}"
        sed -i "s|^CLIENT_URL=.*|CLIENT_URL=${CLIENT_URL}|" "${APP_DIR}/.env"
        ok "CLIENT_URL updated in .env → ${CLIENT_URL}"

        # Enable auto-renewal via systemd timer (installed by certbot)
        systemctl enable certbot.timer 2>/dev/null || true
        ok "Auto-renewal enabled (certbot.timer)"

        info "Reloading Nginx with new certificate..."
        systemctl reload nginx
        ok "Nginx reloaded"

        CLIENT_URL_HTTPS="https://${CERTBOT_DOMAIN}"
        CLIENT_URL_HTTP="http://${CERTBOT_DOMAIN}"
      else
        warn "Certbot failed — keeping self-signed certificate"
        warn "Check DNS for '${CERTBOT_DOMAIN}' and retry: sudo certbot --nginx -d ${CERTBOT_DOMAIN}"
      fi
    else
      warn "Skipping certbot for now — keeping self-signed cert"
      info "Run later: sudo certbot --nginx -d ${CERTBOT_DOMAIN}"
    fi
  fi
else
  info "Keeping self-signed certificate — browser will show a security warning"
  info "Run later: sudo certbot --nginx -d yourdomain.com"
fi
echo ""

# ════════════════════════════════════════════════════════════════
# STEP 10 — Systemd service (Node.js on :5000 internal)
# ════════════════════════════════════════════════════════════════
step "10 / 10  Systemd service: ${SERVICE_NAME}"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=SERV-IT Ticketing System
Documentation=https://github.com/Aravindh-29/PSH
After=network.target postgresql.service nginx.service
Wants=postgresql.service

[Service]
Type=simple
User=${APP_DIR_OWNER}
Group=${APP_DIR_OWNER}
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

sleep 4
if systemctl is-active --quiet "${SERVICE_NAME}"; then
  ok "Service '${SERVICE_NAME}' is running on internal port ${PORT}"
else
  warn "Service did not start cleanly — check: journalctl -u ${SERVICE_NAME} -n 50"
fi

# ── Save credentials to file ─────────────────────────────────────
cat > "${CRED_FILE}" << EOF
╔══════════════════════════════════════════════════╗
  SERV-IT — Credentials  ($(date '+%Y-%m-%d %H:%M'))
╚══════════════════════════════════════════════════╝

HTTP URL       : ${CLIENT_URL_HTTP}   (redirects to HTTPS)
HTTPS URL      : ${CLIENT_URL_HTTPS}  (self-signed cert)
App directory  : ${APP_DIR}
Service name   : ${SERVICE_NAME}

─── AWS Security Group — required inbound rules ────
Port 80   (HTTP)   — 0.0.0.0/0
Port 443  (HTTPS)  — 0.0.0.0/0
Port 5000 is internal only — do NOT expose in security group

─── Database ───────────────────────────────────────
Host           : localhost:5432
Database       : ${DB_NAME}
User           : ${DB_USER}
Password       : ${DB_PASS}

─── App ────────────────────────────────────────────
Session secret : ${SESSION_SECRET}
.env path      : ${APP_DIR}/.env

─── SSL Certificate ────────────────────────────────
$(if [[ -n "${CERTBOT_DOMAIN}" ]]; then
  echo "Type           : Let's Encrypt (trusted, auto-renews)"
  echo "Domain         : ${CERTBOT_DOMAIN}"
  echo "Auto-renewal   : systemctl status certbot.timer"
else
  echo "Type           : Self-signed (10 years, browser will warn)"
  echo "Certificate    : ${SSL_DIR}/servit.crt"
  echo "Private key    : ${SSL_DIR}/servit.key"
  echo "Upgrade tip    : sudo certbot --nginx -d yourdomain.com"
fi)

─── Default admin login ────────────────────────────
Username       : admin
Password       : Admin@123
  ⚠ Change this password immediately after first login!

─── Useful commands ────────────────────────────────
App status  : systemctl status ${SERVICE_NAME}
App logs    : journalctl -u ${SERVICE_NAME} -f
App restart : systemctl restart ${SERVICE_NAME}
Nginx status: systemctl status nginx
Nginx logs  : tail -f /var/log/nginx/error.log
Nginx reload: systemctl reload nginx
EOF
chmod 600 "${CRED_FILE}"

# ── Final summary ────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║      SERV-IT setup complete!                 ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}HTTP  (auto-redirects):${NC}  ${BLUE}${CLIENT_URL_HTTP}${NC}"
echo -e "  ${BOLD}HTTPS:${NC}                   ${BLUE}${CLIENT_URL_HTTPS}${NC}"
echo -e "  ${BOLD}Default login:${NC}           admin / Admin@123"
echo ""
if [[ -n "${CERTBOT_DOMAIN}" ]]; then
  echo -e "  ${GREEN}✓  Trusted SSL certificate installed for ${CERTBOT_DOMAIN}${NC}"
  echo -e "  ${GREEN}   Auto-renewal is enabled via certbot.timer${NC}"
else
  echo -e "  ${YELLOW}⚠  Self-signed cert — browser will warn → click Advanced → Proceed${NC}"
  echo -e "  ${YELLOW}   To get a trusted cert:  sudo certbot --nginx -d yourdomain.com${NC}"
fi
echo ""
echo -e "  ${BOLD}AWS Security Group — open these ports:${NC}"
echo -e "    Port 80  (HTTP)  — 0.0.0.0/0"
echo -e "    Port 443 (HTTPS) — 0.0.0.0/0"
echo -e "    ${YELLOW}Do NOT expose port 5000 externally${NC}"
echo ""
echo -e "  ${BOLD}Service commands:${NC}"
echo -e "    systemctl status  ${SERVICE_NAME}"
echo -e "    journalctl -u ${SERVICE_NAME} -f"
echo -e "    systemctl restart ${SERVICE_NAME}"
echo -e "    systemctl reload  nginx"
echo ""
echo -e "  ${BOLD}Credentials saved to:${NC} ${CRED_FILE}"
echo ""
echo -e "${YELLOW}  ⚠  Change the admin password after first login!${NC}"
echo ""
