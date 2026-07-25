#!/usr/bin/env bash
# =====================================================================
# Library Management System — One-shot Database Setup
#
# 1. Runs 00_create_database_and_user.sql as an admin user (root)
#    to create the database and the library_admin app user.
# 2. Runs everything else (01_schema.sql .. 06_seed_data.sql) AS
#    library_admin, so library_admin ends up as the DEFINER of every
#    view/function/procedure/trigger (needed for clean mysqldump
#    backups later — see the note in 00_create_database_and_user.sql).
#
# Usage:
#   ./setup_database.sh                  # prompts for the root password
#   MYSQL_ROOT_PASSWORD=xxxx ./setup_database.sh
# =====================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="${SCRIPT_DIR}/../database"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
ROOT_USER="${MYSQL_ROOT_USER:-root}"
APP_USER="${DB_USER:-library_admin}"
APP_PASSWORD="${DB_PASSWORD:-Library@2026}"
DB_NAME="${DB_NAME:-library_management_system}"

echo "== Library Management System — Database Setup =="
echo "This will create/reset the '${DB_NAME}' database."
read -r -p "Continue? [y/N] " CONFIRM
if [[ "${CONFIRM}" != "y" && "${CONFIRM}" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

if [ -z "${MYSQL_ROOT_PASSWORD:-}" ]; then
  read -r -s -p "MySQL '${ROOT_USER}' password (blank if none): " MYSQL_ROOT_PASSWORD
  echo
fi

ROOT_AUTH=(-h "${DB_HOST}" -P "${DB_PORT}" -u "${ROOT_USER}")
if [ -n "${MYSQL_ROOT_PASSWORD}" ]; then
  ROOT_AUTH+=(-p"${MYSQL_ROOT_PASSWORD}")
fi

echo "[1/2] Creating database + app user (as ${ROOT_USER})..."
mysql "${ROOT_AUTH[@]}" < "${DB_DIR}/00_create_database_and_user.sql"

echo "[2/2] Loading schema, functions, views, procedures, triggers, seed data (as ${APP_USER})..."
APP_AUTH=(-h "${DB_HOST}" -P "${DB_PORT}" -u "${APP_USER}" -p"${APP_PASSWORD}")

for f in 01_schema.sql 02_functions.sql 03_views.sql 04_procedures.sql 05_triggers.sql 06_seed_data.sql; do
  echo "  -> ${f}"
  mysql "${APP_AUTH[@]}" < "${DB_DIR}/${f}"
done

echo
echo "Done. Database '${DB_NAME}' is ready."
echo "App DB user: ${APP_USER} (update backend/.env if you changed the password)."
