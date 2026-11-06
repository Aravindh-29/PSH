#!/bin/bash
# Fetch the current code first, then: sudo bash /opt/PSH/scripts/update.sh
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
APP_DIR="$(realpath "${SERVIT_APP_DIR:-/opt/PSH}")"
SERVICE_NAME="${SERVIT_SERVICE_NAME:-servit}"
[[ -f "$APP_DIR/package.json" && -f "$APP_DIR/.env" ]] || { echo "Application or .env missing. Run install.sh first." >&2; exit 1; }
for tool in node npm pg_dump sudo systemctl flock tar; do
  command -v "$tool" >/dev/null || { echo "Required command missing: $tool. Run install.sh to provision prerequisites." >&2; exit 1; }
done
node -e 'if(Number(process.versions.node.split(".")[0])<20)throw Error("Node.js 20 or newer is required")'
exec 9>/var/lock/servit-update.lock
flock -n 9 || { echo "Another SERV-IT update is running." >&2; exit 1; }
source "$APP_DIR/scripts/deploy-common.sh"
# The service account, not the owner of .env, owns runtime files.
APP_OWNER="${SERVIT_APP_USER:-$(systemctl show "$SERVICE_NAME" --property=User --value 2>/dev/null || true)}"
if [[ -z "$APP_OWNER" ]]; then APP_OWNER="$(stat -c '%U' "$APP_DIR")"; fi
if [[ "$APP_OWNER" == root && "$(systemctl show "$SERVICE_NAME" --property=User --value 2>/dev/null || true)" != root ]]; then APP_OWNER="${SUDO_USER:-ubuntu}"; fi
id "$APP_OWNER" >/dev/null
APP_GROUP="$(id -gn "$APP_OWNER")"
as_owner() { sudo -H -u "$APP_OWNER" -- "$@"; }
cd "$APP_DIR"
BACKUP_DIR="${SERVIT_BACKUP_DIR:-/var/backups/servit}/$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -m 700 "$BACKUP_DIR"
cp -p .env "$BACKUP_DIR/environment.before"
chmod 600 "$BACKUP_DIR/environment.before"
chown "$APP_OWNER:$APP_GROUP" .env
chmod 600 .env
# Recover files produced by older updaters which installed/built as root.
for target in server/node_modules client/node_modules node_modules client/dist; do
  if [[ -d "$target" ]]; then chown -R "$APP_OWNER:$APP_GROUP" "$target"; fi
done
WAS_ACTIVE=0; STOPPED=0; BUILD_DIR=''; STAGE=preflight
PUBLISHED=(); BACKED_UP=()
if systemctl is-active --quiet "$SERVICE_NAME"; then WAS_ACTIVE=1; fi
failure() {
  local result=$?
  trap - ERR
  set +e
  if [[ $STOPPED -eq 1 ]]; then
    systemctl stop "$SERVICE_NAME"
    for relative in "${PUBLISHED[@]}"; do
      mkdir -p "$BUILD_DIR/failed/$(dirname "$relative")"
      mv "$APP_DIR/$relative" "$BUILD_DIR/failed/$relative"
    done
    for relative in "${BACKED_UP[@]}"; do mv "$BUILD_DIR/previous/$relative" "$APP_DIR/$relative"; done
    if [[ $WAS_ACTIVE -eq 1 ]]; then systemctl start "$SERVICE_NAME"; fi
  fi
  echo "Update failed during: $STAGE. Backups: $BACKUP_DIR. Staging: $BUILD_DIR." >&2
  echo 'Previous dependencies/UI were restored where available. No automatic database restore was attempted.' >&2
  exit "$result"
}
trap failure ERR
STAGE='staging code and dependencies'
BUILD_DIR="$(mktemp -d "$APP_DIR/.update-build.XXXXXX")"
mkdir -p "$BUILD_DIR/server" "$BUILD_DIR/client"
cp package.json package-lock.json "$BUILD_DIR/"
cp server/package.json server/package-lock.json "$BUILD_DIR/server/"
cp -a server/src server/scripts "$BUILD_DIR/server/"
cp -a database "$BUILD_DIR/"
# Copy client sources without reusing a potentially incomplete node_modules tree.
tar -C client --exclude=node_modules --exclude=dist --exclude='*.log' -cf - . | tar -C "$BUILD_DIR/client" -xf -
chown -R "$APP_OWNER:$APP_GROUP" "$BUILD_DIR"
as_owner npm --prefix "$BUILD_DIR" ci --include=dev --fetch-retries=3
as_owner npm --prefix "$BUILD_DIR/server" ci --omit=dev --fetch-retries=3
as_owner npm --prefix "$BUILD_DIR/client" ci --include=dev --fetch-retries=3
(cd "$BUILD_DIR/server" && as_owner node -e 'require("dotenv"); require("pg"); require("argon2"); import("archiver").then(m=>{if(!m.ZipArchive)throw Error("ZIP module unavailable")})')
STAGE='client build'
(cd "$BUILD_DIR/client" && as_owner env NODE_OPTIONS=--max-old-space-size=1536 npm run build)
STAGE='environment verification'
as_owner env SERVIT_ENV_FILE="$APP_DIR/.env" node "$BUILD_DIR/server/scripts/deployment.js" prepare-env
cp -p .env "$BACKUP_DIR/environment.current"
chmod 600 "$BACKUP_DIR/environment.current"
# Compilation/install failures above leave the current application running.
STAGE='database backup'
STOPPED=1
if [[ "$(systemctl show "$SERVICE_NAME" --property=LoadState --value 2>/dev/null || true)" == loaded ]]; then systemctl stop "$SERVICE_NAME"; fi
SERVIT_ENV_FILE="$APP_DIR/.env" node "$BUILD_DIR/server/scripts/deployment.js" backup "$BACKUP_DIR/database.dump"
STAGE='database migration'
as_owner env SERVIT_ENV_FILE="$APP_DIR/.env" node "$BUILD_DIR/database/migrate.js"
STAGE='publishing verified dependencies and client'
for relative in server/node_modules client/node_modules node_modules client/dist; do
  mkdir -p "$BUILD_DIR/previous/$(dirname "$relative")"
  if [[ -e "$APP_DIR/$relative" ]]; then
    mv "$APP_DIR/$relative" "$BUILD_DIR/previous/$relative"
    BACKED_UP+=("$relative")
  fi
  mv "$BUILD_DIR/$relative" "$APP_DIR/$relative"
  PUBLISHED+=("$relative")
done
if [[ "$(systemctl show "$SERVICE_NAME" --property=LoadState --value 2>/dev/null || true)" != loaded ]]; then servit_write_service; fi
STAGE='service startup and database health check'
systemctl reset-failed "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"
as_owner node server/scripts/deployment.js health
if command -v nginx >/dev/null; then nginx -t; fi
# Keep the former UI with the private DB/environment backup; dependencies can be reinstalled.
if [[ -d "$BUILD_DIR/previous/client/dist" ]]; then mv "$BUILD_DIR/previous/client/dist" "$BACKUP_DIR/client-dist"; fi
STOPPED=0
trap - ERR
if [[ "$(realpath "$BUILD_DIR")" == "$APP_DIR"/.update-build.* ]]; then rm -rf -- "$BUILD_DIR"; fi
printf '\nUpdate completed. Application and database are healthy.\nBackups: %s\n' "$BACKUP_DIR"
