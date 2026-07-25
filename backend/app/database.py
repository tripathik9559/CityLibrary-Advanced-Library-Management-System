"""
MySQL connection pooling + small query helpers.

We talk to MySQL directly with parameterized SQL (PyMySQL) rather than
hiding it behind an ORM — the whole point of this project is to show
SQL fluency, so every query in routers/ is real, readable SQL using
%s placeholders (i.e. genuine server-side prepared statements, not
naive string interpolation).
"""
import logging
from contextlib import contextmanager

import pymysql
import pymysql.cursors
from dbutils.pooled_db import PooledDB

from app.config import get_settings

logger = logging.getLogger("library.db")

settings = get_settings()

_pool = PooledDB(
    creator=pymysql,
    maxconnections=20,
    mincached=2,
    maxcached=10,
    blocking=True,
    ping=1,                     # ping connection before use, reconnect if stale
    host=settings.db_host,
    port=settings.db_port,
    user=settings.db_user,
    password=settings.db_password,
    database=settings.db_name,
    charset="utf8mb4",
    cursorclass=pymysql.cursors.DictCursor,
    autocommit=True,
)


@contextmanager
def get_cursor(commit: bool = False):
    """
    Yield a DictCursor from the pool.

    commit=True is used for hand-rolled multi-statement transactions in
    the Python layer (e.g. inserting a book + its author links). Calls
    into stored procedures manage their own COMMIT/ROLLBACK internally
    and don't need this.
    """
    conn = _pool.connection()
    cur = conn.cursor()
    try:
        yield cur
        if commit:
            conn.commit()
    except Exception:
        if commit:
            conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()  # returns the connection to the pool, doesn't really close it


def call_procedure(proc_name: str, in_params: tuple, out_params: list[str]) -> dict:
    """
    Call a stored procedure that returns results through session
    variables for OUT parameters (the classic MySQL pattern), e.g.:

        CALL sp_issue_book(%s, %s, %s, %s, @issue_id, @message)
        SELECT @issue_id AS issue_id, @message AS message

    `out_params` are the bare variable names (without the leading @),
    in the exact order they appear in the procedure signature.
    """
    placeholders = ", ".join(["%s"] * len(in_params))
    out_vars = ", ".join(f"@{name}" for name in out_params)
    call_sql = f"CALL {proc_name}({placeholders}{', ' if in_params and out_params else ''}{out_vars})"
    select_sql = "SELECT " + ", ".join(f"@{name} AS {name}" for name in out_params)

    with get_cursor() as cur:
        cur.execute(call_sql, in_params)
        cur.execute(select_sql)
        result = cur.fetchone()
    return result or {}
