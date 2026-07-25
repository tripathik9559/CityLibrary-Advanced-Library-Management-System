from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
import pymysql

from app.database import get_cursor
from app.dependencies import get_current_admin
from app.schemas.book import BookCreate, BookUpdate
from app.schemas.common import MessageResponse, PageMeta, Paginated

router = APIRouter(prefix="/api/books", tags=["Books"])

ALLOWED_SORT = {"title", "price", "publication_year", "available_copies"}


@router.get("")
def search_books(
    q: str = Query("", description="Search keyword — matches title, ISBN or author"),
    category_id: Optional[int] = None,
    sort_by: str = Query("title"),
    sort_dir: str = Query("ASC", pattern="^(?i)(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    admin: dict = Depends(get_current_admin),
):
    """
    Book catalog search/filter/sort/paginate — powered entirely by the
    sp_search_books stored procedure (dynamic SQL + prepared statement
    on the DB side; see database/04_procedures.sql).
    """
    sort_by = sort_by if sort_by in ALLOWED_SORT else "title"
    offset = (page - 1) * page_size

    with get_cursor() as cur:
        cur.execute(
            "CALL sp_search_books(%s, %s, %s, %s, %s, %s)",
            (q, category_id, sort_by, sort_dir.upper(), page_size, offset),
        )
        rows = cur.fetchall()
        cur.nextset()
        total = cur.fetchone()
        total_rows = total["total_matching_rows"] if total else 0

    total_pages = max(1, (total_rows + page_size - 1) // page_size)
    return Paginated(
        meta=PageMeta(page=page, page_size=page_size, total_rows=total_rows, total_pages=total_pages),
        data=rows,
    )


@router.get("/{book_id}")
def get_book(book_id: int, admin: dict = Depends(get_current_admin)):
    with get_cursor() as cur:
        cur.execute("SELECT * FROM vw_book_catalog WHERE book_id = %s", (book_id,))
        book = cur.fetchone()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.post("", status_code=201)
def create_book(payload: BookCreate, admin: dict = Depends(get_current_admin)):
    """Insert a book plus its author links as one Python-managed transaction."""
    with get_cursor(commit=True) as cur:
        try:
            cur.execute(
                """
                INSERT INTO books (isbn, title, category_id, publisher_id, edition,
                                    publication_year, total_copies, available_copies,
                                    shelf_location, price)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    payload.isbn, payload.title, payload.category_id, payload.publisher_id,
                    payload.edition, payload.publication_year, payload.total_copies,
                    payload.total_copies, payload.shelf_location, payload.price,
                ),
            )
            book_id = cur.lastrowid
            for author_id in payload.author_ids:
                cur.execute(
                    "INSERT INTO book_authors (book_id, author_id) VALUES (%s, %s)",
                    (book_id, author_id),
                )
        except pymysql.err.IntegrityError as exc:
            code = exc.args[0]
            if code == 1062:
                raise HTTPException(status_code=409, detail="A book with this ISBN already exists") from exc
            raise HTTPException(status_code=400, detail="Invalid category, publisher or author reference") from exc

    return {"book_id": book_id, "message": "Book added successfully."}


@router.put("/{book_id}", response_model=MessageResponse)
def update_book(book_id: int, payload: BookUpdate, admin: dict = Depends(get_current_admin)):
    fields, values = [], []
    data = payload.model_dump(exclude_unset=True, exclude={"author_ids"})
    for key, value in data.items():
        fields.append(f"{key} = %s")
        values.append(value)

    if not fields and payload.author_ids is None:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    with get_cursor(commit=True) as cur:
        if fields:
            # total_copies changes must keep available_copies in a valid range;
            # rather than trust the client, clamp available_copies too.
            if "total_copies" in data:
                cur.execute("SELECT available_copies, total_copies FROM books WHERE book_id=%s", (book_id,))
                current = cur.fetchone()
                if not current:
                    raise HTTPException(status_code=404, detail="Book not found")
                issued = current["total_copies"] - current["available_copies"]
                new_available = max(0, data["total_copies"] - issued)
                fields.append("available_copies = %s")
                values.append(new_available)

            values.append(book_id)
            try:
                cur.execute(f"UPDATE books SET {', '.join(fields)} WHERE book_id = %s", values)
            except pymysql.err.IntegrityError as exc:
                raise HTTPException(status_code=400, detail="Invalid category or publisher reference") from exc
            if cur.rowcount == 0:
                cur.execute("SELECT 1 FROM books WHERE book_id=%s", (book_id,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Book not found")

        if payload.author_ids is not None:
            cur.execute("DELETE FROM book_authors WHERE book_id = %s", (book_id,))
            for author_id in payload.author_ids:
                cur.execute("INSERT INTO book_authors (book_id, author_id) VALUES (%s, %s)", (book_id, author_id))

    return MessageResponse(message="Book updated successfully.")


@router.delete("/{book_id}", response_model=MessageResponse)
def delete_book(book_id: int, admin: dict = Depends(get_current_admin)):
    """
    Hard-delete only if the book has no issue history at all (the
    fk_issue_book FK is ON DELETE RESTRICT by design — you should never
    silently lose loan history). Otherwise, mark it 'discontinued'
    instead so historical reports stay intact.
    """
    with get_cursor(commit=True) as cur:
        try:
            cur.execute("DELETE FROM books WHERE book_id = %s", (book_id,))
        except pymysql.err.IntegrityError:
            cur.execute("UPDATE books SET status = 'discontinued' WHERE book_id = %s", (book_id,))
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Book not found")
            return MessageResponse(
                message="Book has loan history and cannot be deleted — marked as discontinued instead."
            )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Book not found")
    return MessageResponse(message="Book deleted permanently.")
