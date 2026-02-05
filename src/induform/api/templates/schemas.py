"""Pydantic schemas for Templates API."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TemplateCreate(BaseModel):
    """Schema for creating a new template from a project."""

    project_id: str = Field(..., description="ID of the project to save as template")
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    category: str | None = None
    is_public: bool = False


class TemplateUpdate(BaseModel):
    """Schema for updating a template."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    category: str | None = None
    is_public: bool | None = None


class TemplateSummary(BaseModel):
    """Summary information about a template."""

    id: str
    name: str
    description: str | None
    category: str | None
    owner_id: str
    owner_username: str | None = None
    is_public: bool
    is_builtin: bool = False
    zone_count: int = 0
    asset_count: int = 0
    conduit_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TemplateDetail(BaseModel):
    """Full template detail including project data."""

    id: str
    name: str
    description: str | None
    category: str | None
    owner_id: str
    owner_username: str | None = None
    is_public: bool
    is_builtin: bool = False
    zone_count: int = 0
    asset_count: int = 0
    conduit_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None
    project: dict[str, Any]  # Full Project as dict
