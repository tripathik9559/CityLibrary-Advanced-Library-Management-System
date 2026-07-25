#!/usr/bin/env bash
# =====================================================================
# Library Management System — Database Restore Script
#
# Restores a .sql.gz backup produced by backup_db.sh.
#
# Usage:
#   ./restore_db.sh backups/library_management_system_2026-07-24_02-00-00.sql.gz
# =====================================================================
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <path-to-backup.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-library_admin}"
DB_PASSWORD="${DB_PASSWORD:-Library@2026}"
DB_NAME="${DB_NAME:-library_management_system}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "This will OVERWRITE all data in database '${DB_NAME}'. Press Ctrl+C to cancel, or Enter to continue."
read -r _

echo "[$(date)] Restoring ${BACKUP_FILE} into ${DB_NAME}..."
gunzip -c "${BACKUP_FILE}" | mysql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  "${DB_NAME}"

echo "[$(date)] Restore complete."
