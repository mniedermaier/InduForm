"""User repository for database operations."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from induform.db.models import User


class UserRepository:
    """Repository for User operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        email: str,
        username: str,
        password_hash: str,
        display_name: str | None = None,
    ) -> User:
        """Create a new user."""
        user = User(
            email=email,
            username=username,
            password_hash=password_hash,
            display_name=display_name or username,
        )
        self.session.add(user)
        await self.session.flush()
        return user

    async def get_by_id(self, user_id: str) -> User | None:
        """Get a user by ID."""
        result = await self.session.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        """Get a user by email."""
        result = await self.session.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def get_by_username(self, username: str) -> User | None:
        """Get a user by username."""
        result = await self.session.execute(
            select(User).where(User.username == username)
        )
        return result.scalar_one_or_none()

    async def get_by_email_or_username(self, identifier: str) -> User | None:
        """Get a user by email or username."""
        result = await self.session.execute(
            select(User).where(
                (User.email == identifier) | (User.username == identifier)
            )
        )
        return result.scalar_one_or_none()

    async def update(self, user: User, **kwargs) -> User:
        """Update a user's attributes."""
        for key, value in kwargs.items():
            if hasattr(user, key):
                setattr(user, key, value)
        await self.session.flush()
        return user

    async def delete(self, user: User) -> None:
        """Delete a user."""
        await self.session.delete(user)
        await self.session.flush()

    async def list_all(self, skip: int = 0, limit: int = 100) -> list[User]:
        """List all users with pagination."""
        result = await self.session.execute(
            select(User)
            .where(User.is_active == True)
            .offset(skip)
            .limit(limit)
            .order_by(User.username)
        )
        return list(result.scalars().all())

    async def search(self, query: str, limit: int = 10, exclude_user_id: str | None = None) -> list[User]:
        """Search users by email or username."""
        search_pattern = f"%{query}%"
        stmt = select(User).where(
            User.is_active == True,
            (User.email.ilike(search_pattern)) | (User.username.ilike(search_pattern))
        )
        if exclude_user_id:
            stmt = stmt.where(User.id != exclude_user_id)
        stmt = stmt.limit(limit).order_by(User.username)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
