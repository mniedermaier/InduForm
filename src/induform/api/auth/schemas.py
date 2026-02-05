"""Pydantic schemas for authentication API."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserCreate(BaseModel):
    """Schema for user registration."""

    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(..., min_length=8, max_length=100)
    display_name: str | None = Field(None, max_length=100)


class UserLogin(BaseModel):
    """Schema for user login."""

    email_or_username: str = Field(..., description="Email or username")
    password: str


class UserResponse(BaseModel):
    """Schema for user response."""

    id: str
    email: str
    username: str
    display_name: str | None
    created_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    """Schema for token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Access token expiration in seconds")


class RefreshTokenRequest(BaseModel):
    """Schema for token refresh request."""

    refresh_token: str


class PasswordChangeRequest(BaseModel):
    """Schema for password change."""

    current_password: str
    new_password: str = Field(..., min_length=8, max_length=100)


class UserUpdate(BaseModel):
    """Schema for user profile update."""

    display_name: str | None = Field(None, max_length=100)
    email: EmailStr | None = None


class ForgotPasswordRequest(BaseModel):
    """Schema for forgot password request."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Schema for password reset with token."""

    token: str
    new_password: str = Field(..., min_length=8, max_length=100)
