from typing import Optional

from pydantic import BaseModel, Field


class IssueBookRequest(BaseModel):
    book_id: int
    student_id: int
    issue_days: int = Field(default=14, ge=1, le=90)


class ReturnBookRequest(BaseModel):
    remarks: Optional[str] = None


class PayFineRequest(BaseModel):
    amount: float = Field(..., gt=0)


class IssueActionResult(BaseModel):
    success: bool
    message: str
    issue_id: Optional[int] = None
    fine_amount: Optional[float] = None
