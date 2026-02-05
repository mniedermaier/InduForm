"""Pydantic schemas for Teams API."""

from datetime import datetime

from pydantic import BaseModel, Field


class TeamCreate(BaseModel):
    """Schema for creating a new team."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


class TeamUpdate(BaseModel):
    """Schema for updating a team."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


class TeamMemberInfo(BaseModel):
    """Information about a team member."""

    user_id: str
    username: str
    email: str
    display_name: str | None
    role: str  # owner, admin, member
    joined_at: datetime


class TeamSummary(BaseModel):
    """Summary information about a team."""

    id: str
    name: str
    description: str | None
    created_by: str
    created_at: datetime
    member_count: int
    your_role: str  # owner, admin, member


class TeamDetail(BaseModel):
    """Full team detail including members."""

    id: str
    name: str
    description: str | None
    created_by: str
    created_at: datetime
    members: list[TeamMemberInfo]


class AddMemberRequest(BaseModel):
    """Request to add a member to a team."""

    user_id: str
    role: str = Field(default="member", pattern=r"^(admin|member)$")


class UpdateMemberRoleRequest(BaseModel):
    """Request to update a member's role."""

    role: str = Field(..., pattern=r"^(admin|member)$")
