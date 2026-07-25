#!/usr/bin/env bash
# =====================================================================
# Library Management System — Database Backup Script
#
# Creates a timestamped, compressed mysqldump of the database
# (schema + data + routines + triggers), and prunes backups older
# than RETENTION_DAYS. Intended to be run manually or from cron.
#
# Usage:
#   ./backup_db.sh                     # uses defaults / .env if present
#   DB_PASSWORD=secret ./backup_db.sh  # override via env vars
#
# Example cron entry (daily at 2 AM):
#   0 2 * * * /path/to/scripts/backup_db.sh >> /var/log/lms_backup.log 2>&1
# =====================================================================
set -euo pipefail

# --- Configuration (env vars override these defaults) -----------------
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-library_admin}"
DB_PASSWORD="${DB_PASSWORD:-Library@2026}"
DB_NAME="${DB_NAME:-library_management_system}"
BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
OUT_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup of '${DB_NAME}' -> ${OUT_FILE}"

mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --add-drop-table \
  --default-character-set=utf8mb4 \
  "${DB_NAME}" | gzip > "${OUT_FILE}"

echo "[$(date)] Backup complete: $(du -h "${OUT_FILE}" | cut -f1)"

# --- Prune backups older than RETENTION_DAYS ---------------------------
echo "[$(date)] Pruning backups older than ${RETENTION_DAYS} days in ${BACKUP_DIR}"
find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql.gz" -mtime "+${RETENTION_DAYS}" -print -delete

echo "[$(date)] Done."
