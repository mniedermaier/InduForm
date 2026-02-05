"""Comment repository for database operations."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from induform.db.models import Comment


class CommentRepository:
    """Repository for Comment operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        project_id: str,
        entity_type: str,
        entity_id: str,
        author_id: str,
        text: str,
    ) -> Comment:
        """Create a new comment."""
        comment = Comment(
            project_id=project_id,
            entity_type=entity_type,
            entity_id=entity_id,
            author_id=author_id,
            text=text,
        )
        self.session.add(comment)
        await self.session.flush()
        return comment

    async def get_by_id(self, comment_id: str) -> Comment | None:
        """Get a comment by ID."""
        result = await self.session.execute(
            select(Comment)
            .options(selectinload(Comment.author))
            .where(Comment.id == comment_id)
        )
        return result.scalar_one_or_none()

    async def list_for_project(
        self,
        project_id: str,
        include_resolved: bool = True,
    ) -> list[Comment]:
        """List all comments for a project."""
        query = (
            select(Comment)
            .options(selectinload(Comment.author))
            .where(Comment.project_id == project_id)
        )

        if not include_resolved:
            query = query.where(Comment.is_resolved == False)

        query = query.order_by(Comment.created_at.desc())

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def list_for_entity(
        self,
        project_id: str,
        entity_type: str,
        entity_id: str,
        include_resolved: bool = True,
    ) -> list[Comment]:
        """List all comments for a specific entity."""
        query = (
            select(Comment)
            .options(selectinload(Comment.author))
            .where(
                Comment.project_id == project_id,
                Comment.entity_type == entity_type,
                Comment.entity_id == entity_id,
            )
        )

        if not include_resolved:
            query = query.where(Comment.is_resolved == False)

        query = query.order_by(Comment.created_at.desc())

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def update(self, comment: Comment, text: str) -> Comment:
        """Update a comment's text."""
        comment.text = text
        comment.updated_at = datetime.utcnow()
        await self.session.flush()
        return comment

    async def delete(self, comment: Comment) -> None:
        """Delete a comment."""
        await self.session.delete(comment)
        await self.session.flush()

    async def resolve(self, comment: Comment, resolved_by: str) -> Comment:
        """Mark a comment as resolved."""
        comment.is_resolved = True
        comment.resolved_by = resolved_by
        comment.resolved_at = datetime.utcnow()
        await self.session.flush()
        return comment

    async def unresolve(self, comment: Comment) -> Comment:
        """Mark a comment as unresolved."""
        comment.is_resolved = False
        comment.resolved_by = None
        comment.resolved_at = None
        await self.session.flush()
        return comment

    async def count_unresolved(self, project_id: str) -> int:
        """Count unresolved comments for a project."""
        result = await self.session.execute(
            select(Comment)
            .where(
                Comment.project_id == project_id,
                Comment.is_resolved == False,
            )
        )
        return len(result.scalars().all())

    async def count_for_entity(
        self,
        project_id: str,
        entity_type: str,
        entity_id: str,
    ) -> int:
        """Count comments for a specific entity."""
        result = await self.session.execute(
            select(Comment)
            .where(
                Comment.project_id == project_id,
                Comment.entity_type == entity_type,
                Comment.entity_id == entity_id,
            )
        )
        return len(result.scalars().all())
