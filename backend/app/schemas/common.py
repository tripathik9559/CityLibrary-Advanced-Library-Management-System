from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class PageMeta(BaseModel):
    page: int
    page_size: int
    total_rows: int
    total_pages: int


class Paginated(BaseModel, Generic[T]):
    meta: PageMeta
    data: list[T]


class MessageResponse(BaseModel):
    message: str
