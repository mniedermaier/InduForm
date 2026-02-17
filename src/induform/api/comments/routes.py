"""Comments API routes."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from induform.api.auth.dependencies import get_current_user
from induform.api.comments.schemas import (
    CommentCountResponse,
    CommentCreate,
    CommentResponse,
    CommentUpdate,
)
from induform.db import User, get_db
from induform.db.repositories import CommentRepository, ProjectRepository
from induform.security.permissions import Permission, check_project_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/comments", tags=["Comments"])


def _comment_to_response(comment) -> CommentResponse:
    """Convert a Comment model to CommentResponse."""
    return CommentResponse(
        id=comment.id,
        project_id=comment.project_id,
        entity_type=comment.entity_type,
        entity_id=comment.entity_id,
        author_id=comment.author_id,
        author_username=comment.author.username if comment.author else None,
        author_display_name=comment.author.display_name if comment.author else None,
        text=comment.text,
        is_resolved=comment.is_resolved,
        resolved_by=comment.resolved_by,
        resolver_username=comment.resolver.username if comment.resolver else None,
        resolved_at=comment.resolved_at,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.get("/", response_model=list[CommentResponse])
async def list_comments(
    project_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    include_resolved: bool = True,
    entity_type: str | None = None,
    entity_id: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> list[CommentResponse]:
    """List comments for a project, optionally filtered by entity."""
    # Check permission
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    comment_repo = CommentRepository(db)

    if entity_type and entity_id:
        comments = await comment_repo.list_for_entity(
            project_id, entity_type, entity_id, include_resolved
        )
    else:
        comments = await comment_repo.list_for_project(project_id, include_resolved)

    # Apply pagination
    start = (page - 1) * page_size
    comments = comments[start : start + page_size]

    return [_comment_to_response(c) for c in comments]


@router.get("/count", response_model=CommentCountResponse)
async def get_comment_count(
    project_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CommentCountResponse:
    """Get comment counts for a project."""
    # Check permission
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    comment_repo = CommentRepository(db)

    all_comments = await comment_repo.list_for_project(project_id, include_resolved=True)
    unresolved = await comment_repo.count_unresolved(project_id)

    return CommentCountResponse(
        total=len(all_comments),
        unresolved=unresolved,
    )


@router.post("/", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    project_id: str,
    comment_data: CommentCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CommentResponse:
    """Create a new comment on a project entity."""
    # Check permission - viewers can comment
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    comment_repo = CommentRepository(db)

    comment = await comment_repo.create(
        project_id=project_id,
        entity_type=comment_data.entity_type,
        entity_id=comment_data.entity_id,
        author_id=current_user.id,
        text=comment_data.text,
    )

    # Notify project owner of new comment
    try:
        from induform.api.notifications.routes import create_notification

        project_repo = ProjectRepository(db)
        project_db = await project_repo.get_by_id(project_id, load_relations=False)
        if project_db and project_db.owner_id != current_user.id:
            text_preview = (
                comment_data.text[:80] + "..." if len(comment_data.text) > 80 else comment_data.text
            )
            await create_notification(
                db,
                user_id=project_db.owner_id,
                type="comment",
                title=f"New comment on {project_db.name}",
                message=f"{current_user.username} commented: {text_preview}",
                link=f"/projects/{project_id}",
                project_id=project_id,
                actor_id=current_user.id,
            )
    except Exception as e:
        logger.warning("Failed to create comment notification: %s", e)

    # Reload to get author info
    comment = await comment_repo.get_by_id(comment.id)

    return _comment_to_response(comment)


@router.get("/{comment_id}", response_model=CommentResponse)
async def get_comment(
    project_id: str,
    comment_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CommentResponse:
    """Get a specific comment."""
    # Check permission
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    comment_repo = CommentRepository(db)
    comment = await comment_repo.get_by_id(comment_id)

    if not comment or comment.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    return _comment_to_response(comment)


@router.put("/{comment_id}", response_model=CommentResponse)
async def update_comment(
    project_id: str,
    comment_id: str,
    comment_data: CommentUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CommentResponse:
    """Update a comment. Only the author can edit."""
    # Check permission
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    comment_repo = CommentRepository(db)
    comment = await comment_repo.get_by_id(comment_id)

    if not comment or comment.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    # Only author can edit
    if comment.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own comments",
        )

    await comment_repo.update(comment, comment_data.text)

    # Reload
    comment = await comment_repo.get_by_id(comment_id)

    return _comment_to_response(comment)


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    project_id: str,
    comment_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a comment. Only the author can delete."""
    # Check permission
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    comment_repo = CommentRepository(db)
    comment = await comment_repo.get_by_id(comment_id)

    if not comment or comment.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    # Only author can delete
    if comment.author_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments",
        )

    await comment_repo.delete(comment)


@router.post("/{comment_id}/resolve", response_model=CommentResponse)
async def resolve_comment(
    project_id: str,
    comment_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CommentResponse:
    """Mark a comment as resolved. Editors and authors can resolve."""
    # Check permission
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    comment_repo = CommentRepository(db)
    comment = await comment_repo.get_by_id(comment_id)

    if not comment or comment.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    # Check if user can resolve (author or editor)
    can_resolve = comment.author_id == current_user.id
    if not can_resolve:
        can_resolve = await check_project_permission(
            db, project_id, current_user.id, Permission.EDITOR, is_admin=current_user.is_admin
        )

    if not can_resolve:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to resolve this comment",
        )

    await comment_repo.resolve(comment, current_user.id)

    # Notify comment author that their comment was resolved
    if comment.author_id != current_user.id:
        try:
            from induform.api.notifications.routes import create_notification

            project_repo = ProjectRepository(db)
            project_db = await project_repo.get_by_id(project_id, load_relations=False)
            project_name = project_db.name if project_db else "a project"
            await create_notification(
                db,
                user_id=comment.author_id,
                type="comment_resolved",
                title=f"Comment resolved on {project_name}",
                message=f"{current_user.username} resolved your comment",
                link=f"/projects/{project_id}",
                project_id=project_id,
                actor_id=current_user.id,
            )
        except Exception as e:
            logger.warning("Failed to create resolve notification: %s", e)

    # Reload
    comment = await comment_repo.get_by_id(comment_id)

    return _comment_to_response(comment)


@router.post("/{comment_id}/unresolve", response_model=CommentResponse)
async def unresolve_comment(
    project_id: str,
    comment_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CommentResponse:
    """Mark a comment as unresolved. Editors and authors can unresolve."""
    # Check permission
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    comment_repo = CommentRepository(db)
    comment = await comment_repo.get_by_id(comment_id)

    if not comment or comment.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    # Check if user can unresolve (author or editor)
    can_unresolve = comment.author_id == current_user.id
    if not can_unresolve:
        can_unresolve = await check_project_permission(
            db, project_id, current_user.id, Permission.EDITOR, is_admin=current_user.is_admin
        )

    if not can_unresolve:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to unresolve this comment",
        )

    await comment_repo.unresolve(comment)

    # Reload
    comment = await comment_repo.get_by_id(comment_id)

    return _comment_to_response(comment)
