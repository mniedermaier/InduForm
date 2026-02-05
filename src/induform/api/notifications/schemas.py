"""Pydantic schemas for Notifications API."""

from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    """Notification output schema."""

    id: str
    type: str
    title: str
    message: str | None = None
    link: str | None = None
    project_id: str | None = None
    actor_id: str | None = None
    actor_username: str | None = None
    is_read: bool
    created_at: datetime


class NotificationList(BaseModel):
    """Paginated notification list."""

    items: list[NotificationOut]
    total: int
    unread_count: int


class NotificationMarkRead(BaseModel):
    """Mark notifications as read request."""

    notification_ids: list[str] | None = None  # None means mark all as read
