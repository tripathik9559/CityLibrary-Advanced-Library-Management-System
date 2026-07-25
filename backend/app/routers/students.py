from typing import Optional

import pymysql
from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import get_cursor
from app.dependencies import get_current_admin
from app.schemas.common import MessageResponse, PageMeta, Paginated
from app.schemas.student import StudentCreate, StudentUpdate

router = APIRouter(prefix="/api/students", tags=["Students"])

ALLOWED_SORT = {"full_name", "roll_number", "department", "membership_date"}


@router.get("")
def search_students(
    q: str = Query("", description="Search keyword — name, roll number, email or phone"),
    status: Optional[str] = None,
    department: Optional[str] = None,
    sort_by: str = Query("full_name"),
    sort_dir: str = Query("ASC", pattern="^(?i)(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin: dict = Depends(get_current_admin),
):
    """Search + filter + sort + paginate over vw_student_summary (which
    already rolls up each student's current loans, overdue count and
    fine totals via GROUP BY / aggregate functions)."""
    sort_col = sort_by if sort_by in ALLOWED_SORT else "full_name"
    offset = (page - 1) * page_size
    like = f"%{q}%"

    where = ["(full_name LIKE %s OR roll_number LIKE %s)"]
    params: list = [like, like]
    if status:
        where.append("status = %s")
        params.append(status)
    if department:
        where.append("department = %s")
        params.append(department)
    where_sql = " AND ".join(where)

    with get_cursor() as cur:
        cur.execute(f"SELECT COUNT(*) AS c FROM vw_student_summary WHERE {where_sql}", params)
        total_rows = cur.fetchone()["c"]

        cur.execute(
            f"""
            SELECT * FROM vw_student_summary
            WHERE {where_sql}
            ORDER BY {sort_col} {sort_dir.upper()}
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


@router.get("/{student_id}")
def get_student(student_id: int, admin: dict = Depends(get_current_admin)):
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT s.*,
                   vs.total_books_borrowed, vs.books_currently_held,
                   vs.overdue_count, vs.total_fine_charged, vs.total_fine_paid
            FROM students s
            LEFT JOIN vw_student_summary vs ON vs.student_id = s.student_id
            WHERE s.student_id = %s
            """,
            (student_id,),
        )
        student = cur.fetchone()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student


@router.post("", status_code=201)
def create_student(payload: StudentCreate, admin: dict = Depends(get_current_admin)):
    with get_cursor(commit=True) as cur:
        try:
            cur.execute(
                """
                INSERT INTO students (roll_number, full_name, email, phone, department, semester, address)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (payload.roll_number, payload.full_name, payload.email, payload.phone,
                 payload.department, payload.semester, payload.address),
            )
            student_id = cur.lastrowid
        except pymysql.err.IntegrityError as exc:
            raise HTTPException(
                status_code=409,
                detail="A student with this roll number, email or phone already exists",
            ) from exc
    return {"student_id": student_id, "message": "Student added successfully."}


@router.put("/{student_id}", response_model=MessageResponse)
def update_student(student_id: int, payload: StudentUpdate, admin: dict = Depends(get_current_admin)):
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    fields = [f"{k} = %s" for k in data]
    values = list(data.values()) + [student_id]

    with get_cursor(commit=True) as cur:
        try:
            cur.execute(f"UPDATE students SET {', '.join(fields)} WHERE student_id = %s", values)
        except pymysql.err.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="Email or phone already in use") from exc
        if cur.rowcount == 0:
            cur.execute("SELECT 1 FROM students WHERE student_id=%s", (student_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Student not found")
    return MessageResponse(message="Student updated successfully.")


@router.delete("/{student_id}", response_model=MessageResponse)
def delete_student(student_id: int, admin: dict = Depends(get_current_admin)):
    """FK on book_issues is ON DELETE RESTRICT, so a student with any
    borrow history can't be hard-deleted — deactivate instead."""
    with get_cursor(commit=True) as cur:
        try:
            cur.execute("DELETE FROM students WHERE student_id = %s", (student_id,))
        except pymysql.err.IntegrityError:
            cur.execute("UPDATE students SET status = 'inactive' WHERE student_id = %s", (student_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Student not found")
            return MessageResponse(
                message="Student has borrowing history and cannot be deleted — marked inactive instead."
            )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Student not found")
    return MessageResponse(message="Student deleted permanently.")
