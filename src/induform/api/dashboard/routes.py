"""Dashboard API routes — cross-project compliance rollup."""

import logging
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from induform.api.auth.dependencies import get_current_user
from induform.db import get_db
from induform.db.models import MetricsSnapshot, ProjectDB, User
from induform.db.repositories import ProjectRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# --- Response schemas ---


class RollupProjectItem(BaseModel):
    id: str
    name: str
    description: str | None
    updated_at: str
    zone_count: int
    asset_count: int
    conduit_count: int
    compliance_score: float | None
    risk_score: float | None
    compliance_sparkline: list[float]
    risk_sparkline: list[float]


class ComplianceTierDistribution(BaseModel):
    high: int  # >= 90
    medium: int  # 70-89
    low: int  # < 70
    unknown: int


class RiskLevelDistribution(BaseModel):
    critical: int  # >= 80
    high: int  # 60-79
    medium: int  # 40-59
    low: int  # 20-39
    minimal: int  # < 20
    unknown: int


class RollupTrendPoint(BaseModel):
    date: str
    avg_compliance: float
    avg_risk: float
    total_zones: int
    total_assets: int
    total_conduits: int


class WorstItem(BaseModel):
    id: str
    name: str
    score: float


class RollupResponse(BaseModel):
    total_projects: int
    total_zones: int
    total_assets: int
    total_conduits: int
    avg_compliance: float | None
    compliance_distribution: ComplianceTierDistribution
    avg_risk: float | None
    risk_distribution: RiskLevelDistribution
    worst_compliance: list[WorstItem]
    worst_risk: list[WorstItem]
    trends: list[RollupTrendPoint]
    projects: list[RollupProjectItem]


def _classify_compliance(score: float) -> str:
    if score >= 90:
        return "high"
    if score >= 70:
        return "medium"
    return "low"


def _classify_risk(score: float) -> str:
    if score >= 80:
        return "critical"
    if score >= 60:
        return "high"
    if score >= 40:
        return "medium"
    if score >= 20:
        return "low"
    return "minimal"


