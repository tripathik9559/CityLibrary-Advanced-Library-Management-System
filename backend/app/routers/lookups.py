from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.database import get_cursor
from app.dependencies import get_current_admin

router = APIRouter(prefix="/api/lookups", tags=["Lookups"])


class NameCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)


@router.get("/categories")
def list_categories(admin: dict = Depends(get_current_admin)):
    with get_cursor() as cur:
        cur.execute("SELECT category_id, category_name, description FROM categories ORDER BY category_name")
        return cur.fetchall()


@router.post("/categories", status_code=201)
def create_category(payload: NameCreate, admin: dict = Depends(get_current_admin)):
    with get_cursor(commit=True) as cur:
        try:
            cur.execute("INSERT INTO categories (category_name) VALUES (%s)", (payload.name.strip(),))
        except Exception as exc:
            raise HTTPException(status_code=409, detail="Category already exists") from exc
        return {"category_id": cur.lastrowid, "category_name": payload.name.strip()}


@router.get("/publishers")
def list_publishers(admin: dict = Depends(get_current_admin)):
    with get_cursor() as cur:
        cur.execute("SELECT publisher_id, publisher_name FROM publishers ORDER BY publisher_name")
        return cur.fetchall()


@router.post("/publishers", status_code=201)
def create_publisher(payload: NameCreate, admin: dict = Depends(get_current_admin)):
    with get_cursor(commit=True) as cur:
        try:
            cur.execute("INSERT INTO publishers (publisher_name) VALUES (%s)", (payload.name.strip(),))
        except Exception as exc:
            raise HTTPException(status_code=409, detail="Publisher already exists") from exc
        return {"publisher_id": cur.lastrowid, "publisher_name": payload.name.strip()}


@router.get("/authors")
def list_authors(admin: dict = Depends(get_current_admin)):
    with get_cursor() as cur:
        cur.execute("SELECT author_id, author_name FROM authors ORDER BY author_name")
        return cur.fetchall()


@router.post("/authors", status_code=201)
def create_author(payload: NameCreate, admin: dict = Depends(get_current_admin)):
    with get_cursor(commit=True) as cur:
        try:
            cur.execute("INSERT INTO authors (author_name) VALUES (%s)", (payload.name.strip(),))
        except Exception as exc:
            raise HTTPException(status_code=409, detail="Author already exists") from exc
        return {"author_id": cur.lastrowid, "author_name": payload.name.strip()}
