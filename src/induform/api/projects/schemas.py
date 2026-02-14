"""Pydantic schemas for Projects API."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    """Schema for creating a new project."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    standard: str = Field(default="IEC62443")
    compliance_standards: list[str] = Field(default=["IEC62443"])
    allowed_protocols: list[str] = Field(default=[])


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


class ProjectSummary(BaseModel):
    """Summary information about a project."""

    id: str
    name: str
    description: str | None
    standard: str
    compliance_standards: list[str] = Field(default=["IEC62443"])
    allowed_protocols: list[str] = Field(default=[])
    owner_id: str
    owner_username: str | None = None
    created_at: datetime
    updated_at: datetime
    zone_count: int = 0
    conduit_count: int = 0
    asset_count: int = 0
    permission: str  # owner, editor, viewer
    risk_score: int | None = None  # 0-100 score
    risk_level: str | None = None  # critical, high, medium, low, minimal
    compliance_score: int | None = None  # 0-100 percentage
    zone_types: dict[str, int] | None = None  # e.g., {"enterprise": 1, "dmz": 2, "cell": 3}
    is_archived: bool = False
    archived_at: datetime | None = None


class ProjectDetail(BaseModel):
    """Full project detail including data."""

    id: str
    name: str
    description: str | None
    standard: str
    compliance_standards: list[str] = Field(default=["IEC62443"])
    allowed_protocols: list[str] = Field(default=[])
    version: str
    owner_id: str
    owner_username: str | None = None
    created_at: datetime
    updated_at: datetime
    permission: str
    project: dict[str, Any]  # Full Pydantic Project as dict


class ProjectAccessInfo(BaseModel):
    """Information about a project access grant."""

    id: str
    user_id: str | None
    user_email: str | None
    user_username: str | None
    team_id: str | None
    team_name: str | None
    permission: str
    granted_by: str
    granted_at: datetime


class GrantAccessRequest(BaseModel):
    """Request to grant access to a project."""

    user_id: str | None = None
    team_id: str | None = None
    permission: str = Field(default="viewer", pattern=r"^(viewer|editor)$")


class ImportYamlRequest(BaseModel):
    """Request to import a project from YAML."""

    yaml_content: str
    name: str | None = None  # Optional override name


class CsvImportResult(BaseModel):
    """Result of a CSV import operation."""

    imported: int
    skipped: int
    errors: list[dict[str, str]]


class ComparisonResult(BaseModel):
    """Result of comparing two projects."""

    zones: dict[str, list[dict]] = {}
    assets: dict[str, list[dict]] = {}
    conduits: dict[str, list[dict]] = {}
    summary: dict[str, int] = {}
