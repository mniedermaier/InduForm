"""Authentication API module."""

from induform.api.auth.dependencies import get_current_user, get_current_user_optional
from induform.api.auth.routes import router as auth_router

__all__ = [
    "auth_router",
    "get_current_user",
    "get_current_user_optional",
]
