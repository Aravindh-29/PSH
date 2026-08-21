#!/bin/bash
# ================================================================
#  SERV-IT — Nightly PostgreSQL Backup Script
#
#  What it does:
#    1. Dumps the PostgreSQL database using pg_dump
#    2. Compresses the dump with gzip
#    3. Uploads to S3
#    4. Deletes the oldest backup, keeping only the last 5
#    5. Checks disk usage and sends email alerts if high
#
#  Setup:
#    1. Fill in the ── CONFIGURE ── section below
#    2. chmod +x /home/ubuntu/PSH/scripts/backup.sh
#    3. Test manually: sudo bash /home/ubuntu/PSH/scripts/backup.sh
#    4. Schedule with cron: sudo crontab -e
#       Add:  0 1 * * * /home/ubuntu/PSH/scripts/backup.sh >> /var/log/servit-backup.log 2>&1
#
#  Requirements:
#    - aws cli installed       (sudo apt install awscli -y)
#    - EC2 IAM role with S3 write access attached
#    - mailutils for email     (sudo apt install mailutils -y)
# ================================================================

set -euo pipefail

# ── CONFIGURE ───────────────────────────────────────────────────
S3_BUCKET="your-s3-bucket-name"          # ← replace after creating bucket
S3_PREFIX="psh-backups"                  # folder inside the bucket
S3_REGION="us-east-1"                    # ← replace with your bucket region
KEEP_BACKUPS=5                           # number of backups to keep

ALERT_EMAIL="your@email.com"            # ← replace with your email
DISK_WARN_PCT=70                         # send warning email at this %
DISK_CRIT_PCT=80                         # send critical email at this %

APP_DIR="/home/ubuntu/PSH"              # app directory
ENV_FILE="${APP_DIR}/.env"              # path to .env file
BACKUP_DIR="/tmp/servit-backups"        # local temp folder for dumps
LOG_PREFIX="[SERV-IT Backup]"
# ────────────────────────────────────────────────────────────────

TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
BACKUP_FILE="psh_backup_${TIMESTAMP}.sql.gz"
LOCAL_FILE="${BACKUP_DIR}/${BACKUP_FILE}"
S3_KEY="${S3_PREFIX}/${BACKUP_FILE}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "$(date '+%Y-%m-%d %H:%M:%S')  ${LOG_PREFIX} $1"; }
ok()   { echo -e "${GREEN}$(date '+%Y-%m-%d %H:%M:%S')  ${LOG_PREFIX} ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}$(date '+%Y-%m-%d %H:%M:%S')  ${LOG_PREFIX} ⚠ $1${NC}"; }
die()  { echo -e "${RED}$(date '+%Y-%m-%d %H:%M:%S')  ${LOG_PREFIX} ✗ $1${NC}" >&2; send_email "BACKUP FAILED" "$1"; exit 1; }

# ── Send email helper ────────────────────────────────────────────
send_email() {
  local subject="$1"
  local body="$2"
  if command -v mail &>/dev/null && [[ "${ALERT_EMAIL}" != "your@email.com" ]]; then
    echo "${body}" | mail -s "[SERV-IT] ${subject}" "${ALERT_EMAIL}" 2>/dev/null || true
  fi
}

log "══════════════════════════════════════════"
log "  Starting backup: ${TIMESTAMP}"
log "══════════════════════════════════════════"

# ── Step 1: Read database URL from .env ──────────────────────────
log "Reading database credentials from ${ENV_FILE}"
[[ -f "${ENV_FILE}" ]] || die ".env file not found at ${ENV_FILE}"

DATABASE_URL="$(grep '^DATABASE_URL=' "${ENV_FILE}" | cut -d= -f2-)"
[[ -n "${DATABASE_URL}" ]] || die "DATABASE_URL not found in .env"

# Parse the URL: postgresql://user:pass@host:port/dbname
DB_USER="$(echo "${DATABASE_URL}" | sed 's|.*://\([^:]*\):.*|\1|')"
DB_PASS="$(echo "${DATABASE_URL}" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')"
DB_HOST="$(echo "${DATABASE_URL}" | sed 's|.*@\([^:]*\):.*|\1|')"
DB_PORT="$(echo "${DATABASE_URL}" | sed 's|.*:\([0-9]*\)/.*|\1|')"
DB_NAME="$(echo "${DATABASE_URL}" | sed 's|.*/\([^?]*\).*|\1|')"

ok "Database: ${DB_NAME} @ ${DB_HOST}:${DB_PORT}"

# ── Step 2: Create local temp dir ────────────────────────────────
mkdir -p "${BACKUP_DIR}"

