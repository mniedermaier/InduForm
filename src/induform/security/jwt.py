"""JWT token utilities for authentication."""

import logging
import os
import uuid
from datetime import datetime, timedelta
from typing import Any

from jose import JWTError, jwt

logger = logging.getLogger(__name__)

# JWT Configuration
_env = os.environ.get("INDUFORM_ENV", "development")
_configured_secret = os.environ.get("INDUFORM_SECRET_KEY")

if _configured_secret:
    SECRET_KEY = _configured_secret
elif _env == "production":
    raise RuntimeError(
        "INDUFORM_SECRET_KEY must be set in production. "
        'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(64))"'
    )
else:
    SECRET_KEY = "development-secret-key-DO-NOT-USE-IN-PRODUCTION"
    logger.warning("Using default JWT secret key. Set INDUFORM_SECRET_KEY for production.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("INDUFORM_ACCESS_TOKEN_EXPIRE", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get("INDUFORM_REFRESH_TOKEN_EXPIRE", "7"))
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = 30


class TokenData:
    """Decoded token data."""

    def __init__(
        self,
        user_id: str,
        token_type: str = "access",
        exp: datetime | None = None,
        jti: str | None = None,
        iat: datetime | None = None,
    ):
        self.user_id = user_id
        self.token_type = token_type
        self.exp = exp
        self.jti = jti
        self.iat = iat


def create_access_token(
    user_id: str,
    expires_delta: timedelta | None = None,
    username: str | None = None,
    display_name: str | None = None,
    is_admin: bool = False,
) -> str:
    """Create a JWT access token."""
    if expires_delta is None:
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    expire = datetime.utcnow() + expires_delta
    jti = str(uuid.uuid4())

    to_encode: dict[str, Any] = {
        "sub": user_id,
        "type": "access",
        "exp": expire,
        "iat": datetime.utcnow(),
        "jti": jti,
    }

    if username is not None:
        to_encode["username"] = username
    if display_name is not None:
        to_encode["display_name"] = display_name
    if is_admin:
        to_encode["is_admin"] = True

    return str(jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM))


def create_refresh_token(
    user_id: str,
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT refresh token."""
    if expires_delta is None:
        expires_delta = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    expire = datetime.utcnow() + expires_delta
    jti = str(uuid.uuid4())

    to_encode: dict[str, Any] = {
        "sub": user_id,
        "type": "refresh",
        "exp": expire,
        "iat": datetime.utcnow(),
        "jti": jti,
    }

    return str(jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM))


def create_password_reset_token(user_id: str) -> str:
    """Create a short-lived token for password reset."""
    expire = datetime.utcnow() + timedelta(minutes=PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    jti = str(uuid.uuid4())

    to_encode: dict[str, Any] = {
        "sub": user_id,
        "type": "password_reset",
        "exp": expire,
        "iat": datetime.utcnow(),
        "jti": jti,
    }

    return str(jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM))


def decode_token(token: str) -> TokenData | None:
    """Decode and validate a JWT token.

    Returns:
        TokenData if valid, None if invalid or expired.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type", "access")
        exp = payload.get("exp")
        jti = payload.get("jti")
        iat = payload.get("iat")

        if user_id is None:
            return None

        exp_datetime = datetime.fromtimestamp(exp) if exp else None
        iat_datetime = datetime.utcfromtimestamp(iat) if iat else None
        return TokenData(
            user_id=user_id, token_type=token_type, exp=exp_datetime, jti=jti, iat=iat_datetime
        )

    except JWTError:
        return None


def is_token_expired(token: str) -> bool:
    """Check if a token is expired."""
    token_data = decode_token(token)
    if token_data is None or token_data.exp is None:
        return True
    return datetime.utcnow() > token_data.exp
