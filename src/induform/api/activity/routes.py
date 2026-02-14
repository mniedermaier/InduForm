"""API routes for activity logs."""

import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from induform.api.activity.schemas import ActivityLogEntry, ActivityLogList
from induform.api.auth.dependencies import get_current_user, get_db
from induform.api.rate_limit import limiter
from induform.db.models import ActivityLog, User
from induform.db.repositories.project_repository import ProjectRepository

router = APIRouter(prefix="/projects/{project_id}/activity", tags=["activity"])


async def log_activity(
    db: AsyncSession,
    project_id: str,
    user_id: str,
    action: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    entity_name: str | None = None,
    details: dict | None = None,
) -> ActivityLog:
    """Helper function to log an activity."""
    log = ActivityLog(
        project_id=project_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        details=json.dumps(details) if details else None,
    )
    db.add(log)
    await db.flush()
    return log


@router.get("/", response_model=ActivityLogList)
async def get_activity_log(
    project_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get activity log for a project."""
    # Check project access
    repo = ProjectRepository(db)
    project = await repo.get_with_permission_check(project_id, current_user.id, "viewer")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get total count
    count_query = select(func.count(ActivityLog.id)).where(ActivityLog.project_id == project_id)
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # Get paginated logs
    offset = (page - 1) * page_size
    query = (
        select(ActivityLog)
        .where(ActivityLog.project_id == project_id)
        .order_by(ActivityLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(query)
    logs = result.scalars().all()

    # Batch-load usernames to avoid N+1 queries
    user_ids = {log.user_id for log in logs}
    if user_ids:
        user_query = select(User).where(User.id.in_(user_ids))
        user_result = await db.execute(user_query)
        users = {u.id: u.username for u in user_result.scalars().all()}
    else:
        users = {}

    items = [
        ActivityLogEntry(
            id=log.id,
            project_id=log.project_id,
            user_id=log.user_id,
            username=users.get(log.user_id),
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            entity_name=log.entity_name,
            details=json.loads(log.details) if log.details else None,
            created_at=log.created_at,
        )
        for log in logs
    ]

    return ActivityLogList(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/export")
@limiter.limit("10/minute")
async def export_activity_csv(
    request: Request,
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export activity log as CSV."""
    # Check project access
    repo = ProjectRepository(db)
    project = await repo.get_with_permission_check(project_id, current_user.id, "viewer")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get all logs
    query = (
        select(ActivityLog)
        .where(ActivityLog.project_id == project_id)
        .order_by(ActivityLog.created_at.desc())
    )
    result = await db.execute(query)
    logs = result.scalars().all()

    # Batch-load usernames
    user_ids = {log.user_id for log in logs}
    if user_ids:
        user_query = select(User).where(User.id.in_(user_ids))
        user_result = await db.execute(user_query)
        users = {u.id: u.username for u in user_result.scalars().all()}
    else:
        users = {}

    # Build CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["Timestamp", "User", "Action", "Entity Type", "Entity ID", "Entity Name", "Details"]
    )

    for log in logs:
        writer.writerow(
            [
                log.created_at.isoformat() if log.created_at else "",
                users.get(log.user_id, log.user_id),
                log.action,
                log.entity_type or "",
                log.entity_id or "",
                log.entity_name or "",
                log.details or "",
            ]
        )

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=activity_{project_id}.csv"},
    )
