# Installation Guide

Step-by-step setup for Windows, macOS, and Linux.

## Prerequisites

| Tool | Minimum version | Check with |
|---|---|---|
| Python | 3.11+ | `python3 --version` |
| MySQL or MariaDB | MySQL 8.0+ / MariaDB 10.6+ | `mysql --version` |
| A modern browser | any recent Chrome/Firefox/Edge | — |

You do **not** need Node.js or npm to run this project — the frontend is
plain HTML/CSS/JS with all third-party libraries already vendored under
`frontend/vendor/`.

---

## 1. Get the code

```bash
git clone <your-fork-url> library-management-system
cd library-management-system
```

## 2. Set up the database

### Option A — automated script (Linux/macOS)

```bash
bash scripts/setup_database.sh
```

It will prompt for your MySQL root password, then create the database,
the `library_admin` app user, and load the schema + sample data.

### Option B — manual (any OS, including Windows)

```bash
# 1. Bootstrap: creates the database + library_admin user (run as root)
mysql -u root -p < database/00_create_database_and_user.sql

# 2. Everything else — run AS library_admin (password: Library@2026
#    unless you changed it in step 1)
mysql -u library_admin -p library_management_system < database/01_schema.sql
mysql -u library_admin -p library_management_system < database/02_functions.sql
mysql -u library_admin -p library_management_system < database/03_views.sql
mysql -u library_admin -p library_management_system < database/04_procedures.sql
mysql -u library_admin -p library_management_system < database/05_triggers.sql
mysql -u library_admin -p library_management_system < database/06_seed_data.sql
```

> **Why run steps 3-8 as `library_admin` and not `root`?** Whoever
> creates a view/function/procedure/trigger becomes its *definer*.
> `mysqldump` needs the connected user to either be that definer or hold
> the `SHOW ROUTINE` privilege to export routine bodies — so having
> `library_admin` create its own routines means `scripts/backup_db.sh`
> (which connects as `library_admin`) produces complete backups without
> extra grants. If you skip this and run everything as `root`, backups
> will still work but will emit `mysqldump: ... insufficient
> privileges ...` warnings and silently omit routine bodies.

To verify it worked:

```bash
mysql -u library_admin -p library_management_system -e "SELECT * FROM vw_dashboard_stats;"
```

You should see 75 total books, 130 active students, and 15 overdue loans.

## 3. Set up the backend

```bash
cd backend
python3 -m venv venv

# Activate the virtual environment
source venv/bin/activate        # Linux/macOS
venv\Scripts\activate           # Windows (cmd/PowerShell)

pip install -r requirements.txt
cp .env.example .env
```

Open `.env` and adjust if you changed any defaults:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=library_admin
DB_PASSWORD=Library@2026
DB_NAME=library_management_system
JWT_SECRET=<generate one — see below>
```

Generate a real JWT secret rather than using the placeholder:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Start the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Check it's alive: open http://localhost:8000/api/health — you should see
`{"status":"ok", ...}`. Interactive API docs are at
http://localhost:8000/api/docs.

## 4. Set up the frontend

The frontend is static files — any web server works. From the project
root:

```bash
cd frontend
python3 -m http.server 5500
```

Then open **http://localhost:5500** in your browser.

If you serve the API from somewhere other than `localhost:8000`, update
`frontend/js/config.js`:

```js
const APP_CONFIG = {
  API_BASE_URL: "http://your-api-host:8000/api",
};
```

## 5. Log in

- Username: `admin`
- Password: `Admin@123`

(A second demo account, `librarian1` with the same password but the
`librarian` role rather than `super_admin`, is also seeded.)

---

## Backing up and restoring

```bash
# Backup (writes a timestamped, gzipped dump into ./backups/)
bash scripts/backup_db.sh

# Restore from a backup
bash scripts/restore_db.sh backups/library_management_system_2026-07-24_02-00-00.sql.gz
```

Both scripts read `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` from the
environment if set, otherwise fall back to the same defaults as the
backend `.env.example`.

---

## Troubleshooting

**`Could not reach the API server` in the browser** — the backend isn't
running, or `frontend/js/config.js` points at the wrong URL/port. Check
http://localhost:8000/api/health directly.

**CORS errors in the browser console** — add your frontend's origin to
`CORS_ORIGINS` in `backend/.env` (comma-separated), then restart uvicorn.

**`mysqldump: ... insufficient privileges ...` when backing up** — you
loaded the schema files as `root` instead of `library_admin`. Re-run
steps 3-8 above connected as `library_admin`, or simply re-run
`scripts/setup_database.sh`, which does this correctly from a clean
slate.

**Login fails with correct credentials** — confirm the seed data loaded
(`SELECT username FROM admins;` should list `admin` and `librarian1`),
and that `backend/.env`'s `DB_*` values match the user you created.

**Port already in use** — change `--port 8000` (backend) or
`5500` (frontend) to any free port, and update `API_BASE_URL` in
`frontend/js/config.js` to match if you changed the backend port.