@router.get("/rollup", response_model=RollupResponse)
async def get_rollup_dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(default=30, ge=7, le=90),
) -> RollupResponse:
    """Get cross-project compliance rollup dashboard data."""

    # 1. Get all accessible projects (lightweight)
    project_repo = ProjectRepository(db)
    projects = await project_repo.list_accessible(
        current_user.id,
        skip=0,
        limit=1000,
        load_full=False,
        is_admin=current_user.is_admin,
    )

    # Filter out archived projects
    projects = [p for p in projects if not p.is_archived]

    if not projects:
        return RollupResponse(
            total_projects=0,
            total_zones=0,
            total_assets=0,
            total_conduits=0,
            avg_compliance=None,
            compliance_distribution=ComplianceTierDistribution(
                high=0, medium=0, low=0, unknown=0
            ),
            avg_risk=None,
            risk_distribution=RiskLevelDistribution(
                critical=0, high=0, medium=0, low=0, minimal=0, unknown=0
            ),
            worst_compliance=[],
            worst_risk=[],
            trends=[],
            projects=[],
        )

    project_ids = [p.id for p in projects]
    project_map = {p.id: p for p in projects}
    cutoff = datetime.utcnow() - timedelta(days=days)

    # 2. Get latest snapshot per project (subquery for max recorded_at)
    latest_subq = (
        select(
            MetricsSnapshot.project_id,
            func.max(MetricsSnapshot.recorded_at).label("max_recorded"),
        )
        .where(MetricsSnapshot.project_id.in_(project_ids))
        .group_by(MetricsSnapshot.project_id)
        .subquery()
    )

    latest_result = await db.execute(
        select(MetricsSnapshot).join(
            latest_subq,
            (MetricsSnapshot.project_id == latest_subq.c.project_id)
            & (MetricsSnapshot.recorded_at == latest_subq.c.max_recorded),
        )
    )
    latest_snapshots = {s.project_id: s for s in latest_result.scalars().all()}

    # 3. Get all snapshots in date range for sparklines + trends
    range_result = await db.execute(
        select(MetricsSnapshot)
        .where(
            MetricsSnapshot.project_id.in_(project_ids),
            MetricsSnapshot.recorded_at >= cutoff,
        )
        .order_by(MetricsSnapshot.recorded_at)
    )
    range_snapshots = list(range_result.scalars().all())

    # Group by project for sparklines
    sparklines: dict[str, list[MetricsSnapshot]] = {}
    for s in range_snapshots:
        sparklines.setdefault(s.project_id, []).append(s)

    # Group by date for trends
    daily_data: dict[str, list[MetricsSnapshot]] = {}
    for s in range_snapshots:
        day = s.recorded_at.strftime("%Y-%m-%d")
        daily_data.setdefault(day, []).append(s)

    # 4. Build per-project items
    total_zones = 0
    total_assets = 0
    total_conduits = 0
    compliance_scores: list[float] = []
    risk_scores: list[float] = []
    comp_dist = {"high": 0, "medium": 0, "low": 0, "unknown": 0}
    risk_dist = {"critical": 0, "high": 0, "medium": 0, "low": 0, "minimal": 0, "unknown": 0}

    project_items: list[RollupProjectItem] = []

    for pid in project_ids:
        proj = project_map[pid]
        snap = latest_snapshots.get(pid)

        zone_count = len(proj.zones) if proj.zones else 0
        conduit_count = len(proj.conduits) if proj.conduits else 0
        asset_count = sum(len(z.assets) for z in proj.zones) if proj.zones else 0

        total_zones += zone_count
        total_conduits += conduit_count
        total_assets += asset_count

        comp_score: float | None = None
        r_score: float | None = None

        if snap:
            comp_score = snap.compliance_score
            r_score = snap.risk_score
            compliance_scores.append(comp_score)
            risk_scores.append(r_score)
            comp_dist[_classify_compliance(comp_score)] += 1
            risk_dist[_classify_risk(r_score)] += 1
        else:
            comp_dist["unknown"] += 1
            risk_dist["unknown"] += 1

        # Sparkline data
        proj_snaps = sparklines.get(pid, [])
        comp_spark = [s.compliance_score for s in proj_snaps]
        risk_spark = [s.risk_score for s in proj_snaps]

        project_items.append(
            RollupProjectItem(
                id=pid,
                name=proj.name,
                description=proj.description,
                updated_at=proj.updated_at.isoformat() if proj.updated_at else "",
                zone_count=zone_count,
                asset_count=asset_count,
                conduit_count=conduit_count,
                compliance_score=comp_score,
                risk_score=r_score,
                compliance_sparkline=comp_spark,
                risk_sparkline=risk_spark,
            )
        )

    # 5. Aggregates
    avg_compliance = round(sum(compliance_scores) / len(compliance_scores), 1) if compliance_scores else None
    avg_risk = round(sum(risk_scores) / len(risk_scores), 1) if risk_scores else None

    # Worst compliance (bottom 5 — lowest scores)
    scored_compliance = [
        (pid, latest_snapshots[pid].compliance_score)
        for pid in project_ids
        if pid in latest_snapshots
    ]
    scored_compliance.sort(key=lambda x: x[1])
    worst_compliance = [
        WorstItem(id=pid, name=project_map[pid].name, score=score)
        for pid, score in scored_compliance[:5]
    ]

    # Worst risk (top 5 — highest scores)
    scored_risk = [
        (pid, latest_snapshots[pid].risk_score)
        for pid in project_ids
        if pid in latest_snapshots
    ]
    scored_risk.sort(key=lambda x: x[1], reverse=True)
    worst_risk = [
        WorstItem(id=pid, name=project_map[pid].name, score=score)
        for pid, score in scored_risk[:5]
    ]

    # 6. Trends (daily aggregated)
    trends: list[RollupTrendPoint] = []
    for day in sorted(daily_data.keys()):
        day_snaps = daily_data[day]
        avg_c = sum(s.compliance_score for s in day_snaps) / len(day_snaps)
        avg_r = sum(s.risk_score for s in day_snaps) / len(day_snaps)
        total_z = sum(s.zone_count for s in day_snaps)
        total_a = sum(s.asset_count for s in day_snaps)
        total_co = sum(s.conduit_count for s in day_snaps)
        trends.append(
            RollupTrendPoint(
                date=day,
                avg_compliance=round(avg_c, 1),
                avg_risk=round(avg_r, 1),
                total_zones=total_z,
                total_assets=total_a,
                total_conduits=total_co,
            )
        )

    return RollupResponse(
        total_projects=len(project_ids),
        total_zones=total_zones,
        total_assets=total_assets,
        total_conduits=total_conduits,
        avg_compliance=avg_compliance,
        compliance_distribution=ComplianceTierDistribution(**comp_dist),
        avg_risk=avg_risk,
        risk_distribution=RiskLevelDistribution(**risk_dist),
        worst_compliance=worst_compliance,
        worst_risk=worst_risk,
        trends=trends,
        projects=project_items,
    )
