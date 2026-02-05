"""Pydantic schemas for Activity Log API."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ActivityLogEntry(BaseModel):
    """Activity log entry."""

    id: str
    project_id: str
    user_id: str
    username: str | None = None
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    entity_name: str | None = None
    details: dict[str, Any] | None = None
    created_at: datetime


class ActivityLogList(BaseModel):
    """Paginated activity log list."""

    items: list[ActivityLogEntry]
    total: int
    page: int
    page_size: int
