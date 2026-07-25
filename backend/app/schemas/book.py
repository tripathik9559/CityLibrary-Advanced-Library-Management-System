from typing import Optional

from pydantic import BaseModel, Field, field_validator


class BookBase(BaseModel):
    isbn: str = Field(..., min_length=10, max_length=20)
    title: str = Field(..., min_length=1, max_length=200)
    category_id: int
    publisher_id: int
    edition: Optional[str] = None
    publication_year: Optional[int] = None
    total_copies: int = Field(..., ge=0)
    shelf_location: Optional[str] = None
    price: float = Field(..., ge=0)
    author_ids: list[int] = Field(default_factory=list)

    @field_validator("isbn")
    @classmethod
    def clean_isbn(cls, v: str) -> str:
        return v.strip()


class BookCreate(BookBase):
    pass


class BookUpdate(BaseModel):
    title: Optional[str] = None
    category_id: Optional[int] = None
    publisher_id: Optional[int] = None
    edition: Optional[str] = None
    publication_year: Optional[int] = None
    total_copies: Optional[int] = Field(default=None, ge=0)
    shelf_location: Optional[str] = None
    price: Optional[float] = Field(default=None, ge=0)
    status: Optional[str] = None
    author_ids: Optional[list[int]] = None


class BookOut(BaseModel):
    book_id: int
    isbn: str
    title: str
    category_name: Optional[str] = None
    publisher_name: Optional[str] = None
    authors: Optional[str] = None
    edition: Optional[str] = None
    publication_year: Optional[int] = None
    total_copies: int
    available_copies: int
    shelf_location: Optional[str] = None
    price: float
    status: str
