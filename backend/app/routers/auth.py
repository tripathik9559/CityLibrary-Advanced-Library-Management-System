import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm

from app.database import get_cursor
from app.dependencies import get_current_admin, oauth2_scheme
from app.schemas.auth import AdminProfile, LoginResponse
from app.schemas.common import MessageResponse
from app.security import create_access_token, token_hash, verify_password

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    """
    Admin login. Verifies the bcrypt password hash, then issues a JWT
    and records a matching row in admin_sessions so the session can be
    audited/revoked server-side (see dependencies.get_current_admin).
    """
    with get_cursor() as cur:
        cur.execute(
            "SELECT admin_id, username, password_hash, full_name, role, is_active "
            "FROM admins WHERE username = %s",
            (form_data.username,),
        )
        admin = cur.fetchone()

    if not admin or not verify_password(form_data.password, admin["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    if not admin["is_active"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    token, jti, expires_at = create_access_token(admin["admin_id"], admin["username"], admin["role"])

    with get_cursor(commit=True) as cur:
        cur.execute(
            """
            INSERT INTO admin_sessions (session_id, admin_id, token_hash, ip_address, user_agent, expires_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                str(uuid.uuid4()),
                admin["admin_id"],
                token_hash(token),
                request.client.host if request.client else None,
                request.headers.get("user-agent"),
                expires_at.strftime("%Y-%m-%d %H:%M:%S"),
            ),
        )
        cur.execute("UPDATE admins SET last_login = %s WHERE admin_id = %s",
                    (datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), admin["admin_id"]))

    return LoginResponse(
        access_token=token,
        expires_in_minutes=120,
        admin=AdminProfile(
            admin_id=admin["admin_id"],
            username=admin["username"],
            full_name=admin["full_name"],
            role=admin["role"],
        ),
    )


@router.post("/logout", response_model=MessageResponse)
def logout(token: str = Depends(oauth2_scheme), admin: dict = Depends(get_current_admin)):
    with get_cursor(commit=True) as cur:
        cur.execute(
            "UPDATE admin_sessions SET is_active = 0 WHERE token_hash = %s",
            (token_hash(token),),
        )
    return MessageResponse(message="Logged out successfully.")


@router.get("/me", response_model=AdminProfile)
def me(admin: dict = Depends(get_current_admin)):
    return AdminProfile(**admin)
