"""Version history API routes."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from induform.db import get_db, User, ProjectDB, ProjectVersion, ActivityLog
from induform.db.repositories import ProjectRepository
from induform.api.auth.dependencies import get_current_user
from induform.api.rate_limit import limiter
from induform.security.permissions import check_project_permission, Permission


router = APIRouter(prefix="/projects/{project_id}/versions", tags=["Versions"])


class VersionSummary(BaseModel):
    """Summary of a project version."""
    id: str
    version_number: int
    created_by: str
    created_by_username: str | None = None
    created_at: str
    description: str | None = None


class VersionDetail(BaseModel):
    """Full version detail with snapshot."""
    id: str
    version_number: int
    created_by: str
    created_by_username: str | None = None
    created_at: str
    description: str | None = None
    snapshot: dict


class CreateVersionRequest(BaseModel):
    """Request to create a manual version snapshot."""
    description: str | None = None


class VersionDiff(BaseModel):
    """Diff between two versions."""
    zones: dict
    assets: dict
    conduits: dict
    summary: dict


@router.get("/", response_model=list[VersionSummary])
async def list_versions(
    project_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = 0,
    limit: int = 50,
) -> list[VersionSummary]:
    """List all versions for a project."""
    # Check permission
    has_access = await check_project_permission(db, project_id, current_user.id, Permission.VIEWER)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    query = (
        select(ProjectVersion)
        .where(ProjectVersion.project_id == project_id)
        .order_by(ProjectVersion.version_number.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    versions = result.scalars().all()

    # Get usernames for creators
    user_ids = {v.created_by for v in versions}
    if user_ids:
        user_query = select(User).where(User.id.in_(user_ids))
        user_result = await db.execute(user_query)
        users = {u.id: u.username for u in user_result.scalars().all()}
    else:
        users = {}

    return [
        VersionSummary(
            id=v.id,
            version_number=v.version_number,
            created_by=v.created_by,
            created_by_username=users.get(v.created_by),
            created_at=v.created_at.isoformat(),
            description=v.description,
        )
        for v in versions
    ]


@router.get("/count")
async def get_version_count(
    project_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Get total version count for a project."""
    has_access = await check_project_permission(db, project_id, current_user.id, Permission.VIEWER)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    query = select(func.count(ProjectVersion.id)).where(ProjectVersion.project_id == project_id)
    result = await db.execute(query)
    count = result.scalar() or 0

    return {"count": count}


@router.get("/{version_id}", response_model=VersionDetail)
async def get_version(
    project_id: str,
    version_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VersionDetail:
    """Get a specific version with full snapshot."""
    has_access = await check_project_permission(db, project_id, current_user.id, Permission.VIEWER)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    query = select(ProjectVersion).where(
        ProjectVersion.id == version_id,
        ProjectVersion.project_id == project_id,
    )
    result = await db.execute(query)
    version = result.scalar_one_or_none()

    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found",
        )

    # Get creator username
    user_query = select(User).where(User.id == version.created_by)
    user_result = await db.execute(user_query)
    creator = user_result.scalar_one_or_none()

    return VersionDetail(
        id=version.id,
        version_number=version.version_number,
        created_by=version.created_by,
        created_by_username=creator.username if creator else None,
        created_at=version.created_at.isoformat(),
        description=version.description,
        snapshot=json.loads(version.snapshot),
    )


