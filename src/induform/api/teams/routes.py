"""Teams API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from induform.api.auth.dependencies import get_current_user
from induform.api.teams.schemas import (
    AddMemberRequest,
    TeamCreate,
    TeamDetail,
    TeamMemberInfo,
    TeamSummary,
    TeamUpdate,
    UpdateMemberRoleRequest,
)
from induform.db import User, get_db
from induform.db.repositories import TeamRepository, UserRepository

router = APIRouter(prefix="/teams", tags=["Teams"])


@router.get("/", response_model=list[TeamSummary])
async def list_teams(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[TeamSummary]:
    """List all teams the current user belongs to."""
    team_repo = TeamRepository(db)
    teams = await team_repo.get_user_teams(current_user.id)

    result = []
    for team in teams:
        member = await team_repo.get_member(team.id, current_user.id)
        result.append(
            TeamSummary(
                id=team.id,
                name=team.name,
                description=team.description,
                created_by=team.created_by,
                created_at=team.created_at,
                member_count=len(team.members) if team.members else 0,
                your_role=member.role if member else "none",
            )
        )

    return result


@router.post("/", response_model=TeamSummary, status_code=status.HTTP_201_CREATED)
async def create_team(
    team_data: TeamCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamSummary:
    """Create a new team. The creator becomes the owner."""
    team_repo = TeamRepository(db)

    team = await team_repo.create(
        name=team_data.name,
        created_by=current_user.id,
        description=team_data.description,
    )

    return TeamSummary(
        id=team.id,
        name=team.name,
        description=team.description,
        created_by=team.created_by,
        created_at=team.created_at,
        member_count=1,  # Creator is automatically added
        your_role="owner",
    )


@router.get("/{team_id}", response_model=TeamDetail)
async def get_team(
    team_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamDetail:
    """Get a team by ID with member list."""
    team_repo = TeamRepository(db)

    # Check if user is a member
    is_member = await team_repo.is_member(team_id, current_user.id)
    if not is_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    team = await team_repo.get_by_id(team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    members = [
        TeamMemberInfo(
            user_id=member.user_id,
            username=member.user.username,
            email=member.user.email,
            display_name=member.user.display_name,
            role=member.role,
            joined_at=member.joined_at,
        )
        for member in team.members
    ]

    return TeamDetail(
        id=team.id,
        name=team.name,
        description=team.description,
        created_by=team.created_by,
        created_at=team.created_at,
        members=members,
    )


@router.put("/{team_id}", response_model=TeamSummary)
async def update_team(
    team_id: str,
    team_data: TeamUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamSummary:
    """Update a team. Only owner or admin can update."""
    team_repo = TeamRepository(db)

    # Check if user is owner or admin
    is_admin = await team_repo.is_owner_or_admin(team_id, current_user.id)
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team owner or admin can update the team",
        )

    team = await team_repo.get_by_id(team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Update team
    update_fields = team_data.model_dump(exclude_unset=True)
    if update_fields:
        await team_repo.update(team, **update_fields)

    member = await team_repo.get_member(team_id, current_user.id)

    return TeamSummary(
        id=team.id,
        name=team.name,
        description=team.description,
        created_by=team.created_by,
        created_at=team.created_at,
        member_count=len(team.members) if team.members else 0,
        your_role=member.role if member else "none",
    )


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a team. Only the owner can delete."""
    team_repo = TeamRepository(db)

    team = await team_repo.get_by_id(team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Check if user is owner
    member = await team_repo.get_member(team_id, current_user.id)
    if not member or member.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the team owner can delete it",
        )

    await team_repo.delete(team)


# Member management endpoints


@router.post(
    "/{team_id}/members", response_model=TeamMemberInfo, status_code=status.HTTP_201_CREATED
)
async def add_team_member(
    team_id: str,
    member_data: AddMemberRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamMemberInfo:
    """Add a member to a team. Only owner or admin can add members."""
    team_repo = TeamRepository(db)
    user_repo = UserRepository(db)

    # Check if user is owner or admin
    is_admin = await team_repo.is_owner_or_admin(team_id, current_user.id)
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team owner or admin can add members",
        )

    # Check if team exists
    team = await team_repo.get_by_id(team_id)
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Check if user to add exists
    user_to_add = await user_repo.get_by_id(member_data.user_id)
    if not user_to_add:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check if already a member
    existing = await team_repo.get_member(team_id, member_data.user_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a team member",
        )

    # Add member
    member = await team_repo.add_member(team_id, member_data.user_id, member_data.role)

    return TeamMemberInfo(
        user_id=user_to_add.id,
        username=user_to_add.username,
        email=user_to_add.email,
        display_name=user_to_add.display_name,
        role=member.role,
        joined_at=member.joined_at,
    )


@router.put("/{team_id}/members/{user_id}", response_model=TeamMemberInfo)
async def update_member_role(
    team_id: str,
    user_id: str,
    role_data: UpdateMemberRoleRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TeamMemberInfo:
    """Update a team member's role. Only owner can change roles."""
    team_repo = TeamRepository(db)
    user_repo = UserRepository(db)

    # Check if current user is owner
    current_member = await team_repo.get_member(team_id, current_user.id)
    if not current_member or current_member.role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the team owner can change member roles",
        )

    # Cannot change owner's role
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role",
        )

    # Get the member to update
    member = await team_repo.get_member(team_id, user_id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    # Cannot change another owner's role
    if member.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change another owner's role",
        )

    # Update role
    updated = await team_repo.update_member_role(team_id, user_id, role_data.role)
    user = await user_repo.get_by_id(user_id)

    return TeamMemberInfo(
        user_id=user.id,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        role=updated.role,
        joined_at=updated.joined_at,
    )


@router.delete("/{team_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_team_member(
    team_id: str,
    user_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Remove a member from a team.

    - Owner can remove anyone except themselves
    - Admin can remove members (but not other admins or owner)
    - Members can remove themselves (leave team)
    """
    team_repo = TeamRepository(db)

    # Get current user's membership
    current_member = await team_repo.get_member(team_id, current_user.id)
    if not current_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    # Get target member
    target_member = await team_repo.get_member(team_id, user_id)
    if not target_member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    # Owner leaving
    if user_id == current_user.id and current_member.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owner cannot leave the team. Delete the team or transfer ownership first.",
        )

    # User removing themselves (leaving)
    if user_id == current_user.id:
        await team_repo.remove_member(team_id, user_id)
        return

    # Check permission to remove others
    if current_member.role == "member":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to remove other members",
        )

    if current_member.role == "admin":
        # Admin can only remove members
        if target_member.role in ("owner", "admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admins cannot remove owners or other admins",
            )

    # Cannot remove owner
    if target_member.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the team owner",
        )

    await team_repo.remove_member(team_id, user_id)
