#!/bin/bash
# Mocked service/command tests; never modifies a live app, DB or systemd unit.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEMP="$(mktemp -d)"
trap 'rm -rf -- "$TEMP"' EXIT
sudo() { while [[ "$1" != '--' ]]; do shift; done; shift; "$@"; }
systemctl() {
  printf 'service:%s\n' "$1" >> "$TEST_DEPLOY_LOG"
  if [[ "$1" == show && "$*" == *property=User* ]]; then echo fixture-service-user; fi
  if [[ "$1" == show && "$*" == *property=LoadState* ]]; then echo loaded; fi
  return 0
}
id() { if [[ "${1:-}" == -gn ]]; then echo fixture-group; fi; return 0; }
flock() { :; }
chown() { printf 'owner:%s\n' "$*" >> "$TEST_DEPLOY_LOG"; }
chmod() { :; }
install() { mkdir -p "${@: -1}"; }
pg_dump() { :; }
nginx() { :; }
env() { while [[ "$1" == *=* ]]; do export "$1"; shift; done; "$@"; }
npm() {
  echo npm >> "$TEST_DEPLOY_LOG"
  if [[ "$1" == --prefix ]]; then
    [[ "$TEST_FAIL" != dependencies ]] || return 1
    mkdir -p "$2/node_modules"; echo 'new deps' > "$2/node_modules/version"
  else
    [[ "$TEST_FAIL" != build ]] || return 1
    mkdir -p dist; echo 'new UI' > dist/index.html
  fi
}
node() {
  printf 'node:%s:%s\n' "$1" "${2:-}" >> "$TEST_DEPLOY_LOG"
  if [[ "$1" == */database/migrate.js && "$TEST_FAIL" == migration ]]; then return 1; fi
  if [[ "${2:-}" == "$TEST_FAIL" ]]; then return 1; fi
  if [[ "${2:-}" == backup ]]; then printf 'mock dump' > "$3"; fi
  return 0
}
mv() {
  if [[ "$TEST_FAIL" == publish && "$1" == "$SERVIT_APP_DIR"/.update-build.*/client/dist && "$1" != */previous/* && "$2" == "$SERVIT_APP_DIR/client/dist" ]]; then return 1; fi
  command mv "$@"
}
export -f sudo systemctl id flock chown chmod install pg_dump nginx env npm node mv
for CASE in success dependencies build prepare-env backup migration publish health; do
  export TEST_FAIL="$CASE" SERVIT_APP_DIR="$TEMP/$CASE/app" SERVIT_BACKUP_DIR="$TEMP/$CASE/backups" TEST_DEPLOY_LOG="$TEMP/$CASE/steps"
  mkdir -p "$SERVIT_APP_DIR"; : > "$TEST_DEPLOY_LOG"
  for relative in server/node_modules client/node_modules node_modules client/dist server/src server/scripts database scripts; do mkdir -p "$SERVIT_APP_DIR/$relative"; done
  for relative in server client ''; do printf '{}\n' > "$SERVIT_APP_DIR/${relative:+$relative/}package.json"; printf '{}\n' > "$SERVIT_APP_DIR/${relative:+$relative/}package-lock.json"; done
  for relative in server/node_modules client/node_modules node_modules; do echo 'old deps' > "$SERVIT_APP_DIR/$relative/version"; done
  echo 'old UI' > "$SERVIT_APP_DIR/client/dist/index.html"
  echo 'CUSTOM_SETTING=keep' > "$SERVIT_APP_DIR/.env"
  echo '# mock common helpers' > "$SERVIT_APP_DIR/scripts/deploy-common.sh"
  # Only the test copy skips root and redirects the global lock.
  sed -e '/^\[\[ \$EUID /d' -e "s|/var/lock/servit-update.lock|$TEMP/update.lock|" "$ROOT/scripts/update.sh" > "$TEMP/update.sh"
  if bash "$TEMP/update.sh" > "$TEMP/output" 2>&1; then
    [[ "$CASE" == success ]] || { cat "$TEMP/output"; exit 1; }
    grep -q 'Application and database are healthy' "$TEMP/output"
    grep -q 'new UI' "$SERVIT_APP_DIR/client/dist/index.html"
    for relative in server/node_modules client/node_modules node_modules; do grep -q 'new deps' "$SERVIT_APP_DIR/$relative/version"; done
  else
    [[ "$CASE" != success ]] || { cat "$TEMP/output"; exit 1; }
    ! grep -q 'Update completed' "$TEMP/output"
    grep -q 'old UI' "$SERVIT_APP_DIR/client/dist/index.html"
    for relative in server/node_modules client/node_modules node_modules; do grep -q 'old deps' "$SERVIT_APP_DIR/$relative/version"; done
    if [[ "$CASE" == dependencies || "$CASE" == build || "$CASE" == prepare-env ]]; then ! grep -q 'service:stop' "$TEST_DEPLOY_LOG"; fi
    if [[ "$CASE" == backup ]]; then ! grep -q '/database/migrate.js' "$TEST_DEPLOY_LOG"; fi
    if [[ "$CASE" == health || "$CASE" == publish || "$CASE" == migration || "$CASE" == backup ]]; then grep -q 'service:start' "$TEST_DEPLOY_LOG"; fi
  fi
  grep -q 'owner:fixture-service-user:fixture-group .env' "$TEST_DEPLOY_LOG"
  echo "PASS: staged update $CASE path and service-account ownership"
done
echo '8 deployment orchestration scenarios passed (mock services and commands).'
