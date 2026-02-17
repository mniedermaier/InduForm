"""Admin API routes."""

import csv
import io
import logging
import time
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from induform.api.auth.dependencies import get_current_user
from induform.api.rate_limit import limiter
from induform.db import (
    ActivityLog,
    AssetDB,
    ConduitDB,
    LoginAttempt,
    MetricsSnapshot,
    ProjectDB,
    User,
    ZoneDB,
    get_db,
)

_server_start_time = time.monotonic()

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])


# --- Dependencies ---


async def get_admin_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Require the current user to be an admin."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


# --- Pydantic schemas ---


class AdminUserResponse(BaseModel):
    """Admin view of a user."""

    id: str
    email: str
    username: str
    display_name: str | None
    is_active: bool
    is_admin: bool
    created_at: datetime
    project_count: int

    model_config = {"from_attributes": True}


class AdminUserUpdate(BaseModel):
    """Schema for admin user update."""

    is_active: bool | None = None
    is_admin: bool | None = None


class AdminStatsResponse(BaseModel):
    """System-wide statistics."""

    total_users: int
    active_users: int
    total_projects: int
    total_zones: int
    total_assets: int
    total_conduits: int


class MakeAdminResponse(BaseModel):
    """Response for make-first-admin endpoint."""

    message: str
    is_admin: bool


class AdminProjectResponse(BaseModel):
    """Admin view of a project."""

    id: str
    name: str
    description: str | None
    owner_id: str
    owner_username: str
    is_archived: bool
    zone_count: int
    conduit_count: int
    asset_count: int
    risk_score: float | None
    compliance_score: float | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdminProjectUpdate(BaseModel):
    """Schema for admin project update (archive/unarchive)."""

    is_archived: bool | None = None


class AdminActivityResponse(BaseModel):
    """Admin view of an activity log entry."""

    id: str
    user_id: str
    username: str
    action: str
    entity_type: str | None
    entity_id: str | None
    entity_name: str | None
    project_id: str
    project_name: str | None
    details: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminHealthResponse(BaseModel):
    """System health information."""

    db_status: str
    uptime_seconds: float
    table_counts: dict[str, int]


class AdminSessionResponse(BaseModel):
    """Active session / user overview."""

    user_id: str
    username: str
    display_name: str | None
    is_active: bool
    last_login_at: datetime | None

    model_config = {"from_attributes": True}


class AdminTransferProject(BaseModel):
    """Schema for transferring project ownership."""

    new_owner_id: str


class AdminBulkUserUpdate(BaseModel):
    """Schema for bulk user updates."""

    user_ids: list[str]
    is_active: bool | None = None
    is_admin: bool | None = None


class AdminBulkUserUpdateResponse(BaseModel):
    """Response for bulk user update."""

    updated_count: int


class AdminLoginAttemptResponse(BaseModel):
    """Login attempt history entry."""

    id: str
    user_id: str | None
    username_attempted: str
    ip_address: str | None
    success: bool
    failure_reason: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Endpoints ---


