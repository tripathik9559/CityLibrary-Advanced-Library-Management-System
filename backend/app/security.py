"""
Password hashing (bcrypt) and JWT issuing/verification.

Note: we call the `bcrypt` package directly rather than going through
passlib's CryptContext — recent bcrypt (>=4.1) removed internals that
passlib's backend-detection probes for, which raises a spurious
"password cannot be longer than 72 bytes" error even for short
passwords. Calling bcrypt directly avoids that incompatibility.
"""
import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import get_settings

settings = get_settings()

_BCRYPT_ROUNDS = 12


def hash_password(plain_password: str) -> str:
    salt = bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(admin_id: int, username: str, role: str) -> tuple[str, str, datetime]:
    """Returns (token, jti, expires_at)."""
    jti = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": str(admin_id),
        "username": username,
        "role": role,
        "jti": jti,
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, jti, expires_at


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def token_hash(token: str) -> str:
    """SHA-256 fingerprint of the JWT, stored in admin_sessions for revocation checks."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_token(admin_id: int, username: str, role: str) -> tuple[str, str, datetime]:
    """Returns (token, jti, expires_at)."""
    jti = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": str(admin_id),
        "username": username,
        "role": role,
        "jti": jti,
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, jti, expires_at


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def token_hash(token: str) -> str:
    """SHA-256 fingerprint of the JWT, stored in admin_sessions for revocation checks."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
