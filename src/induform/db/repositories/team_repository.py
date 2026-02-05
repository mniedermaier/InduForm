"""Team repository for database operations."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from induform.db.models import Team, TeamMember, User


class TeamRepository:
    """Repository for Team operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        name: str,
        created_by: str,
        description: str | None = None,
    ) -> Team:
        """Create a new team and add creator as owner."""
        team = Team(
            name=name,
            description=description,
            created_by=created_by,
        )
        self.session.add(team)
        await self.session.flush()

        # Add creator as team owner
        member = TeamMember(
            team_id=team.id,
            user_id=created_by,
            role="owner",
        )
        self.session.add(member)
        await self.session.flush()

        return team

    async def get_by_id(self, team_id: str) -> Team | None:
        """Get a team by ID with members loaded."""
        result = await self.session.execute(
            select(Team)
            .options(selectinload(Team.members).selectinload(TeamMember.user))
            .where(Team.id == team_id)
        )
        return result.scalar_one_or_none()

    async def get_user_teams(self, user_id: str) -> list[Team]:
        """Get all teams a user belongs to."""
        result = await self.session.execute(
            select(Team)
            .join(TeamMember)
            .where(TeamMember.user_id == user_id)
            .options(selectinload(Team.members))
            .order_by(Team.name)
        )
        return list(result.scalars().unique().all())

    async def update(self, team: Team, **kwargs) -> Team:
        """Update a team's attributes."""
        for key, value in kwargs.items():
            if hasattr(team, key) and key not in ("id", "created_by", "created_at"):
                setattr(team, key, value)
        await self.session.flush()
        return team

    async def delete(self, team: Team) -> None:
        """Delete a team."""
        await self.session.delete(team)
        await self.session.flush()

    async def add_member(
        self,
        team_id: str,
        user_id: str,
        role: str = "member",
    ) -> TeamMember:
        """Add a member to a team."""
        member = TeamMember(
            team_id=team_id,
            user_id=user_id,
            role=role,
        )
        self.session.add(member)
        await self.session.flush()
        return member

    async def remove_member(self, team_id: str, user_id: str) -> bool:
        """Remove a member from a team."""
        result = await self.session.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user_id,
            )
        )
        member = result.scalar_one_or_none()
        if member:
            await self.session.delete(member)
            await self.session.flush()
            return True
        return False

    async def update_member_role(
        self,
        team_id: str,
        user_id: str,
        role: str,
    ) -> TeamMember | None:
        """Update a team member's role."""
        result = await self.session.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user_id,
            )
        )
        member = result.scalar_one_or_none()
        if member:
            member.role = role
            await self.session.flush()
        return member

    async def get_member(self, team_id: str, user_id: str) -> TeamMember | None:
        """Get a specific team member."""
        result = await self.session.execute(
            select(TeamMember)
            .options(selectinload(TeamMember.user))
            .where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def is_member(self, team_id: str, user_id: str) -> bool:
        """Check if a user is a member of a team."""
        member = await self.get_member(team_id, user_id)
        return member is not None

    async def is_owner_or_admin(self, team_id: str, user_id: str) -> bool:
        """Check if a user is an owner or admin of a team."""
        member = await self.get_member(team_id, user_id)
        return member is not None and member.role in ("owner", "admin")
