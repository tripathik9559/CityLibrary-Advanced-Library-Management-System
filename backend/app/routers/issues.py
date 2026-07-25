from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import call_procedure, get_cursor
from app.dependencies import get_current_admin
from app.schemas.common import PageMeta, Paginated
from app.schemas.issue import IssueActionResult, IssueBookRequest, PayFineRequest

router = APIRouter(prefix="/api/issues", tags=["Book Issue"])


@router.get("")
def list_issues(
    status: Optional[str] = Query(None, description="issued | overdue | returned | lost"),
    student_id: Optional[int] = None,
    book_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin: dict = Depends(get_current_admin),
):
    where = ["1=1"]
    params: list = []
    if status:
        where.append("bi.status = %s")
        params.append(status)
    if student_id:
        where.append("bi.student_id = %s")
        params.append(student_id)
    if book_id:
        where.append("bi.book_id = %s")
        params.append(book_id)
    where_sql = " AND ".join(where)
    offset = (page - 1) * page_size

    with get_cursor() as cur:
        cur.execute(f"SELECT COUNT(*) AS c FROM book_issues bi WHERE {where_sql}", params)
        total_rows = cur.fetchone()["c"]

        cur.execute(
            f"""
            SELECT bi.issue_id, b.book_id, b.title, b.isbn,
                   s.student_id, s.roll_number, s.full_name AS student_name,
                   bi.issue_date, bi.due_date, bi.return_date,
                   bi.fine_amount, bi.fine_paid, bi.status
            FROM book_issues bi
            INNER JOIN books b ON b.book_id = bi.book_id
            INNER JOIN students s ON s.student_id = bi.student_id
            WHERE {where_sql}
            ORDER BY bi.issue_id DESC
            LIMIT %s OFFSET %s
            """,
            params + [page_size, offset],
        )
        rows = cur.fetchall()

    total_pages = max(1, (total_rows + page_size - 1) // page_size)
    return Paginated(
        meta=PageMeta(page=page, page_size=page_size, total_rows=total_rows, total_pages=total_pages),
        data=rows,
    )


@router.post("/issue", response_model=IssueActionResult)
def issue_book(payload: IssueBookRequest, admin: dict = Depends(get_current_admin)):
    """Issues a book by calling sp_issue_book — all validation (copy
    availability, student status, max-books-per-student cap) and the
    transaction live inside the stored procedure."""
    result = call_procedure(
        "sp_issue_book",
        (payload.book_id, payload.student_id, payload.issue_days, admin["admin_id"]),
        ["issue_id", "message"],
    )
    if result.get("issue_id") is None:
        raise HTTPException(status_code=400, detail=result.get("message", "Could not issue book"))
    return IssueActionResult(success=True, message=result["message"], issue_id=result["issue_id"])


@router.post("/{issue_id}/return", response_model=IssueActionResult)
def return_book(issue_id: int, admin: dict = Depends(get_current_admin)):
    """Returns a book via sp_return_book — computes the late fine with
    fn_calculate_fine and restocks the copy via trg_after_return_update."""
    result = call_procedure(
        "sp_return_book",
        (issue_id, admin["admin_id"]),
        ["fine_amount", "message"],
    )
    if result.get("fine_amount") is None and "already been returned" in (result.get("message") or ""):
        raise HTTPException(status_code=409, detail=result["message"])
    if result.get("fine_amount") is None:
        raise HTTPException(status_code=400, detail=result.get("message", "Could not return book"))
    return IssueActionResult(
        success=True, message=result["message"], issue_id=issue_id, fine_amount=float(result["fine_amount"])
    )


@router.post("/{issue_id}/pay-fine", response_model=IssueActionResult)
def pay_fine(issue_id: int, payload: PayFineRequest, admin: dict = Depends(get_current_admin)):
    """Records a fine payment via sp_pay_fine (supports partial payments)."""
    result = call_procedure(
        "sp_pay_fine",
        (issue_id, payload.amount, admin["admin_id"]),
        ["message"],
    )
    message = result.get("message", "")
    if message != "Payment recorded successfully.":
        raise HTTPException(status_code=400, detail=message or "Could not record payment")
    return IssueActionResult(success=True, message=message, issue_id=issue_id)
