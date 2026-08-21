#!/bin/bash
# ================================================================
#  SERV-IT / PSH — Health Check Script
#
#  Checks system health, disk usage, services, logs, and confirms
#  no files are unexpectedly consuming large amounts of disk.
#
#  Usage:  sudo bash /opt/PSH/scripts/healthcheck.sh
# ================================================================

APP_DIR="/opt/PSH"
DB_NAME="psh_db"
DB_USER="psh_user"
SERVICE_NAME="servit"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; CYAN='\033[0;36m'; NC='\033[0m'

section() { echo -e "\n${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}${BOLD}  $1${NC}"; echo -e "${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
ok()      { echo -e "  ${GREEN}✓ $1${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }
bad()     { echo -e "  ${RED}✗ $1${NC}"; }
info()    { echo -e "  ${BLUE}→ $1${NC}"; }
row()     { printf "  %-30s %s\n" "$1" "$2"; }

echo ""
echo -e "${BOLD}  SERV-IT / PSH — System Health Check${NC}"
echo -e "  $(date '+%Y-%m-%d %H:%M:%S %Z')"

# ════════════════════════════════════════════════════════════════
section "1. SERVICES"
# ════════════════════════════════════════════════════════════════

check_service() {
  local name="$1" label="$2"
  if systemctl is-active --quiet "${name}" 2>/dev/null; then
    local since
    since=$(systemctl show "${name}" -p ActiveEnterTimestamp --value 2>/dev/null | cut -d' ' -f1-4)
    ok "${label} is RUNNING  (since ${since})"
  elif systemctl list-unit-files 2>/dev/null | grep -q "^${name}.service"; then
    bad "${label} is STOPPED"
  else
    warn "${label} not installed"
  fi
}

check_service "${SERVICE_NAME}" "SERV-IT app"
check_service "postgresql"      "PostgreSQL"
check_service "nginx"           "Nginx"

# App port check
if ss -tlnp 2>/dev/null | grep -q ':5000 '; then
  ok "App port 5000 is listening"
elif command -v netstat >/dev/null 2>&1 && netstat -tlnp 2>/dev/null | grep -q ':5000 '; then
  ok "App port 5000 is listening"
else
  bad "App port 5000 is NOT listening"
fi

# HTTP health probe
if command -v curl >/dev/null 2>&1; then
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/health 2>/dev/null || echo "000")
  if [[ "${HTTP_CODE}" == "200" ]]; then
    ok "HTTP /api/health → 200 OK"
  else
    warn "HTTP /api/health → ${HTTP_CODE} (service may be starting)"
  fi
fi

# ════════════════════════════════════════════════════════════════
section "2. MEMORY & SWAP"
# ════════════════════════════════════════════════════════════════

# RAM
TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
USED_MEM=$(free  -m | awk '/^Mem:/{print $3}')
FREE_MEM=$(free  -m | awk '/^Mem:/{print $4}')
AVAIL_MEM=$(free -m | awk '/^Mem:/{print $7}')
MEM_PCT=$(( USED_MEM * 100 / TOTAL_MEM ))

row "RAM total:"     "${TOTAL_MEM} MB"
row "RAM used:"      "${USED_MEM} MB  (${MEM_PCT}%)"
row "RAM available:" "${AVAIL_MEM} MB"
if (( MEM_PCT >= 90 )); then
  bad "RAM usage is CRITICAL (${MEM_PCT}%)"
elif (( MEM_PCT >= 75 )); then
  warn "RAM usage is HIGH (${MEM_PCT}%)"
else
  ok "RAM usage is healthy (${MEM_PCT}%)"
fi

# Swap
SWAP_TOTAL=$(free -m | awk '/^Swap:/{print $2}')
SWAP_USED=$( free -m | awk '/^Swap:/{print $3}')
if (( SWAP_TOTAL > 0 )); then
  SWAP_PCT=$(( SWAP_USED * 100 / SWAP_TOTAL ))
  row "Swap total:"  "${SWAP_TOTAL} MB"
  row "Swap used:"   "${SWAP_USED} MB  (${SWAP_PCT}%)"
  if (( SWAP_USED > 500 )); then
    warn "Swap usage is high — RAM may be under pressure"
  else
    ok "Swap usage is normal"
  fi
else
  warn "No swap configured (Vite builds may fail on low-RAM instances)"
fi

# ════════════════════════════════════════════════════════════════
section "3. DISK USAGE"
# ════════════════════════════════════════════════════════════════

echo ""
df -h --output=source,fstype,size,used,avail,pcent,target 2>/dev/null | \
  grep -v tmpfs | grep -v udev | \
  awk 'NR==1{printf "  %-20s %-8s %6s %6s %6s %5s  %s\n",$1,$2,$3,$4,$5,$6,$7} NR>1{printf "  %-20s %-8s %6s %6s %6s %5s  %s\n",$1,$2,$3,$4,$5,$6,$7}'
echo ""

# Warn on high disk usage
while IFS= read -r line; do
  PCT=$(echo "${line}" | awk '{print $6}' | tr -d '%')
  MNT=$(echo "${line}" | awk '{print $7}')
  if (( PCT >= 90 )); then
    bad "Disk at ${MNT} is ${PCT}% full — CRITICAL"
  elif (( PCT >= 75 )); then
    warn "Disk at ${MNT} is ${PCT}% full — consider cleanup"
  fi
done < <(df -h --output=source,fstype,size,used,avail,pcent,target 2>/dev/null | grep -v tmpfs | grep -v udev | tail -n +2)

# ════════════════════════════════════════════════════════════════
section "4. TOP DISK CONSUMERS"
# ════════════════════════════════════════════════════════════════

echo ""
info "Largest directories under / (excluding /proc, /sys, /dev):"
du -sh /var /opt /home /root /tmp /usr /etc 2>/dev/null | sort -rh | head -10 | awk '{printf "  %s\t%s\n", $1, $2}'

echo ""
info "Largest items under /var (logs, databases, apt cache):"
du -sh /var/* 2>/dev/null | sort -rh | head -10 | awk '{printf "  %s\t%s\n", $1, $2}'

echo ""
info "PSH app directory size:"
if [[ -d "${APP_DIR}" ]]; then
  du -sh "${APP_DIR}" 2>/dev/null | awk '{printf "  %s\t%s\n", $1, $2}'
  du -sh "${APP_DIR}/node_modules" 2>/dev/null | awk '{printf "  %s\t%s (node_modules)\n", $1, $2}' || true
  du -sh "${APP_DIR}/client/dist"  2>/dev/null | awk '{printf "  %s\t%s (client build)\n", $1, $2}'  || true
else
  info "${APP_DIR} not found"
fi

# ════════════════════════════════════════════════════════════════
section "5. LOG FILES"
# ════════════════════════════════════════════════════════════════

# App logs (Winston logs to stdout → systemd journal)
info "SERV-IT app logs go to systemd journal (not disk files)."
info "View with:  sudo journalctl -u servit -n 50 --no-pager"
echo ""

# Journal disk usage
JOURNAL_SIZE=$(journalctl --disk-usage 2>/dev/null | grep -oE '[0-9.]+ [A-Z]?B' || echo "unknown")
row "systemd journal size:" "${JOURNAL_SIZE}"
if journalctl --disk-usage 2>/dev/null | grep -qE '[0-9]+G'; then
  warn "Journal is over 1 GB — consider: sudo journalctl --vacuum-size=200M"
else
  ok "Journal size is normal"
fi

# Nginx logs
echo ""
info "Nginx log sizes:"
for f in /var/log/nginx/access.log /var/log/nginx/error.log; do
  if [[ -f "${f}" ]]; then
    SIZE=$(du -sh "${f}" 2>/dev/null | cut -f1)
    row "  ${f}:" "${SIZE}"
  fi
done

# PostgreSQL logs
echo ""
info "PostgreSQL log sizes:"
if [[ -d /var/log/postgresql ]]; then
  du -sh /var/log/postgresql/* 2>/dev/null | sort -rh | head -5 | awk '{printf "  %s\t%s\n", $1, $2}' || info "No PostgreSQL log files"
else
  info "No PostgreSQL log directory"
fi

# Any large .log files anywhere
echo ""
info "Large .log files on the system (>10 MB):"
FOUND=0
while IFS= read -r f; do
  SIZE=$(du -sh "${f}" 2>/dev/null | cut -f1)
  warn "${f}  (${SIZE})"
  FOUND=1
done < <(find /var/log /opt /root /home -name "*.log" -size +10M 2>/dev/null)
(( FOUND == 0 )) && ok "No large log files found (>10 MB)"

# ════════════════════════════════════════════════════════════════
section "6. DATABASE"
# ════════════════════════════════════════════════════════════════

if command -v psql >/dev/null 2>&1 && systemctl is-active --quiet postgresql 2>/dev/null; then
  # DB size
  DB_SIZE=$(sudo -u postgres psql -tAc "SELECT pg_size_pretty(pg_database_size('${DB_NAME}'));" 2>/dev/null || echo "unknown")
  row "Database ${DB_NAME} size:" "${DB_SIZE}"
  ok "PostgreSQL is reachable"

  # Table row counts
  echo ""
  info "Table row counts:"
  sudo -u postgres psql -d "${DB_NAME}" -tAc "
    SELECT
      schemaname || '.' || relname AS table_name,
      n_live_tup AS live_rows
    FROM pg_stat_user_tables
    ORDER BY n_live_tup DESC;
  " 2>/dev/null | while IFS='|' read -r tbl rows; do
    printf "  %-30s %s rows\n" "${tbl}" "${rows}"
  done || true
else
  warn "PostgreSQL is not running — cannot check DB stats"
fi

# ════════════════════════════════════════════════════════════════
section "7. RECENT APP ERRORS (last 20 lines)"
# ════════════════════════════════════════════════════════════════

if systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE_NAME}.service"; then
  ERROR_COUNT=$(journalctl -u "${SERVICE_NAME}" --since "1 hour ago" --no-pager -q 2>/dev/null | grep -ci 'error\|warn\|fail' || echo 0)
  if (( ERROR_COUNT > 0 )); then
    warn "${ERROR_COUNT} error/warn entries in the last hour — showing last 20 log lines:"
    echo ""
    journalctl -u "${SERVICE_NAME}" -n 20 --no-pager --output=short 2>/dev/null | sed 's/^/  /'
  else
    ok "No errors/warnings in app logs in the last hour"
    echo ""
    info "Last 5 log lines:"
    journalctl -u "${SERVICE_NAME}" -n 5 --no-pager --output=short 2>/dev/null | sed 's/^/  /' || true
  fi
else
  info "SERV-IT service not installed — no logs to check"
fi

# ════════════════════════════════════════════════════════════════
section "8. SUMMARY"
# ════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}  Quick reference:${NC}"
echo "  ─────────────────────────────────────────────────────"
echo "  App logs (live):    sudo journalctl -u servit -f"
echo "  App logs (errors):  sudo journalctl -u servit -p err --no-pager"
echo "  Clear journal:      sudo journalctl --vacuum-size=200M"
echo "  Clear nginx logs:   sudo truncate -s 0 /var/log/nginx/access.log"
echo "  Restart app:        sudo systemctl restart servit"
echo "  DB size:            sudo -u postgres psql -c \"SELECT pg_size_pretty(pg_database_size('psh_db'));\""
echo "  ─────────────────────────────────────────────────────"
echo ""
