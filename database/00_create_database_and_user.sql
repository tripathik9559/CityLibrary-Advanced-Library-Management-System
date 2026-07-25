-- =====================================================================
-- LIBRARY MANAGEMENT SYSTEM — DATABASE + APP USER BOOTSTRAP
-- File: 00_create_database_and_user.sql
-- Run this ONE file as an admin user (e.g. root):
--     mysql -u root -p < 00_create_database_and_user.sql
--
-- Every other script (01_schema.sql onward) is then run AS
-- library_admin — not root — so that library_admin is the routine
-- DEFINER for every view/function/procedure/trigger. This matters
-- for mysqldump: SHOW CREATE FUNCTION/PROCEDURE requires the
-- connected user to either be the definer or hold the SHOW ROUTINE
-- privilege, so backups taken with library_admin (scripts/backup_db.sh)
-- come out complete without extra grants.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS library_management_system
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- Change this password before deploying anywhere real, and update
-- backend/.env + scripts/backup_db.sh to match.
CREATE USER IF NOT EXISTS 'library_admin'@'localhost' IDENTIFIED BY 'Library@2026';

GRANT ALL PRIVILEGES ON library_management_system.* TO 'library_admin'@'localhost';

FLUSH PRIVILEGES;