# ── Step 3: pg_dump + gzip ───────────────────────────────────────
log "Running pg_dump..."
PGPASSWORD="${DB_PASS}" pg_dump \
  -U "${DB_USER}" \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -d "${DB_NAME}" \
  --no-password \
  --format=plain \
  --verbose \
  2>&1 | gzip > "${LOCAL_FILE}" \
  || die "pg_dump failed for database ${DB_NAME}"

BACKUP_SIZE="$(du -sh "${LOCAL_FILE}" | cut -f1)"
ok "Dump created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ── Step 4: Upload to S3 ─────────────────────────────────────────
log "Uploading to s3://${S3_BUCKET}/${S3_KEY} ..."
aws s3 cp "${LOCAL_FILE}" "s3://${S3_BUCKET}/${S3_KEY}" \
  --region "${S3_REGION}" \
  --storage-class STANDARD_IA \
  || die "S3 upload failed for ${BACKUP_FILE}"

ok "Uploaded to S3 successfully"

# ── Step 5: Keep only latest N backups ───────────────────────────
log "Checking backup count in S3 (keeping latest ${KEEP_BACKUPS})..."

# List all backups sorted oldest-first
EXISTING_BACKUPS="$(aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" \
  --region "${S3_REGION}" \
  | grep '\.sql\.gz' \
  | sort \
  | awk '{print $4}')"

BACKUP_COUNT="$(echo "${EXISTING_BACKUPS}" | grep -c '\.sql\.gz' || echo 0)"
log "Total backups in S3: ${BACKUP_COUNT}"

if [[ "${BACKUP_COUNT}" -gt "${KEEP_BACKUPS}" ]]; then
  DELETE_COUNT=$(( BACKUP_COUNT - KEEP_BACKUPS ))
  log "Deleting ${DELETE_COUNT} old backup(s)..."
  echo "${EXISTING_BACKUPS}" | head -n "${DELETE_COUNT}" | while read -r OLD_FILE; do
    if [[ -n "${OLD_FILE}" ]]; then
      aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}/${OLD_FILE}" --region "${S3_REGION}"
      warn "Deleted old backup: ${OLD_FILE}"
    fi
  done
fi

# ── Step 6: Clean up local temp file ─────────────────────────────
rm -f "${LOCAL_FILE}"
ok "Local temp file removed"

# ── Step 7: Disk usage check & alerts ────────────────────────────
log "Checking disk usage..."
DISK_USAGE="$(df / | tail -1 | awk '{print $5}' | tr -d '%')"
DISK_AVAIL="$(df -h / | tail -1 | awk '{print $4}')"
DISK_TOTAL="$(df -h / | tail -1 | awk '{print $2}')"
log "Disk usage: ${DISK_USAGE}% used (${DISK_AVAIL} free of ${DISK_TOTAL})"

if [[ "${DISK_USAGE}" -ge "${DISK_CRIT_PCT}" ]]; then
  MSG="CRITICAL: Disk is at ${DISK_USAGE}% on your SERV-IT server (${DISK_AVAIL} free of ${DISK_TOTAL}). Increase EBS volume immediately."
  warn "${MSG}"
  send_email "CRITICAL — Disk ${DISK_USAGE}% Full" "${MSG}"
elif [[ "${DISK_USAGE}" -ge "${DISK_WARN_PCT}" ]]; then
  MSG="WARNING: Disk is at ${DISK_USAGE}% on your SERV-IT server (${DISK_AVAIL} free of ${DISK_TOTAL}). Consider increasing EBS volume soon."
  warn "${MSG}"
  send_email "WARNING — Disk ${DISK_USAGE}% Full" "${MSG}"
else
  ok "Disk usage OK: ${DISK_USAGE}%"
fi

# ── Done ──────────────────────────────────────────────────────────
log "══════════════════════════════════════════"
ok "Backup complete: ${BACKUP_FILE} (${BACKUP_SIZE})"
log "Timestamp : ${TIMESTAMP}"
log "S3 path   : s3://${S3_BUCKET}/${S3_KEY}"
log "Disk usage: ${DISK_USAGE}%"
log "══════════════════════════════════════════"

send_email "Backup Successful — ${TIMESTAMP}" \
"SERV-IT nightly backup completed successfully.

File    : ${BACKUP_FILE}
Size    : ${BACKUP_SIZE}
S3 path : s3://${S3_BUCKET}/${S3_KEY}
Disk    : ${DISK_USAGE}% used (${DISK_AVAIL} free of ${DISK_TOTAL})
Kept    : latest ${KEEP_BACKUPS} backups
Time    : ${TIMESTAMP}"
