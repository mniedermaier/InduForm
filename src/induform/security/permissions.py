"""Permission checking utilities."""

from enum import StrEnum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from induform.db.models import ProjectAccess, ProjectDB, TeamMember


class Permission(StrEnum):
    """Permission levels for project access."""

    VIEWER = "viewer"
    EDITOR = "editor"
    OWNER = "owner"


async def check_project_permission(
    session: AsyncSession,
    project_id: str,
    user_id: str,
    required_permission: Permission = Permission.VIEWER,
    is_admin: bool = False,
) -> bool:
    """Check if a user has the required permission on a project.

    Args:
        session: Database session.
        project_id: The project ID to check.
        user_id: The user ID to check permissions for.
        required_permission: The minimum required permission level.
        is_admin: If True, bypass permission checks (admin has full access).

    Returns:
        True if user has the required permission, False otherwise.
    """
    if is_admin:
        return True

    # First, check if user is the project owner
    result = await session.execute(select(ProjectDB).where(ProjectDB.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        return False

    # Owner has full access
    if project.owner_id == user_id:
        return True

    # If only viewer access is required, check any access level
    # If editor access is required, only editor access counts

    # Check direct user access
    result = await session.execute(
        select(ProjectAccess).where(
            ProjectAccess.project_id == project_id,
            ProjectAccess.user_id == user_id,
        )
    )
    direct_access = result.scalar_one_or_none()

    if direct_access:
        if required_permission == Permission.VIEWER:
            return True
        if required_permission == Permission.EDITOR and direct_access.permission == "editor":
            return True

    # Check team-based access
    result = await session.execute(
        select(ProjectAccess)
        .join(TeamMember, ProjectAccess.team_id == TeamMember.team_id)
        .where(
            ProjectAccess.project_id == project_id,
            TeamMember.user_id == user_id,
        )
    )
    team_access = result.scalar_one_or_none()

    if team_access:
        if required_permission == Permission.VIEWER:
            return True
        if required_permission == Permission.EDITOR and team_access.permission == "editor":
            return True

    return False


async def get_user_permission(
    session: AsyncSession,
    project_id: str,
    user_id: str,
    is_admin: bool = False,
) -> Permission | None:
    """Get the user's permission level on a project.

    Args:
        session: Database session.
        project_id: The project ID to check.
        user_id: The user ID to check permissions for.
        is_admin: If True, return OWNER permission (admin has full access).

    Returns:
        The user's permission level, or None if no access.
    """
    if is_admin:
        return Permission.OWNER

    # Check if user is the project owner
    result = await session.execute(select(ProjectDB).where(ProjectDB.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        return None

    if project.owner_id == user_id:
        return Permission.OWNER

    # Check direct user access
    result = await session.execute(
        select(ProjectAccess).where(
            ProjectAccess.project_id == project_id,
            ProjectAccess.user_id == user_id,
        )
    )
    direct_access = result.scalar_one_or_none()

    if direct_access:
        return Permission(direct_access.permission)

    # Check team-based access
    result = await session.execute(
        select(ProjectAccess)
        .join(TeamMember, ProjectAccess.team_id == TeamMember.team_id)
        .where(
            ProjectAccess.project_id == project_id,
            TeamMember.user_id == user_id,
        )
    )
    team_access = result.scalar_one_or_none()

    if team_access:
        return Permission(team_access.permission)

    return None
