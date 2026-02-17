"""Presence tracking API routes."""

from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from induform.api.auth.dependencies import get_current_user
from induform.db import User, get_db
from induform.security.permissions import Permission, check_project_permission

router = APIRouter(prefix="/presence", tags=["Presence"])


# In-memory presence store (could be Redis in production)
# Format: {project_id: {user_id: {"username": str, "display_name": str, "last_seen": datetime}}}
_presence_store: dict[str, dict[str, dict]] = {}


# Presence timeout - users not seen for this long are considered gone
PRESENCE_TIMEOUT = timedelta(seconds=60)


class PresenceUpdate(BaseModel):
    """Presence update request."""

    project_id: str


class UserPresence(BaseModel):
    """User presence information."""

    user_id: str
    username: str
    display_name: str | None
    last_seen: datetime


class ProjectPresence(BaseModel):
    """Presence information for a project."""

    project_id: str
    viewers: list[UserPresence]


def cleanup_stale_presence():
    """Remove stale presence entries."""
    now = datetime.utcnow()
    for project_id in list(_presence_store.keys()):
        project_viewers = _presence_store[project_id]
        for user_id in list(project_viewers.keys()):
            last_seen = project_viewers[user_id].get("last_seen", datetime.min)
            if now - last_seen > PRESENCE_TIMEOUT:
                del project_viewers[user_id]
        if not project_viewers:
            del _presence_store[project_id]


@router.post("/heartbeat")
async def update_presence(
    request: PresenceUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """
    Send a heartbeat to indicate the user is viewing a project.
    Should be called periodically (e.g., every 30 seconds).
    """
    # Verify access to project
    has_access = await check_project_permission(
        db, request.project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Update presence
    if request.project_id not in _presence_store:
        _presence_store[request.project_id] = {}

    _presence_store[request.project_id][current_user.id] = {
        "username": current_user.username,
        "display_name": current_user.display_name,
        "last_seen": datetime.utcnow(),
    }

    # Cleanup stale entries periodically
    cleanup_stale_presence()

    return {"status": "ok"}


@router.get("/{project_id}", response_model=ProjectPresence)
async def get_project_presence(
    project_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProjectPresence:
    """Get current viewers of a project."""
    # Verify access to project
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Cleanup stale entries
    cleanup_stale_presence()

    viewers = []

    if project_id in _presence_store:
        for user_id, data in _presence_store[project_id].items():
            # Exclude current user from the list
            if user_id != current_user.id:
                viewers.append(
                    UserPresence(
                        user_id=user_id,
                        username=data["username"],
                        display_name=data.get("display_name"),
                        last_seen=data["last_seen"],
                    )
                )

    return ProjectPresence(
        project_id=project_id,
        viewers=viewers,
    )


@router.delete("/leave")
async def leave_project(
    request: PresenceUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Leave a project (remove presence)."""
    if request.project_id in _presence_store:
        _presence_store[request.project_id].pop(current_user.id, None)
        if not _presence_store[request.project_id]:
            del _presence_store[request.project_id]

    return {"status": "ok"}
