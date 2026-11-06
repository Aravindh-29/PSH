#!/bin/bash
# Fresh Ubuntu installation, or safe repair/resume of an existing installation.
# Optional: sudo SERVIT_DOMAIN=servit.example.com bash scripts/install.sh
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
APP_DIR="${SERVIT_APP_DIR:-/opt/PSH}"
SERVICE_NAME="${SERVIT_SERVICE_NAME:-servit}"
REPO_URL="${SERVIT_REPO_URL:-https://github.com/Aravindh-29/PSH.git}"
APP_OWNER="${SERVIT_APP_USER:-${SUDO_USER:-ubuntu}}"
if [[ "$APP_OWNER" == root ]]; then APP_OWNER=ubuntu; fi
if [[ -n "${SERVIT_DOMAIN:-}" && ! "$SERVIT_DOMAIN" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$ ]]; then echo 'Invalid SERVIT_DOMAIN.' >&2; exit 1; fi
export DEBIAN_FRONTEND=noninteractive
# Existing installations avoid unnecessary OS/package changes.
NEED_PACKAGES=0
for tool in curl git openssl nginx psql pg_dump make g++ python3 flock; do command -v "$tool" >/dev/null || NEED_PACKAGES=1; done
if [[ $NEED_PACKAGES -eq 1 ]]; then
  apt-get -o DPkg::Lock::Timeout=120 update
  apt-get -o DPkg::Lock::Timeout=120 install -y curl git openssl ca-certificates gnupg build-essential python3 postgresql postgresql-contrib nginx
fi
if ! command -v node >/dev/null || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<20||(a===20&&b<6))process.exit(1)' ; then
  curl -fsSL --retry 3 https://deb.nodesource.com/setup_20.x | bash -
  apt-get -o DPkg::Lock::Timeout=120 install -y nodejs
fi
command -v npm >/dev/null
if ! id "$APP_OWNER" >/dev/null 2>&1; then useradd --create-home --shell /bin/bash "$APP_OWNER"; fi
APP_GROUP="$(id -gn "$APP_OWNER")"
if [[ ! -f "$APP_DIR/package.json" ]]; then
  install -d -o "$APP_OWNER" -g "$APP_GROUP" "$APP_DIR"
  sudo -H -u "$APP_OWNER" -- git clone "$REPO_URL" "$APP_DIR"
fi
APP_DIR="$(realpath "$APP_DIR")"
source "$APP_DIR/scripts/deploy-common.sh"
# Preserve all existing environment values, including encryption/session keys.
# Persist fresh credentials before provisioning DB resources so interruptions can resume.
if [[ ! -f "$APP_DIR/.env" ]]; then
  systemctl enable --now postgresql
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='psh_db'" 2>/dev/null | grep -q 1; then
    echo 'psh_db already exists but .env is missing. Restore its original .env before installing; existing credentials will not be reset.' >&2
    exit 1
  fi
  touch "$APP_DIR/.servit-install-pending"
  SESSION_SECRET="$(openssl rand -hex 32)"
  EMAIL_KEY="$(openssl rand -base64 32)"
  DB_PASSWORD="$(openssl rand -hex 24)"
  PUBLIC_HOST="${SERVIT_DOMAIN:-$(hostname -I | awk '{print $1}')}"
  cat > "$APP_DIR/.env" <<EOF
NODE_ENV=production
PORT=${SERVIT_PORT:-5000}
DATABASE_URL=postgresql://psh_user:${DB_PASSWORD}@localhost:5432/psh_db
DATABASE_SSL=false
SESSION_SECRET=${SESSION_SECRET}
EMAIL_ENCRYPTION_KEY=${EMAIL_KEY}
CLIENT_URL=https://${PUBLIC_HOST}
EOF
  chown "$APP_OWNER:$APP_GROUP" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
fi
# Back up the original environment before correcting old root ownership.
install -d -m 700 /var/backups/servit
ENV_BACKUP="$(mktemp /var/backups/servit/install-environment.XXXXXX)"
cp -p "$APP_DIR/.env" "$ENV_BACKUP"
chmod 600 "$ENV_BACKUP"
# Prefer the actual configured service account for repairs.
SERVICE_USER="$(systemctl show "$SERVICE_NAME" --property=User --value 2>/dev/null || true)"
if [[ -n "$SERVICE_USER" ]]; then APP_OWNER="$SERVICE_USER"; APP_GROUP="$(id -gn "$APP_OWNER")"; fi
chown "$APP_OWNER:$APP_GROUP" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"
# Provision only an installation created by this script; repairs leave DB resources intact.
if [[ -f "$APP_DIR/.servit-install-pending" ]]; then
systemctl enable --now postgresql
sudo -H -u "$APP_OWNER" -- node --env-file="$APP_DIR/.env" <<'NODE' | sudo -u postgres psql --set=ON_ERROR_STOP=1
const u = new URL(process.env.DATABASE_URL);
if (!['localhost','127.0.0.1','::1'].includes(u.hostname)) process.exit(0);
const role = decodeURIComponent(u.username), db = decodeURIComponent(u.pathname.slice(1)), pass = decodeURIComponent(u.password);
const literal = value => "'" + value.replace(/'/g, "''") + "'";
console.log("SELECT format('CREATE ROLE %I LOGIN PASSWORD %L',"+literal(role)+","+literal(pass)+") WHERE NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname="+literal(role)+");\n\gexec");
console.log("SELECT format('CREATE DATABASE %I OWNER %I',"+literal(db)+","+literal(role)+") WHERE NOT EXISTS(SELECT 1 FROM pg_database WHERE datname="+literal(db)+");\n\gexec");
NODE
rm -f -- "$APP_DIR/.servit-install-pending"
fi
SERVIT_PORT="$(sudo -H -u "$APP_OWNER" -- node --env-file="$APP_DIR/.env" -e 'const p=Number(process.env.PORT||5000);if(!Number.isInteger(p)||p<1||p>65535)process.exit(1);process.stdout.write(String(p))')"
if [[ -z "${SERVIT_DOMAIN:-}" ]]; then
  SERVIT_DOMAIN="$(sudo -H -u "$APP_OWNER" -- node --env-file="$APP_DIR/.env" -e 'process.stdout.write(new URL(process.env.CLIENT_URL).hostname)')"
fi
export SERVIT_PORT SERVIT_DOMAIN
# Use a real service unit before handing off to the shared, staged updater.
if [[ "$(systemctl show "$SERVICE_NAME" --property=LoadState --value 2>/dev/null || true)" != loaded ]]; then servit_write_service; fi
servit_configure_nginx
# Export explicit settings so a custom installation uses the same paths/account.
export SERVIT_APP_DIR="$APP_DIR" SERVIT_SERVICE_NAME="$SERVICE_NAME" SERVIT_APP_USER="$APP_OWNER"
exec bash "$APP_DIR/scripts/update.sh"