@router.post("/", response_model=VersionSummary, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def create_version(
    request: Request,
    project_id: str,
    body: CreateVersionRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VersionSummary:
    """Create a manual version snapshot."""
    has_access = await check_project_permission(db, project_id, current_user.id, Permission.EDITOR)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to create versions",
        )

    project_repo = ProjectRepository(db)
    project_db = await project_repo.get_by_id(project_id)
    if not project_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Get current project state
    project = await project_repo.to_pydantic(project_db)
    snapshot = project.model_dump(mode="json")

    # Get next version number
    max_version_query = select(func.max(ProjectVersion.version_number)).where(
        ProjectVersion.project_id == project_id
    )
    result = await db.execute(max_version_query)
    max_version = result.scalar() or 0

    # Create version
    version = ProjectVersion(
        project_id=project_id,
        version_number=max_version + 1,
        created_by=current_user.id,
        description=body.description,
        snapshot=json.dumps(snapshot),
    )
    db.add(version)

    # Log activity
    log = ActivityLog(
        project_id=project_id,
        user_id=current_user.id,
        action="version_created",
        entity_type="project",
        entity_id=project_id,
        entity_name=f"Version {max_version + 1}",
        details=json.dumps({"version_number": max_version + 1, "description": body.description}),
    )
    db.add(log)

    await db.flush()

    return VersionSummary(
        id=version.id,
        version_number=version.version_number,
        created_by=version.created_by,
        created_by_username=current_user.username,
        created_at=version.created_at.isoformat(),
        description=version.description,
    )


@router.post("/{version_id}/restore", response_model=VersionSummary)
@limiter.limit("10/minute")
async def restore_version(
    request: Request,
    project_id: str,
    version_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VersionSummary:
    """Restore a project to a previous version. Creates a new version with current state first."""
    has_access = await check_project_permission(db, project_id, current_user.id, Permission.EDITOR)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to restore versions",
        )

    # Get the version to restore
    version_query = select(ProjectVersion).where(
        ProjectVersion.id == version_id,
        ProjectVersion.project_id == project_id,
    )
    result = await db.execute(version_query)
    version_to_restore = result.scalar_one_or_none()

    if not version_to_restore:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found",
        )

    project_repo = ProjectRepository(db)
    project_db = await project_repo.get_by_id(project_id)
    if not project_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Get current project state for backup
    current_project = await project_repo.to_pydantic(project_db)
    current_snapshot = current_project.model_dump(mode="json")

    # Get next version number
    max_version_query = select(func.max(ProjectVersion.version_number)).where(
        ProjectVersion.project_id == project_id
    )
    max_result = await db.execute(max_version_query)
    max_version = max_result.scalar() or 0

    # Create backup version of current state
    backup_version = ProjectVersion(
        project_id=project_id,
        version_number=max_version + 1,
        created_by=current_user.id,
        description=f"Auto-backup before restoring to version {version_to_restore.version_number}",
        snapshot=json.dumps(current_snapshot),
    )
    db.add(backup_version)

    # Restore project from version snapshot
    from induform.models.project import Project
    restored_project = Project.model_validate(json.loads(version_to_restore.snapshot))
    await project_repo.from_pydantic(restored_project, project_db)

    # Create a new version for the restored state
    restored_version = ProjectVersion(
        project_id=project_id,
        version_number=max_version + 2,
        created_by=current_user.id,
        description=f"Restored from version {version_to_restore.version_number}",
        snapshot=version_to_restore.snapshot,
    )
    db.add(restored_version)

    # Log activity
    log = ActivityLog(
        project_id=project_id,
        user_id=current_user.id,
        action="version_restored",
        entity_type="project",
        entity_id=project_id,
        entity_name=f"Restored to version {version_to_restore.version_number}",
        details=json.dumps({
            "restored_from_version": version_to_restore.version_number,
            "new_version": max_version + 2,
        }),
    )
    db.add(log)

    await db.flush()

    return VersionSummary(
        id=restored_version.id,
        version_number=restored_version.version_number,
        created_by=restored_version.created_by,
        created_by_username=current_user.username,
        created_at=restored_version.created_at.isoformat(),
        description=restored_version.description,
    )


