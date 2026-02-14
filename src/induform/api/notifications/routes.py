"""API routes for notifications."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from induform.api.auth.dependencies import get_current_user, get_db
from induform.api.notifications.schemas import (
    NotificationList,
    NotificationMarkRead,
    NotificationOut,
)
from induform.db.models import Notification, User

router = APIRouter(prefix="/notifications", tags=["notifications"])


async def create_notification(
    db: AsyncSession,
    user_id: str,
    type: str,
    title: str,
    message: str | None = None,
    link: str | None = None,
    project_id: str | None = None,
    actor_id: str | None = None,
) -> Notification:
    """Helper function to create a notification."""
    notification = Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        link=link,
        project_id=project_id,
        actor_id=actor_id,
    )
    db.add(notification)
    await db.flush()
    return notification


@router.get("/", response_model=NotificationList)
async def list_notifications(
    unread_only: bool = False,
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List notifications for the current user."""
    # Base query
    query = select(Notification).where(Notification.user_id == current_user.id)

    if unread_only:
        query = query.where(Notification.is_read == False)  # noqa: E712

    query = query.order_by(Notification.created_at.desc()).limit(limit)
    result = await db.execute(query)
    notifications = result.scalars().all()

    # Get total count
    count_query = select(func.count(Notification.id)).where(Notification.user_id == current_user.id)
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # Get unread count
    unread_query = select(func.count(Notification.id)).where(
        Notification.user_id == current_user.id,
        Notification.is_read == False,  # noqa: E712
    )
    unread_result = await db.execute(unread_query)
    unread_count = unread_result.scalar() or 0

    # Batch-load actor usernames to avoid N+1 queries
    actor_ids = {notif.actor_id for notif in notifications if notif.actor_id}
    if actor_ids:
        actor_query = select(User).where(User.id.in_(actor_ids))
        actor_result = await db.execute(actor_query)
        actors = {u.id: u.username for u in actor_result.scalars().all()}
    else:
        actors = {}

    items = [
        NotificationOut(
            id=notif.id,
            type=notif.type,
            title=notif.title,
            message=notif.message,
            link=notif.link,
            project_id=notif.project_id,
            actor_id=notif.actor_id,
            actor_username=actors.get(notif.actor_id) if notif.actor_id else None,
            is_read=notif.is_read,
            created_at=notif.created_at,
        )
        for notif in notifications
    ]

    return NotificationList(
        items=items,
        total=total,
        unread_count=unread_count,
    )


@router.post("/mark-read")
async def mark_notifications_read(
    data: NotificationMarkRead,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark notifications as read."""
    if data.notification_ids:
        # Mark specific notifications as read
        stmt = (
            update(Notification)
            .where(
                Notification.user_id == current_user.id,
                Notification.id.in_(data.notification_ids),
            )
            .values(is_read=True)
        )
    else:
        # Mark all as read
        stmt = (
            update(Notification).where(Notification.user_id == current_user.id).values(is_read=True)
        )

    await db.execute(stmt)
    await db.commit()

    return {"message": "Notifications marked as read"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a notification."""
    query = select(Notification).where(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    )
    result = await db.execute(query)
    notification = result.scalar_one_or_none()

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    await db.delete(notification)
    await db.commit()

    return {"message": "Notification deleted"}
