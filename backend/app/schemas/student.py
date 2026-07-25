from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class StudentBase(BaseModel):
    roll_number: str = Field(..., min_length=2, max_length=30)
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(..., min_length=7, max_length=15)
    department: Optional[str] = None
    semester: Optional[int] = Field(default=None, ge=1, le=12)
    address: Optional[str] = None


class StudentCreate(StudentBase):
    pass


class StudentUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    semester: Optional[int] = Field(default=None, ge=1, le=12)
    address: Optional[str] = None
    status: Optional[str] = None


class StudentOut(StudentBase):
    student_id: int
    membership_date: str
    status: str
