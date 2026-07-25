from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.database import get_cursor
from app.dependencies import get_current_admin
from app.schemas.common import PageMeta, Paginated

router = APIRouter(prefix="/api/reports", tags=["Reports"])


def _paginate_view(view: str, page: int, page_size: int, order_by: str = "1"):
    offset = (page - 1) * page_size
    with get_cursor() as cur:
        cur.execute(f"SELECT COUNT(*) AS c FROM {view}")
        total_rows = cur.fetchone()["c"]
        cur.execute(f"SELECT * FROM {view} ORDER BY {order_by} LIMIT %s OFFSET %s", (page_size, offset))
        rows = cur.fetchall()
    total_pages = max(1, (total_rows + page_size - 1) // page_size)
    return Paginated(
        meta=PageMeta(page=page, page_size=page_size, total_rows=total_rows, total_pages=total_pages),
        data=rows,
    )


@router.get("/available-books")
def available_books_report(page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
                            admin: dict = Depends(get_current_admin)):
    return _paginate_view("vw_available_books", page, page_size, order_by="title")


@router.get("/borrowed-books")
def borrowed_books_report(page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
                           admin: dict = Depends(get_current_admin)):
    return _paginate_view("vw_currently_issued", page, page_size, order_by="due_date")


@router.get("/overdue-books")
def overdue_books_report(page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
                          admin: dict = Depends(get_current_admin)):
    return _paginate_view("vw_overdue_books", page, page_size, order_by="days_overdue DESC")


@router.get("/most-borrowed")
def most_borrowed_report(limit: int = Query(10, ge=1, le=50), admin: dict = Depends(get_current_admin)):
    with get_cursor() as cur:
        cur.execute("SELECT * FROM vw_most_borrowed_books LIMIT %s", (limit,))
        return cur.fetchall()


@router.get("/student-history")
def student_history_report(
    student_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin: dict = Depends(get_current_admin),
):
    offset = (page - 1) * page_size
    where = "WHERE student_id = %s" if student_id else ""
    params = (student_id,) if student_id else ()
    with get_cursor() as cur:
        cur.execute(f"SELECT COUNT(*) AS c FROM vw_student_borrow_history {where}", params)
        total_rows = cur.fetchone()["c"]
        cur.execute(
            f"SELECT * FROM vw_student_borrow_history {where} ORDER BY issue_date DESC LIMIT %s OFFSET %s",
            params + (page_size, offset),
        )
        rows = cur.fetchall()
    total_pages = max(1, (total_rows + page_size - 1) // page_size)
    return Paginated(
        meta=PageMeta(page=page, page_size=page_size, total_rows=total_rows, total_pages=total_pages),
        data=rows,
    )


@router.get("/fines")
def fine_report(
    unpaid_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin: dict = Depends(get_current_admin),
):
    where = "WHERE balance_due > 0" if unpaid_only else ""
    offset = (page - 1) * page_size
    with get_cursor() as cur:
        cur.execute(f"SELECT COUNT(*) AS c FROM vw_fine_report {where}")
        total_rows = cur.fetchone()["c"]
        cur.execute(
            f"SELECT * FROM vw_fine_report {where} ORDER BY balance_due DESC LIMIT %s OFFSET %s",
            (page_size, offset),
        )
        rows = cur.fetchall()
    total_pages = max(1, (total_rows + page_size - 1) // page_size)
    return Paginated(
        meta=PageMeta(page=page, page_size=page_size, total_rows=total_rows, total_pages=total_pages),
        data=rows,
    )
