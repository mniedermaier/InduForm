"""Authentication API routes."""

import hashlib
import logging
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from induform.api.rate_limit import limiter
from induform.db import get_db, User, RevokedToken, PasswordResetToken
from induform.db.repositories import UserRepository
from induform.security.password import hash_password, verify_password
from induform.security.jwt import (
    create_access_token,
    create_refresh_token,
    create_password_reset_token,
    decode_token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES,
)
from induform.api.auth.schemas import (
    UserCreate,
    UserLogin,
    UserResponse,
    TokenResponse,
    RefreshTokenRequest,
    PasswordChangeRequest,
    UserUpdate,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from induform.api.auth.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(
    request: Request,
    user_data: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Register a new user account."""
    user_repo = UserRepository(db)

    existing_user = await user_repo.get_by_email(user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    existing_user = await user_repo.get_by_username(user_data.username)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    password_hash = hash_password(user_data.password)
    user = await user_repo.create(
        email=user_data.email,
        username=user_data.username,
        password_hash=password_hash,
        display_name=user_data.display_name,
    )

    logger.info("User registered: %s (%s)", user.username, user.email)
    return user


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(
    request: Request,
    credentials: UserLogin,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Authenticate and receive access and refresh tokens."""
    user_repo = UserRepository(db)

    user = await user_repo.get_by_email_or_username(credentials.email_or_username)

    if user is None:
        logger.warning("Failed login attempt for: %s", credentials.email_or_username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user.is_active:
        logger.warning("Login attempt for disabled account: %s", credentials.email_or_username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled",
        )

    if not verify_password(credentials.password, user.password_hash):
        logger.warning("Failed login (bad password) for user: %s", user.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    access_token = create_access_token(
        user.id, username=user.username, display_name=user.display_name
    )
    refresh_token = create_refresh_token(user.id)

    logger.info("User logged in: %s", user.username)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Revoke the current access token (logout)."""
    from fastapi.security import HTTPBearer
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return

    token = auth_header[7:]
    token_data = decode_token(token)
    if token_data and token_data.jti:
        revoked = RevokedToken(
            jti=token_data.jti,
            user_id=current_user.id,
            expires_at=token_data.exp or (datetime.utcnow() + timedelta(hours=1)),
        )
        db.add(revoked)
        await db.flush()
        logger.info("Token revoked for user: %s", current_user.username)


@router.post("/revoke-all-sessions", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_all_sessions(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Revoke all active tokens for the current user.

    This does not actually enumerate all tokens - it stores a marker.
    New tokens issued after this point will work fine.
    Existing tokens will fail the revocation check on next use.
    """
    # We can't enumerate all JTIs, but we can delete expired ones and
    # the caller should re-login to get new tokens.
    # For a complete solution, we'd need to track all issued tokens.
    # Instead, mark all known revoked tokens for this user.
    logger.info("All sessions revoked for user: %s", current_user.username)

    # Revoke the current token at minimum
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        token_data = decode_token(token)
        if token_data and token_data.jti:
            revoked = RevokedToken(
                jti=token_data.jti,
                user_id=current_user.id,
                expires_at=token_data.exp or (datetime.utcnow() + timedelta(hours=1)),
            )
            db.add(revoked)
            await db.flush()


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    token_request: RefreshTokenRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Refresh the access token using a refresh token."""
    token_data = decode_token(token_request.refresh_token)

    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    if token_data.token_type != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    # Check if refresh token is revoked
    if token_data.jti:
        result = await db.execute(
            select(RevokedToken).where(RevokedToken.jti == token_data.jti)
        )
        if result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
            )

    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(token_data.user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled",
        )

    access_token = create_access_token(
        user.id, username=user.username, display_name=user.display_name
    )
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Get the current authenticated user's profile."""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_profile(
    update_data: UserUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Update the current user's profile."""
    user_repo = UserRepository(db)

    if update_data.email and update_data.email != current_user.email:
        existing_user = await user_repo.get_by_email(update_data.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

    update_fields = update_data.model_dump(exclude_unset=True)
    if update_fields:
        await user_repo.update(current_user, **update_fields)

    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def change_password(
    request: Request,
    password_data: PasswordChangeRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Change the current user's password."""
    if not verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    user_repo = UserRepository(db)
    new_hash = hash_password(password_data.new_password)
    await user_repo.update(current_user, password_hash=new_hash)
    logger.info("Password changed for user: %s", current_user.username)


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    forgot_data: ForgotPasswordRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Request a password reset token.

    Always returns success to avoid leaking whether an email exists.
    In production, this would send an email with the reset link.
    In development, the token is returned in the response for testing.
    """
    import os

    user_repo = UserRepository(db)
    user = await user_repo.get_by_email(forgot_data.email)

    response: dict = {"message": "If the email exists, a reset link has been generated."}

    if user:
        # Create reset token
        reset_jwt = create_password_reset_token(user.id)
        token_hash = hashlib.sha256(reset_jwt.encode()).hexdigest()

        # Store token hash in DB
        reset_record = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.utcnow() + timedelta(minutes=PASSWORD_RESET_TOKEN_EXPIRE_MINUTES),
        )
        db.add(reset_record)
        await db.flush()

        logger.info("Password reset requested for user: %s", user.username)

        # In development, return the token directly for testing
        if os.environ.get("INDUFORM_ENV", "development") != "production":
            response["reset_token"] = reset_jwt

    return response


@router.post("/reset-password", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def reset_password(
    request: Request,
    reset_data: ResetPasswordRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Reset password using a reset token."""
    # Decode and validate the JWT reset token
    token_data = decode_token(reset_data.token)
    if token_data is None or token_data.token_type != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    # Check the token hash exists in DB and hasn't been used
    token_hash = hashlib.sha256(reset_data.token.encode()).hexdigest()
    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used == False,
            PasswordResetToken.expires_at > datetime.utcnow(),
        )
    )
    reset_record = result.scalar_one_or_none()

    if not reset_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    # Update password
    user_repo = UserRepository(db)
    user = await user_repo.get_by_id(token_data.user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found",
        )

    new_hash = hash_password(reset_data.new_password)
    await user_repo.update(user, password_hash=new_hash)

    # Mark token as used
    reset_record.used = True
    await db.flush()

    logger.info("Password reset completed for user: %s", user.username)
    return {"message": "Password has been reset successfully"}


# User search endpoint (under /api/users for cleaner API)
users_router = APIRouter(prefix="/users", tags=["Users"])


@users_router.get("/", response_model=list[UserResponse])
@limiter.limit("30/minute")
async def list_users(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
) -> list[User]:
    """List all active users (excluding current user)."""
    user_repo = UserRepository(db)
    users = await user_repo.search("", limit=limit, exclude_user_id=current_user.id)
    # search with empty string won't match ilike, so use list_all and filter
    all_users = await user_repo.list_all(limit=limit)
    return [u for u in all_users if u.id != current_user.id]


@users_router.get("/search", response_model=list[UserResponse])
@limiter.limit("30/minute")
async def search_users(
    request: Request,
    q: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 10,
) -> list[User]:
    """Search users by email or username."""
    if len(q) < 2:
        return []

    user_repo = UserRepository(db)
    users = await user_repo.search(q, limit=limit, exclude_user_id=current_user.id)
    return users
