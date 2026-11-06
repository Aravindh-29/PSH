#!/bin/bash
# Exercises update ordering/failure handling without a service, root or live DB.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEMP="$(mktemp -d)"
trap 'rm -rf -- "$TEMP"' EXIT
export TEST_DEPLOY_LOG="$TEMP/steps"
export SERVIT_APP_DIR="$TEMP/app" SERVIT_BACKUP_DIR="$TEMP/backups"
mkdir -p "$SERVIT_APP_DIR/client" "$SERVIT_APP_DIR/server/scripts" "$SERVIT_APP_DIR/database"
printf '{}\n' > "$SERVIT_APP_DIR/package.json"
printf 'CUSTOM_SETTING=keep\n' > "$SERVIT_APP_DIR/.env"
# Only the test copy skips root and redirects the global lock.
sed -e '/^\[\[ \$EUID /d' -e "s|/var/lock/servit-update.lock|$TEMP/update.lock|" "$ROOT/scripts/update.sh" > "$TEMP/update.sh"
sudo() { while [[ "$1" != '--' ]]; do shift; done; shift; "$@"; }
systemctl() { printf 'service:%s\n' "$1" >> "$TEST_DEPLOY_LOG"; }
flock() { :; }
chown() { :; }
chmod() { :; }
install() { mkdir -p "${@: -1}"; }
pg_dump() { :; }
env() { shift; "$@"; }
npm() {
  echo 'npm' >> "$TEST_DEPLOY_LOG"
  if [[ "$1" == exec ]]; then
    while [[ "$1" != --outDir ]]; do shift; done; shift
    mkdir -p "$1"; printf 'new UI' > "$1/index.html"
  fi
}
node() {
  printf 'node:%s:%s\n' "$1" "${2:-}" >> "$TEST_DEPLOY_LOG"
  if [[ "$1" == database/migrate.js && "$TEST_FAIL" == migration ]]; then return 1; fi
  if [[ "${2:-}" == "$TEST_FAIL" ]]; then return 1; fi
  if [[ "${2:-}" == backup ]]; then printf 'mock dump' > "$3"; fi
}
export -f sudo systemctl flock chown chmod install pg_dump env npm node
for CASE in success backup migration health; do
  export TEST_FAIL="$CASE"
  : > "$TEST_DEPLOY_LOG"
  mkdir -p "$SERVIT_APP_DIR/client/dist"; echo 'old UI' > "$SERVIT_APP_DIR/client/dist/index.html"
  if bash "$TEMP/update.sh" > "$TEMP/output" 2>&1; then
    [[ "$CASE" == success ]] || { cat "$TEMP/output"; exit 1; }
    grep -q 'Application and database are healthy' "$TEMP/output"
    grep -q 'new UI' "$SERVIT_APP_DIR/client/dist/index.html"
  else
    [[ "$CASE" != success ]] || { cat "$TEMP/output"; exit 1; }
    ! grep -q 'Update completed' "$TEMP/output"
    if [[ "$CASE" == backup || "$CASE" == migration ]]; then
      ! grep -q 'service:start' "$TEST_DEPLOY_LOG"
      grep -q 'old UI' "$SERVIT_APP_DIR/client/dist/index.html"
    fi
    if [[ "$CASE" == backup ]]; then ! grep -q 'database/migrate.js' "$TEST_DEPLOY_LOG"; fi
  fi
  echo "PASS: update $CASE path"
done
echo '4 deployment orchestration scenarios passed (mock services and commands).'