@router.get("/users", response_model=list[AdminUserResponse])
@limiter.limit("30/minute")
async def list_users(
    request: Request,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 25,
) -> list[dict]:
    """List all users with project counts (admin only)."""
    # Query users with their project counts
    stmt = (
        select(
            User,
            func.count(ProjectDB.id).label("project_count"),
        )
        .outerjoin(ProjectDB, ProjectDB.owner_id == User.id)
        .group_by(User.id)
        .order_by(User.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    result = await db.execute(stmt)
    rows = result.all()

    users = []
    for user, project_count in rows:
        users.append(
            {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "display_name": user.display_name,
                "is_active": user.is_active,
                "is_admin": user.is_admin,
                "created_at": user.created_at,
                "project_count": project_count,
            }
        )

    return users


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
@limiter.limit("20/minute")
async def update_user(
    request: Request,
    user_id: str,
    body: AdminUserUpdate,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Update a user's admin/active status (admin only)."""
    # Prevent self-demotion
    if user_id == admin_user.id and body.is_admin is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove your own admin privileges",
        )

    # Find the target user
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Apply updates
    if body.is_active is not None:
        target_user.is_active = body.is_active
    if body.is_admin is not None:
        target_user.is_admin = body.is_admin

    await db.flush()

    # Get project count
    count_result = await db.execute(
        select(func.count(ProjectDB.id)).where(ProjectDB.owner_id == user_id)
    )
    project_count = count_result.scalar() or 0

    logger.info(
        "Admin %s updated user %s: is_active=%s, is_admin=%s",
        admin_user.username,
        target_user.username,
        target_user.is_active,
        target_user.is_admin,
    )

    return {
        "id": target_user.id,
        "email": target_user.email,
        "username": target_user.username,
        "display_name": target_user.display_name,
        "is_active": target_user.is_active,
        "is_admin": target_user.is_admin,
        "created_at": target_user.created_at,
        "project_count": project_count,
    }


@router.get("/stats", response_model=AdminStatsResponse)
@limiter.limit("30/minute")
async def get_stats(
    request: Request,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Get system-wide statistics (admin only)."""
    total_users_result = await db.execute(select(func.count(User.id)))
    total_users = total_users_result.scalar() or 0

    active_users_result = await db.execute(
        select(func.count(User.id)).where(User.is_active == True)  # noqa: E712
    )
    active_users = active_users_result.scalar() or 0

    total_projects_result = await db.execute(select(func.count(ProjectDB.id)))
    total_projects = total_projects_result.scalar() or 0

    total_zones_result = await db.execute(select(func.count(ZoneDB.id)))
    total_zones = total_zones_result.scalar() or 0

    total_assets_result = await db.execute(select(func.count(AssetDB.id)))
    total_assets = total_assets_result.scalar() or 0

    total_conduits_result = await db.execute(select(func.count(ConduitDB.id)))
    total_conduits = total_conduits_result.scalar() or 0

    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_projects": total_projects,
        "total_zones": total_zones,
        "total_assets": total_assets,
        "total_conduits": total_conduits,
    }


@router.get("/projects", response_model=list[AdminProjectResponse])
@limiter.limit("30/minute")
async def list_projects(
    request: Request,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 25,
    search: str = "",
) -> list[dict]:
    """List all projects with owner info, counts, and metrics (admin only)."""
    stmt = (
        select(
            ProjectDB,
            User.username.label("owner_username"),
            func.count(ZoneDB.id.distinct()).label("zone_count"),
            func.count(ConduitDB.id.distinct()).label("conduit_count"),
        )
        .join(User, ProjectDB.owner_id == User.id)
        .outerjoin(ZoneDB, ZoneDB.project_id == ProjectDB.id)
        .outerjoin(ConduitDB, ConduitDB.project_id == ProjectDB.id)
        .group_by(ProjectDB.id, User.username)
        .order_by(ProjectDB.updated_at.desc())
    )

    if search:
        stmt = stmt.where(ProjectDB.name.ilike(f"%{search}%"))

    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    rows = result.all()

    # Batch-load asset counts per project
    project_ids = [row[0].id for row in rows]
    asset_counts: dict[str, int] = {}
    if project_ids:
        asset_stmt = (
            select(
                ZoneDB.project_id,
                func.count(AssetDB.id).label("asset_count"),
            )
            .join(AssetDB, AssetDB.zone_db_id == ZoneDB.id)
            .where(ZoneDB.project_id.in_(project_ids))
            .group_by(ZoneDB.project_id)
        )
        asset_result = await db.execute(asset_stmt)
        for pid, count in asset_result.all():
            asset_counts[pid] = count

    # Batch-load latest metrics snapshots
    metrics_map: dict[str, MetricsSnapshot] = {}
    if project_ids:
        # Subquery: max recorded_at per project
        latest_sub = (
            select(
                MetricsSnapshot.project_id,
                func.max(MetricsSnapshot.recorded_at).label("max_at"),
            )
            .where(MetricsSnapshot.project_id.in_(project_ids))
            .group_by(MetricsSnapshot.project_id)
            .subquery()
        )
        metrics_stmt = select(MetricsSnapshot).join(
            latest_sub,
            (MetricsSnapshot.project_id == latest_sub.c.project_id)
            & (MetricsSnapshot.recorded_at == latest_sub.c.max_at),
        )
        metrics_result = await db.execute(metrics_stmt)
        for m in metrics_result.scalars().all():
            metrics_map[m.project_id] = m

    projects = []
    for project_db, owner_username, zone_count, conduit_count in rows:
        metrics = metrics_map.get(project_db.id)
        projects.append(
            {
                "id": project_db.id,
                "name": project_db.name,
                "description": project_db.description,
                "owner_id": project_db.owner_id,
                "owner_username": owner_username,
                "is_archived": project_db.is_archived,
                "zone_count": zone_count,
                "conduit_count": conduit_count,
                "asset_count": asset_counts.get(project_db.id, 0),
                "risk_score": metrics.risk_score if metrics else None,
                "compliance_score": metrics.compliance_score if metrics else None,
                "created_at": project_db.created_at,
                "updated_at": project_db.updated_at,
            }
        )

    return projects


@router.patch("/projects/{project_id}", response_model=AdminProjectResponse)
@limiter.limit("20/minute")
async def update_project(
    request: Request,
    project_id: str,
    body: AdminProjectUpdate,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Archive or unarchive a project (admin only)."""
    result = await db.execute(
        select(ProjectDB, User.username)
        .join(User, ProjectDB.owner_id == User.id)
        .where(ProjectDB.id == project_id)
    )
    row = result.one_or_none()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    project_db, owner_username = row

    if body.is_archived is not None:
        project_db.is_archived = body.is_archived
        project_db.archived_at = datetime.utcnow() if body.is_archived else None

    await db.flush()

    # Get counts
    zone_result = await db.execute(
        select(func.count(ZoneDB.id)).where(ZoneDB.project_id == project_id)
    )
    conduit_result = await db.execute(
        select(func.count(ConduitDB.id)).where(ConduitDB.project_id == project_id)
    )
    asset_result = await db.execute(
        select(func.count(AssetDB.id))
        .join(ZoneDB, AssetDB.zone_db_id == ZoneDB.id)
        .where(ZoneDB.project_id == project_id)
    )

    logger.info(
        "Admin %s updated project %s: is_archived=%s",
        admin_user.username,
        project_db.name,
        project_db.is_archived,
    )

    return {
        "id": project_db.id,
        "name": project_db.name,
        "description": project_db.description,
        "owner_id": project_db.owner_id,
        "owner_username": owner_username,
        "is_archived": project_db.is_archived,
        "zone_count": zone_result.scalar() or 0,
        "conduit_count": conduit_result.scalar() or 0,
        "asset_count": asset_result.scalar() or 0,
        "risk_score": None,
        "compliance_score": None,
        "created_at": project_db.created_at,
        "updated_at": project_db.updated_at,
    }


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def delete_project(
    request: Request,
    project_id: str,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Hard delete a project (admin only)."""
    result = await db.execute(select(ProjectDB).where(ProjectDB.id == project_id))
    project_db = result.scalar_one_or_none()

    if project_db is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    logger.warning(
        "Admin %s deleting project %s (%s)",
        admin_user.username,
        project_db.name,
        project_db.id,
    )

    await db.delete(project_db)
    await db.flush()


@router.get("/activity", response_model=list[AdminActivityResponse])
@limiter.limit("30/minute")
async def list_activity(
    request: Request,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 50,
    action: str = "",
    user_id: str = "",
) -> list[dict]:
    """List system-wide activity logs (admin only)."""
    stmt = select(ActivityLog).order_by(ActivityLog.created_at.desc())

    if action:
        stmt = stmt.where(ActivityLog.action == action)
    if user_id:
        stmt = stmt.where(ActivityLog.user_id == user_id)

    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    # Batch load usernames and project names
    user_ids = list({log.user_id for log in logs})
    project_ids = list({log.project_id for log in logs})

    username_map: dict[str, str] = {}
    if user_ids:
        users_result = await db.execute(select(User.id, User.username).where(User.id.in_(user_ids)))
        for uid, uname in users_result.all():
            username_map[uid] = uname

    project_name_map: dict[str, str] = {}
    if project_ids:
        projects_result = await db.execute(
            select(ProjectDB.id, ProjectDB.name).where(ProjectDB.id.in_(project_ids))
        )
        for pid, pname in projects_result.all():
            project_name_map[pid] = pname

    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "username": username_map.get(log.user_id, "unknown"),
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "entity_name": log.entity_name,
            "project_id": log.project_id,
            "project_name": project_name_map.get(log.project_id),
            "details": log.details,
            "created_at": log.created_at,
        }
        for log in logs
    ]


@router.get("/health", response_model=AdminHealthResponse)
@limiter.limit("30/minute")
async def get_health(
    request: Request,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Get system health: DB status, uptime, table row counts."""
    uptime = time.monotonic() - _server_start_time

    # DB connectivity check
    db_status = "ok"
    try:
        from sqlalchemy import text

        await db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"

    # Table row counts
    counts: dict[str, int] = {}
    for label, model in [
        ("users", User),
        ("projects", ProjectDB),
        ("zones", ZoneDB),
        ("assets", AssetDB),
        ("conduits", ConduitDB),
        ("activity_logs", ActivityLog),
        ("login_attempts", LoginAttempt),
    ]:
        result = await db.execute(select(func.count(model.id)))
        counts[label] = result.scalar() or 0

    return {
        "db_status": db_status,
        "uptime_seconds": round(uptime, 1),
        "table_counts": counts,
    }


@router.get("/sessions", response_model=list[AdminSessionResponse])
@limiter.limit("30/minute")
async def list_sessions(
    request: Request,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict]:
    """List users sorted by last login (active sessions overview)."""
    stmt = (
        select(User)
        .where(User.is_active == True)  # noqa: E712
        .order_by(User.last_login_at.desc().nullslast())
        .limit(100)
    )
    result = await db.execute(stmt)
    users = result.scalars().all()

    return [
        {
            "user_id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "is_active": u.is_active,
            "last_login_at": u.last_login_at,
        }
        for u in users
    ]


@router.post("/sessions/{user_id}/revoke-all", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def force_logout_user(
    request: Request,
    user_id: str,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Force logout a user by invalidating all their tokens."""
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()

    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    target_user.force_logout_at = datetime.utcnow()
    await db.flush()

    logger.info(
        "Admin %s force-logged-out user %s",
        admin_user.username,
        target_user.username,
    )


@router.patch("/projects/{project_id}/transfer", response_model=AdminProjectResponse)
@limiter.limit("10/minute")
async def transfer_project(
    request: Request,
    project_id: str,
    body: AdminTransferProject,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Transfer project ownership to another user."""
    # Load project with owner
    result = await db.execute(
        select(ProjectDB, User.username)
        .join(User, ProjectDB.owner_id == User.id)
        .where(ProjectDB.id == project_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    project_db, _old_owner_username = row

    # Validate new owner
    new_owner_result = await db.execute(select(User).where(User.id == body.new_owner_id))
    new_owner = new_owner_result.scalar_one_or_none()
    if new_owner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="New owner not found")
    if not new_owner.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New owner account is disabled",
        )

    project_db.owner_id = new_owner.id
    await db.flush()

    # Get counts for response
    zone_result = await db.execute(
        select(func.count(ZoneDB.id)).where(ZoneDB.project_id == project_id)
    )
    conduit_result = await db.execute(
        select(func.count(ConduitDB.id)).where(ConduitDB.project_id == project_id)
    )
    asset_result = await db.execute(
        select(func.count(AssetDB.id))
        .join(ZoneDB, AssetDB.zone_db_id == ZoneDB.id)
        .where(ZoneDB.project_id == project_id)
    )

    logger.info(
        "Admin %s transferred project %s to %s",
        admin_user.username,
        project_db.name,
        new_owner.username,
    )

    return {
        "id": project_db.id,
        "name": project_db.name,
        "description": project_db.description,
        "owner_id": project_db.owner_id,
        "owner_username": new_owner.username,
        "is_archived": project_db.is_archived,
        "zone_count": zone_result.scalar() or 0,
        "conduit_count": conduit_result.scalar() or 0,
        "asset_count": asset_result.scalar() or 0,
        "risk_score": None,
        "compliance_score": None,
        "created_at": project_db.created_at,
        "updated_at": project_db.updated_at,
    }


@router.get("/activity/export")
@limiter.limit("5/minute")
async def export_activity_csv(
    request: Request,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    """Export activity log as CSV (max 10,000 rows)."""
    stmt = select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(10000)
    result = await db.execute(stmt)
    logs = result.scalars().all()

    # Batch load usernames and project names
    user_ids = list({log.user_id for log in logs})
    project_ids = list({log.project_id for log in logs})

    username_map: dict[str, str] = {}
    if user_ids:
        users_result = await db.execute(select(User.id, User.username).where(User.id.in_(user_ids)))
        for uid, uname in users_result.all():
            username_map[uid] = uname

    project_name_map: dict[str, str] = {}
    if project_ids:
        projects_result = await db.execute(
            select(ProjectDB.id, ProjectDB.name).where(ProjectDB.id.in_(project_ids))
        )
        for pid, pname in projects_result.all():
            project_name_map[pid] = pname

    # Write CSV to in-memory buffer
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "timestamp",
            "username",
            "action",
            "entity_type",
            "entity_name",
            "project_name",
            "details",
        ]
    )
    for log in logs:
        writer.writerow(
            [
                log.created_at.isoformat() if log.created_at else "",
                username_map.get(log.user_id, "unknown"),
                log.action,
                log.entity_type or "",
                log.entity_name or "",
                project_name_map.get(log.project_id, ""),
                log.details or "",
            ]
        )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=activity_log.csv"},
    )


@router.post("/users/bulk-update", response_model=AdminBulkUserUpdateResponse)
@limiter.limit("10/minute")
async def bulk_update_users(
    request: Request,
    body: AdminBulkUserUpdate,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Bulk update user active/admin status."""
    if not body.user_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No user IDs provided",
        )

    # Prevent self-modification
    target_ids = [uid for uid in body.user_ids if uid != admin_user.id]
    if not target_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify your own account in bulk",
        )

    values: dict = {}
    if body.is_active is not None:
        values["is_active"] = body.is_active
    if body.is_admin is not None:
        values["is_admin"] = body.is_admin

    if not values:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No updates specified",
        )

    stmt = update(User).where(User.id.in_(target_ids)).values(**values)
    result = await db.execute(stmt)
    await db.flush()

    logger.info(
        "Admin %s bulk-updated %d users: %s",
        admin_user.username,
        result.rowcount,
        values,
    )

    return {"updated_count": result.rowcount}


@router.get("/login-history", response_model=list[AdminLoginAttemptResponse])
@limiter.limit("30/minute")
async def list_login_history(
    request: Request,
    admin_user: Annotated[User, Depends(get_admin_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 50,
    user_id: str = "",
    success: str = "",
) -> list[dict]:
    """List login attempt history (paginated, filterable)."""
    stmt = select(LoginAttempt).order_by(LoginAttempt.created_at.desc())

    if user_id:
        stmt = stmt.where(LoginAttempt.user_id == user_id)
    if success in ("true", "false"):
        stmt = stmt.where(LoginAttempt.success == (success == "true"))

    stmt = stmt.offset(skip).limit(min(limit, 100))
    result = await db.execute(stmt)
    attempts = result.scalars().all()

    return [
        {
            "id": a.id,
            "user_id": a.user_id,
            "username_attempted": a.username_attempted,
            "ip_address": a.ip_address,
            "success": a.success,
            "failure_reason": a.failure_reason,
            "created_at": a.created_at,
        }
        for a in attempts
    ]


@router.post("/make-first-admin", response_model=MakeAdminResponse)
@limiter.limit("5/minute")
async def make_first_admin(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Make the current user an admin if no admins exist yet.

    This is a one-time setup endpoint for initial deployment.
    Returns 400 if any admin already exists.
    """
    # Check if any admins exist
    result = await db.execute(
        select(func.count(User.id)).where(User.is_admin == True)  # noqa: E712
    )
    admin_count = result.scalar() or 0

    if admin_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin users already exist. Contact an existing admin.",
        )

    # Make current user admin
    current_user.is_admin = True
    await db.flush()

    logger.info("First admin created: %s (%s)", current_user.username, current_user.email)

    return {
        "message": f"User {current_user.username} is now an admin",
        "is_admin": True,
    }
