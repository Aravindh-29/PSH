#!/bin/bash
# Validate fresh, resume and existing-install flows without system changes.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEMP="$(mktemp -d)"
trap 'rm -rf -- "$TEMP"' EXIT
sudo() { while [[ "$1" == -* ]]; do case "$1" in -u) shift 2;; --) shift; break;; *) shift;; esac; done; "$@"; }
systemctl() { if [[ "$1" == show && "$*" == *property=User* && "$TEST_CASE" == existing ]]; then echo fixture-user; fi; if [[ "$1" == show && "$*" == *property=LoadState* && "$TEST_CASE" == existing ]]; then echo loaded; fi; return 0; }
id() { if [[ "${1:-}" == -gn ]]; then echo fixture-group; fi; return 0; }
chown() { :; }; chmod() { :; }; apt-get() { :; }; useradd() { :; }
install() { mkdir -p "${@: -1}"; }
node() {
  if [[ "$1" == --env-file=* ]]; then
    if [[ "${3:-}" == *'Number(process.env.PORT'* ]]; then printf 5000
    elif [[ "${3:-}" == *'new URL(process.env.CLIENT_URL)'* ]]; then printf servit.example.com
    else cat >/dev/null; echo 'SELECT 1;'; fi
  fi
  return 0
}
psql() { if [[ "${1:-}" == -tAc ]]; then [[ "$TEST_CASE" != missing-env ]] || echo 1; else cat >> "$TEST_INSTALL_LOG"; fi; return 0; }
openssl() { printf 'disposable-test-secret\n'; }
nginx() { :; }; pg_dump() { :; }; flock() { :; }
export -f sudo systemctl id chown chmod apt-get useradd install node psql openssl nginx pg_dump flock
for CASE in fresh existing resume missing-env; do
  export TEST_CASE="$CASE" SERVIT_APP_DIR="$TEMP/$CASE/app" SERVIT_APP_USER=fixture-user SERVIT_DOMAIN=servit.example.com TEST_INSTALL_LOG="$TEMP/$CASE/log"
  mkdir -p "$SERVIT_APP_DIR/scripts"; : > "$TEST_INSTALL_LOG"; echo '{}' > "$SERVIT_APP_DIR/package.json"
  cat > "$SERVIT_APP_DIR/scripts/deploy-common.sh" <<'COMMON'
servit_write_service() { echo unit >> "$TEST_INSTALL_LOG"; }
servit_configure_nginx() { echo nginx >> "$TEST_INSTALL_LOG"; }
COMMON
  printf '#!/bin/bash\necho update >> "$TEST_INSTALL_LOG"\n' > "$SERVIT_APP_DIR/scripts/update.sh"
  if [[ "$CASE" == existing || "$CASE" == resume ]]; then echo 'CUSTOM_SETTING=preserve' > "$SERVIT_APP_DIR/.env"; fi
  if [[ "$CASE" == resume ]]; then touch "$SERVIT_APP_DIR/.servit-install-pending"; fi
  sed -e '/^\[\[ \$EUID /d' -e "s|/var/backups/servit|$TEMP/$CASE/backups|g" "$ROOT/scripts/install.sh" > "$TEMP/install.sh"
  if bash "$TEMP/install.sh" > "$TEMP/output" 2>&1; then
    [[ "$CASE" != missing-env ]] || { cat "$TEMP/output"; exit 1; }
    grep -q update "$TEST_INSTALL_LOG"
    if [[ "$CASE" == existing || "$CASE" == resume ]]; then [[ "$(cat "$SERVIT_APP_DIR/.env")" == CUSTOM_SETTING=preserve ]]; else grep -q '^EMAIL_ENCRYPTION_KEY=' "$SERVIT_APP_DIR/.env"; fi
    [[ ! -f "$SERVIT_APP_DIR/.servit-install-pending" ]]
  else
    [[ "$CASE" == missing-env ]] || { cat "$TEMP/output"; exit 1; }
    [[ ! -f "$SERVIT_APP_DIR/.env" ]]
    ! grep -q update "$TEST_INSTALL_LOG"
  fi
  echo "PASS: installer $CASE flow"
done
echo '4 installer scenarios passed (mock provisioning/services).'
