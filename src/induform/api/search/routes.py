"""Search API routes for cross-project global search."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from induform.api.auth.dependencies import get_current_user
from induform.api.rate_limit import limiter
from induform.db import get_db
from induform.db.models import (
    AssetDB,
    ConduitDB,
    ProjectAccess,
    ProjectDB,
    TeamMember,
    User,
    ZoneDB,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/search", tags=["search"])


class SearchResult(BaseModel):
    """A single search result."""

    type: str  # "project", "zone", "asset", "conduit"
    id: str
    name: str
    description: str | None = None
    project_id: str
    project_name: str
    zone_id: str | None = None  # for assets
    zone_name: str | None = None
    highlight: str | None = None  # context snippet


class SearchResponse(BaseModel):
    """Search response with results and metadata."""

    query: str
    total: int
    results: list[SearchResult]


def _build_highlight(text: str | None, query: str, max_len: int = 80) -> str | None:
    """Build a context snippet around the first match of query in text."""
    if not text or not query:
        return None
    lower_text = text.lower()
    lower_query = query.lower()
    idx = lower_text.find(lower_query)
    if idx == -1:
        return None
    # Window around the match
    start = max(0, idx - 20)
    end = min(len(text), idx + len(query) + 60)
    snippet = text[start:end]
    if start > 0:
        snippet = "..." + snippet
    if end < len(text):
        snippet = snippet + "..."
    return snippet


@router.get("", response_model=SearchResponse)
@limiter.limit("30/minute")
async def search(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
    type: str = Query("all", description="Filter by type: all, project, zone, asset, conduit"),
    limit: int = Query(20, ge=1, le=100, description="Maximum number of results"),
) -> SearchResponse:
    """Search across all projects the user has access to.

    Searches project names/descriptions, zone names/IDs/descriptions,
    asset names/IDs/IP addresses/vendor/model, and conduit names/IDs.
    """
    query_lower = q.strip().lower()
    pattern = f"%{query_lower}%"

    # Step 1: Get IDs of all projects accessible to this user
    team_result = await db.execute(
        select(TeamMember.team_id).where(TeamMember.user_id == current_user.id)
    )
    team_ids = [row[0] for row in team_result.fetchall()]

    accessible_query = (
        select(ProjectDB.id)
        .distinct()
        .outerjoin(ProjectAccess)
        .where(
            or_(
                ProjectDB.owner_id == current_user.id,
                ProjectAccess.user_id == current_user.id,
                ProjectAccess.team_id.in_(team_ids) if team_ids else False,
            )
        )
        .where(ProjectDB.is_archived == False)  # noqa: E712
    )

    accessible_result = await db.execute(accessible_query)
    accessible_project_ids = [row[0] for row in accessible_result.fetchall()]

    if not accessible_project_ids:
        return SearchResponse(query=q, total=0, results=[])

    results: list[SearchResult] = []

    # Step 2: Search projects
    if type in ("all", "project"):
        proj_query = (
            select(ProjectDB)
            .where(ProjectDB.id.in_(accessible_project_ids))
            .where(
                or_(
                    func.lower(ProjectDB.name).like(pattern),
                    func.lower(ProjectDB.description).like(pattern),
                )
            )
            .limit(limit)
        )
        proj_result = await db.execute(proj_query)
        for proj in proj_result.scalars().all():
            highlight = _build_highlight(proj.name, q) or _build_highlight(
                proj.description, q
            )
            results.append(
                SearchResult(
                    type="project",
                    id=proj.id,
                    name=proj.name,
                    description=proj.description,
                    project_id=proj.id,
                    project_name=proj.name,
                    highlight=highlight,
                )
            )

    # Step 3: Search zones
    if type in ("all", "zone"):
        zone_query = (
            select(ZoneDB)
            .options(selectinload(ZoneDB.project))
            .where(ZoneDB.project_id.in_(accessible_project_ids))
            .where(
                or_(
                    func.lower(ZoneDB.name).like(pattern),
                    func.lower(ZoneDB.zone_id).like(pattern),
                    func.lower(ZoneDB.description).like(pattern),
                )
            )
            .limit(limit)
        )
        zone_result = await db.execute(zone_query)
        for zone in zone_result.scalars().all():
            highlight = (
                _build_highlight(zone.name, q)
                or _build_highlight(zone.zone_id, q)
                or _build_highlight(zone.description, q)
            )
            results.append(
                SearchResult(
                    type="zone",
                    id=zone.zone_id,
                    name=zone.name,
                    description=zone.description,
                    project_id=zone.project_id,
                    project_name=zone.project.name,
                    highlight=highlight,
                )
            )

    # Step 4: Search assets
    if type in ("all", "asset"):
        asset_query = (
            select(AssetDB)
            .join(ZoneDB, AssetDB.zone_db_id == ZoneDB.id)
            .options(
                selectinload(AssetDB.zone).selectinload(ZoneDB.project),
            )
            .where(ZoneDB.project_id.in_(accessible_project_ids))
            .where(
                or_(
                    func.lower(AssetDB.name).like(pattern),
                    func.lower(AssetDB.asset_id).like(pattern),
                    func.lower(AssetDB.ip_address).like(pattern),
                    func.lower(AssetDB.vendor).like(pattern),
                    func.lower(AssetDB.model).like(pattern),
                )
            )
            .limit(limit)
        )
        asset_result = await db.execute(asset_query)
        for asset in asset_result.scalars().all():
            highlight = (
                _build_highlight(asset.name, q)
                or _build_highlight(asset.asset_id, q)
                or _build_highlight(asset.ip_address, q)
                or _build_highlight(asset.vendor, q)
                or _build_highlight(asset.model, q)
            )
            results.append(
                SearchResult(
                    type="asset",
                    id=asset.asset_id,
                    name=asset.name,
                    description=asset.description,
                    project_id=asset.zone.project_id,
                    project_name=asset.zone.project.name,
                    zone_id=asset.zone.zone_id,
                    zone_name=asset.zone.name,
                    highlight=highlight,
                )
            )

    # Step 5: Search conduits
    if type in ("all", "conduit"):
        conduit_query = (
            select(ConduitDB)
            .options(selectinload(ConduitDB.project))
            .where(ConduitDB.project_id.in_(accessible_project_ids))
            .where(
                or_(
                    func.lower(ConduitDB.conduit_id).like(pattern),
                    func.lower(ConduitDB.name).like(pattern),
                )
            )
            .limit(limit)
        )
        conduit_result = await db.execute(conduit_query)
        for conduit in conduit_result.scalars().all():
            highlight = _build_highlight(conduit.name, q) or _build_highlight(
                conduit.conduit_id, q
            )
            results.append(
                SearchResult(
                    type="conduit",
                    id=conduit.conduit_id,
                    name=conduit.name or conduit.conduit_id,
                    description=conduit.description,
                    project_id=conduit.project_id,
                    project_name=conduit.project.name,
                    highlight=highlight,
                )
            )

    # Trim to overall limit
    results = results[:limit]

    return SearchResponse(query=q, total=len(results), results=results)
