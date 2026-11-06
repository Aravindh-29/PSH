#!/bin/bash
# Update an existing installation after fetching the latest code.
# Usage: cd /opt/PSH && git pull --ff-only origin main && sudo bash scripts/update.sh
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
APP_DIR="${SERVIT_APP_DIR:-/opt/PSH}"
SERVICE_NAME="${SERVIT_SERVICE_NAME:-servit}"
APP_DIR="$(realpath "$APP_DIR")"
[[ -f "$APP_DIR/package.json" && -f "$APP_DIR/.env" ]] || { echo "Application or .env missing." >&2; exit 1; }
for tool in node npm pg_dump sudo systemctl flock; do
  command -v "$tool" >/dev/null || { echo "Required command missing: $tool" >&2; exit 1; }
done
exec 9>/var/lock/servit-update.lock
flock -n 9 || { echo "Another SERV-IT update is running." >&2; exit 1; }
APP_OWNER="$(stat -c '%U' "$APP_DIR/.env")"
id "$APP_OWNER" >/dev/null
as_owner() { sudo -H -u "$APP_OWNER" -- "$@"; }
cd "$APP_DIR"
BACKUP_DIR="${SERVIT_BACKUP_DIR:-/var/backups/servit}/$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -m 700 "$BACKUP_DIR"
cp -p .env "$BACKUP_DIR/environment.before"
chmod 600 "$BACKUP_DIR/environment.before"
BUILD_DIR=''
STAGE='database backup'
trap 'echo "Update failed during: $STAGE. Backups: $BACKUP_DIR. Inspect journalctl -u $SERVICE_NAME. No automatic database restore was attempted." >&2' ERR
# Stop writes before taking a consistent backup and changing dependencies/schema.
systemctl stop "$SERVICE_NAME"
node server/scripts/deployment.js backup "$BACKUP_DIR/database.dump"
STAGE='dependencies'
printf '\nInstalling locked dependencies...\n'
as_owner npm --prefix server ci --omit=dev
as_owner npm --prefix client ci --include=dev
STAGE='environment verification'
as_owner node server/scripts/deployment.js prepare-env
cp -p .env "$BACKUP_DIR/environment.current"
chmod 600 "$BACKUP_DIR/environment.current"
STAGE='client build'
BUILD_DIR="$(mktemp -d "$APP_DIR/.update-build.XXXXXX")"
chown "$APP_OWNER" "$BUILD_DIR"
# Build separately so an unsuccessful build does not replace the current UI.
(cd client && as_owner env NODE_OPTIONS=--max-old-space-size=1536 npm exec -- vite build --outDir "$BUILD_DIR/dist" --emptyOutDir)
STAGE='database migration'
as_owner node database/migrate.js
STAGE='publishing client'
if [[ -d client/dist ]]; then mv client/dist "$BACKUP_DIR/client-dist"; fi
mv "$BUILD_DIR/dist" client/dist
rmdir "$BUILD_DIR"
STAGE='service startup and database health check'
systemctl start "$SERVICE_NAME"
as_owner node server/scripts/deployment.js health
printf '\nUpdate completed. Application and database are healthy.\nBackups: %s\n' "$BACKUP_DIR"
