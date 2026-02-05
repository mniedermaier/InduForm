"""Pydantic schemas for Comments API."""

from datetime import datetime

from pydantic import BaseModel, Field


class CommentCreate(BaseModel):
    """Schema for creating a new comment."""

    entity_type: str = Field(..., pattern=r"^(zone|conduit|asset)$")
    entity_id: str = Field(..., min_length=1)
    text: str = Field(..., min_length=1, max_length=2000)


class CommentUpdate(BaseModel):
    """Schema for updating a comment."""

    text: str = Field(..., min_length=1, max_length=2000)


class CommentResponse(BaseModel):
    """Response schema for a comment."""

    id: str
    project_id: str
    entity_type: str
    entity_id: str
    author_id: str
    author_username: str | None = None
    author_display_name: str | None = None
    text: str
    is_resolved: bool
    resolved_by: str | None
    resolver_username: str | None = None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime


class CommentCountResponse(BaseModel):
    """Response schema for comment counts."""

    total: int
    unresolved: int
