from datetime import datetime, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.database import get_cursor
from app.security import decode_access_token, token_hash

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_admin(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        admin_id = int(payload.get("sub"))
    except (jwt.PyJWTError, TypeError, ValueError):
        raise credentials_exception

    # Session lookup lets an admin (or a compromised token) be revoked
    # server-side even though JWTs are otherwise stateless.
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT s.session_id, s.is_active, s.expires_at,
                   a.admin_id, a.username, a.full_name, a.role, a.is_active AS admin_active
            FROM admin_sessions s
            INNER JOIN admins a ON a.admin_id = s.admin_id
            WHERE s.token_hash = %s
            """,
            (token_hash(token),),
        )
        session = cur.fetchone()

    if not session or not session["is_active"] or not session["admin_active"]:
        raise credentials_exception

    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise credentials_exception

    return {
        "admin_id": session["admin_id"],
        "username": session["username"],
        "full_name": session["full_name"],
        "role": session["role"],
    }


def require_super_admin(admin: dict = Depends(get_current_admin)) -> dict:
    if admin["role"] != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin privileges required")
    return admin
