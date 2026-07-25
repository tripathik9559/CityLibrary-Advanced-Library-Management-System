from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=4, max_length=100)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_minutes: int
    admin: "AdminProfile"


class AdminProfile(BaseModel):
    admin_id: int
    username: str
    full_name: str
    role: str


LoginResponse.model_rebuild()