@router.get("/{version_a_id}/compare/{version_b_id}", response_model=VersionDiff)
async def compare_versions(
    project_id: str,
    version_a_id: str,
    version_b_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VersionDiff:
    """Compare two versions and return the differences."""
    has_access = await check_project_permission(db, project_id, current_user.id, Permission.VIEWER)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Get both versions
    query_a = select(ProjectVersion).where(
        ProjectVersion.id == version_a_id,
        ProjectVersion.project_id == project_id,
    )
    query_b = select(ProjectVersion).where(
        ProjectVersion.id == version_b_id,
        ProjectVersion.project_id == project_id,
    )

    result_a = await db.execute(query_a)
    result_b = await db.execute(query_b)

    version_a = result_a.scalar_one_or_none()
    version_b = result_b.scalar_one_or_none()

    if not version_a or not version_b:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or both versions not found",
        )

    # Parse snapshots
    snapshot_a = json.loads(version_a.snapshot)
    snapshot_b = json.loads(version_b.snapshot)

    # Compare zones
    zones_a = {z["id"]: z for z in snapshot_a.get("zones", [])}
    zones_b = {z["id"]: z for z in snapshot_b.get("zones", [])}

    added_zones = []
    removed_zones = []
    modified_zones = []

    for zone_id in set(zones_a.keys()) | set(zones_b.keys()):
        if zone_id not in zones_a:
            z = zones_b[zone_id]
            added_zones.append({
                "id": zone_id,
                "name": z.get("name"),
                "type": z.get("type"),
                "security_level_target": z.get("security_level_target"),
            })
        elif zone_id not in zones_b:
            z = zones_a[zone_id]
            removed_zones.append({
                "id": zone_id,
                "name": z.get("name"),
                "type": z.get("type"),
                "security_level_target": z.get("security_level_target"),
            })
        else:
            za = zones_a[zone_id]
            zb = zones_b[zone_id]
            changes = {}
            for key in ["name", "type", "security_level_target", "description"]:
                if za.get(key) != zb.get(key):
                    changes[key] = {"from": za.get(key), "to": zb.get(key)}
            if changes:
                modified_zones.append({
                    "id": zone_id,
                    "name": zb.get("name"),
                    "changes": changes,
                })

    # Compare conduits
    conduits_a = {c["id"]: c for c in snapshot_a.get("conduits", [])}
    conduits_b = {c["id"]: c for c in snapshot_b.get("conduits", [])}

    added_conduits = []
    removed_conduits = []
    modified_conduits = []

    for conduit_id in set(conduits_a.keys()) | set(conduits_b.keys()):
        if conduit_id not in conduits_a:
            c = conduits_b[conduit_id]
            added_conduits.append({
                "id": conduit_id,
                "from_zone": c.get("from_zone"),
                "to_zone": c.get("to_zone"),
            })
        elif conduit_id not in conduits_b:
            c = conduits_a[conduit_id]
            removed_conduits.append({
                "id": conduit_id,
                "from_zone": c.get("from_zone"),
                "to_zone": c.get("to_zone"),
            })
        else:
            ca = conduits_a[conduit_id]
            cb = conduits_b[conduit_id]
            changes = {}
            for key in ["from_zone", "to_zone", "security_level_required"]:
                if ca.get(key) != cb.get(key):
                    changes[key] = {"from": ca.get(key), "to": cb.get(key)}
            if changes:
                modified_conduits.append({
                    "id": conduit_id,
                    "changes": changes,
                })

    # Compare assets
    all_assets_a = {}
    all_assets_b = {}
    for zone in snapshot_a.get("zones", []):
        for asset in zone.get("assets", []):
            all_assets_a[f"{zone['id']}:{asset['id']}"] = (zone["id"], asset)
    for zone in snapshot_b.get("zones", []):
        for asset in zone.get("assets", []):
            all_assets_b[f"{zone['id']}:{asset['id']}"] = (zone["id"], asset)

    added_assets = []
    removed_assets = []
    modified_assets = []

    for asset_key in set(all_assets_a.keys()) | set(all_assets_b.keys()):
        if asset_key not in all_assets_a:
            zone_id, asset = all_assets_b[asset_key]
            added_assets.append({
                "zone_id": zone_id,
                "id": asset.get("id"),
                "name": asset.get("name"),
                "type": asset.get("type"),
            })
        elif asset_key not in all_assets_b:
            zone_id, asset = all_assets_a[asset_key]
            removed_assets.append({
                "zone_id": zone_id,
                "id": asset.get("id"),
                "name": asset.get("name"),
                "type": asset.get("type"),
            })
        else:
            zone_id_a, aa = all_assets_a[asset_key]
            zone_id_b, ab = all_assets_b[asset_key]
            changes = {}
            for key in ["name", "type", "ip_address", "criticality"]:
                if aa.get(key) != ab.get(key):
                    changes[key] = {"from": aa.get(key), "to": ab.get(key)}
            if changes:
                modified_assets.append({
                    "zone_id": zone_id_b,
                    "id": ab.get("id"),
                    "name": ab.get("name"),
                    "changes": changes,
                })

    return VersionDiff(
        zones={
            "added": added_zones,
            "removed": removed_zones,
            "modified": modified_zones,
        },
        assets={
            "added": added_assets,
            "removed": removed_assets,
            "modified": modified_assets,
        },
        conduits={
            "added": added_conduits,
            "removed": removed_conduits,
            "modified": modified_conduits,
        },
        summary={
            "zones_added": len(added_zones),
            "zones_removed": len(removed_zones),
            "zones_modified": len(modified_zones),
            "assets_added": len(added_assets),
            "assets_removed": len(removed_assets),
            "assets_modified": len(modified_assets),
            "conduits_added": len(added_conduits),
            "conduits_removed": len(removed_conduits),
            "conduits_modified": len(modified_conduits),
        },
    )


_AUTO_VERSION_MIN_INTERVAL_SECONDS = 300  # 5 minutes between auto-versions


async def create_auto_version(
    db: AsyncSession,
    project_id: str,
    user_id: str,
    description: str,
) -> ProjectVersion | None:
    """
    Create an automatic version snapshot when significant changes are made.
    Called from project update routes.

    Throttled to at most one auto-version every 5 minutes per project
    to avoid flooding version history from auto-save.
    """
    from datetime import datetime, timedelta

    # Check if a recent version already exists (throttle)
    cutoff = datetime.utcnow() - timedelta(seconds=_AUTO_VERSION_MIN_INTERVAL_SECONDS)
    recent_query = select(ProjectVersion).where(
        ProjectVersion.project_id == project_id,
        ProjectVersion.created_at > cutoff,
    ).limit(1)
    result = await db.execute(recent_query)
    if result.scalar_one_or_none() is not None:
        return None  # Too soon, skip

    project_repo = ProjectRepository(db)
    project_db = await project_repo.get_by_id(project_id)
    if not project_db:
        return None

    project = await project_repo.to_pydantic(project_db)
    snapshot = project.model_dump(mode="json")

    # Get next version number
    max_version_query = select(func.max(ProjectVersion.version_number)).where(
        ProjectVersion.project_id == project_id
    )
    result = await db.execute(max_version_query)
    max_version = result.scalar() or 0

    version = ProjectVersion(
        project_id=project_id,
        version_number=max_version + 1,
        created_by=user_id,
        description=description,
        snapshot=json.dumps(snapshot),
    )
    db.add(version)
    await db.flush()

    return version
