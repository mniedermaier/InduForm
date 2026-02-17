"""Vulnerabilities API routes."""

import asyncio
import logging
import uuid
from collections import Counter
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from induform.api.auth.dependencies import get_current_user
from induform.api.rate_limit import limiter
from induform.api.vulnerabilities.schemas import (
    AssetScanResponse,
    CveLookupResponse,
    ScanStatusResponse,
    VulnerabilityCreate,
    VulnerabilityResponse,
    VulnerabilitySummary,
    VulnerabilityUpdate,
)
from induform.db import AssetDB, User, Vulnerability, ZoneDB, get_db
from induform.engine.cve_lookup import lookup_cve, scan_asset_cves
from induform.security.permissions import Permission, check_project_permission

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Vulnerabilities"])


def _vuln_to_response(
    vuln: Vulnerability,
    asset_name: str | None = None,
    zone_name: str | None = None,
) -> VulnerabilityResponse:
    """Convert a Vulnerability model to VulnerabilityResponse."""
    return VulnerabilityResponse(
        id=vuln.id,
        asset_db_id=vuln.asset_db_id,
        asset_name=asset_name or (vuln.asset.name if vuln.asset else None),
        zone_name=zone_name or (vuln.asset.zone.name if vuln.asset and vuln.asset.zone else None),
        cve_id=vuln.cve_id,
        title=vuln.title,
        description=vuln.description,
        severity=vuln.severity,
        cvss_score=vuln.cvss_score,
        status=vuln.status,
        mitigation_notes=vuln.mitigation_notes,
        discovered_at=vuln.discovered_at,
        updated_at=vuln.updated_at,
        added_by=vuln.added_by,
        reporter_username=vuln.reporter.username if vuln.reporter else None,
    )


@router.get(
    "/projects/{project_id}/vulnerabilities",
    response_model=list[VulnerabilityResponse],
)
async def list_vulnerabilities(
    project_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    severity: str | None = None,
    vuln_status: str | None = None,
    zone_id: str | None = None,
) -> list[VulnerabilityResponse]:
    """List all vulnerabilities for a project, joined through zones -> assets."""
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Build query: vulnerabilities -> assets -> zones (filtered by project_id)
    query = (
        select(Vulnerability)
        .join(AssetDB, Vulnerability.asset_db_id == AssetDB.id)
        .join(ZoneDB, AssetDB.zone_db_id == ZoneDB.id)
        .where(ZoneDB.project_id == project_id)
        .options(
            selectinload(Vulnerability.asset).selectinload(AssetDB.zone),
            selectinload(Vulnerability.reporter),
        )
    )

    if severity:
        query = query.where(Vulnerability.severity == severity)
    if vuln_status:
        query = query.where(Vulnerability.status == vuln_status)
    if zone_id:
        query = query.where(ZoneDB.zone_id == zone_id)

    result = await db.execute(query)
    vulns = result.scalars().all()

    return [_vuln_to_response(v) for v in vulns]


@router.post(
    "/projects/{project_id}/zones/{zone_id}/assets/{asset_id}/vulnerabilities",
    response_model=VulnerabilityResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/minute")
async def create_vulnerability(
    request: Request,
    project_id: str,
    zone_id: str,
    asset_id: str,
    body: VulnerabilityCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VulnerabilityResponse:
    """Add a vulnerability to an asset."""
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.EDITOR, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editor permission required",
        )

    # Verify the asset belongs to the zone and project
    result = await db.execute(
        select(AssetDB)
        .join(ZoneDB, AssetDB.zone_db_id == ZoneDB.id)
        .where(
            ZoneDB.project_id == project_id,
            ZoneDB.zone_id == zone_id,
            AssetDB.asset_id == asset_id,
        )
        .options(selectinload(AssetDB.zone))
    )
    asset = result.scalar_one_or_none()

    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found in specified zone/project",
        )

    vuln = Vulnerability(
        asset_db_id=asset.id,
        cve_id=body.cve_id,
        title=body.title,
        description=body.description,
        severity=body.severity,
        cvss_score=body.cvss_score,
        status=body.status,
        added_by=current_user.id,
    )
    db.add(vuln)
    await db.flush()

    # Reload with relationships
    result = await db.execute(
        select(Vulnerability)
        .where(Vulnerability.id == vuln.id)
        .options(
            selectinload(Vulnerability.asset).selectinload(AssetDB.zone),
            selectinload(Vulnerability.reporter),
        )
    )
    vuln = result.scalar_one()

    return _vuln_to_response(vuln)


@router.patch(
    "/projects/{project_id}/vulnerabilities/{vuln_id}",
    response_model=VulnerabilityResponse,
)
@limiter.limit("30/minute")
async def update_vulnerability(
    request: Request,
    project_id: str,
    vuln_id: str,
    body: VulnerabilityUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VulnerabilityResponse:
    """Update a vulnerability's status, notes, or other fields."""
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.EDITOR, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editor permission required",
        )

    # Load the vulnerability and verify it belongs to the project
    result = await db.execute(
        select(Vulnerability)
        .join(AssetDB, Vulnerability.asset_db_id == AssetDB.id)
        .join(ZoneDB, AssetDB.zone_db_id == ZoneDB.id)
        .where(
            Vulnerability.id == vuln_id,
            ZoneDB.project_id == project_id,
        )
        .options(
            selectinload(Vulnerability.asset).selectinload(AssetDB.zone),
            selectinload(Vulnerability.reporter),
        )
    )
    vuln = result.scalar_one_or_none()

    if not vuln:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vulnerability not found",
        )

    # Apply updates
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(vuln, field, value)

    await db.flush()

    # Reload
    result = await db.execute(
        select(Vulnerability)
        .where(Vulnerability.id == vuln_id)
        .options(
            selectinload(Vulnerability.asset).selectinload(AssetDB.zone),
            selectinload(Vulnerability.reporter),
        )
    )
    vuln = result.scalar_one()

    return _vuln_to_response(vuln)


@router.delete(
    "/projects/{project_id}/vulnerabilities/{vuln_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
@limiter.limit("30/minute")
async def delete_vulnerability(
    request: Request,
    project_id: str,
    vuln_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete a vulnerability."""
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.EDITOR, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editor permission required",
        )

    # Verify vuln belongs to project
    result = await db.execute(
        select(Vulnerability)
        .join(AssetDB, Vulnerability.asset_db_id == AssetDB.id)
        .join(ZoneDB, AssetDB.zone_db_id == ZoneDB.id)
        .where(
            Vulnerability.id == vuln_id,
            ZoneDB.project_id == project_id,
        )
    )
    vuln = result.scalar_one_or_none()

    if not vuln:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vulnerability not found",
        )

    await db.delete(vuln)


@router.get(
    "/projects/{project_id}/vulnerability-summary",
    response_model=VulnerabilitySummary,
)
async def vulnerability_summary(
    project_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> VulnerabilitySummary:
    """Get vulnerability summary stats for a project."""
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    result = await db.execute(
        select(Vulnerability)
        .join(AssetDB, Vulnerability.asset_db_id == AssetDB.id)
        .join(ZoneDB, AssetDB.zone_db_id == ZoneDB.id)
        .where(ZoneDB.project_id == project_id)
        .options(selectinload(Vulnerability.asset))
    )
    vulns = result.scalars().all()

    severity_counts = Counter(v.severity for v in vulns)
    status_counts = Counter(v.status for v in vulns)

    # Top affected assets by vulnerability count
    asset_vuln_counts: Counter[str] = Counter()
    asset_names: dict[str, str] = {}
    for v in vulns:
        asset_vuln_counts[v.asset_db_id] += 1
        if v.asset:
            asset_names[v.asset_db_id] = v.asset.name

    top_assets = [
        {
            "asset_id": asset_id,
            "asset_name": asset_names.get(asset_id, "Unknown"),
            "count": count,
        }
        for asset_id, count in asset_vuln_counts.most_common(10)
    ]

    return VulnerabilitySummary(
        total=len(vulns),
        by_severity={
            "critical": severity_counts.get("critical", 0),
            "high": severity_counts.get("high", 0),
            "medium": severity_counts.get("medium", 0),
            "low": severity_counts.get("low", 0),
        },
        by_status={
            "open": status_counts.get("open", 0),
            "mitigated": status_counts.get("mitigated", 0),
            "accepted": status_counts.get("accepted", 0),
            "false_positive": status_counts.get("false_positive", 0),
        },
        top_affected_assets=top_assets,
    )


# ── CVE Auto-Scan Endpoints ─────────────────────────────────────────


@router.get(
    "/projects/{project_id}/cve-lookup/{cve_id}",
    response_model=CveLookupResponse,
)
@limiter.limit("20/minute")
async def cve_lookup(
    request: Request,
    project_id: str,
    cve_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CveLookupResponse:
    """Look up CVE details from NVD."""
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    result = await lookup_cve(cve_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CVE {cve_id} not found in NVD",
        )

    return CveLookupResponse(
        cve_id=result["cve_id"],
        title=result["title"],
        description=result.get("description"),
        severity=result.get("severity", "unknown"),
        cvss_score=result.get("cvss_score"),
    )


@router.post(
    "/projects/{project_id}/zones/{zone_id}/assets/{asset_id}/scan-cves",
    response_model=AssetScanResponse,
)
@limiter.limit("5/minute")
async def scan_asset(
    request: Request,
    project_id: str,
    zone_id: str,
    asset_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AssetScanResponse:
    """Scan a single asset for CVEs using NVD keyword search."""
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.EDITOR, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Editor permission required"
        )

    # Load asset
    result = await db.execute(
        select(AssetDB)
        .join(ZoneDB, AssetDB.zone_db_id == ZoneDB.id)
        .where(
            ZoneDB.project_id == project_id,
            ZoneDB.zone_id == zone_id,
            AssetDB.asset_id == asset_id,
        )
        .options(selectinload(AssetDB.zone))
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found")

    if not asset.vendor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Asset must have vendor info to scan for CVEs",
        )

    cves = await scan_asset_cves(
        vendor=asset.vendor,
        model=asset.model or "",
        firmware=asset.firmware_version or "",
    )

    created_vulns: list[Vulnerability] = []
    skipped = 0

    for cve in cves:
        # Check if CVE already exists for this asset
        existing = await db.execute(
            select(Vulnerability).where(
                Vulnerability.asset_db_id == asset.id,
                Vulnerability.cve_id == cve["cve_id"],
            )
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue

        vuln = Vulnerability(
            asset_db_id=asset.id,
            cve_id=cve["cve_id"],
            title=cve.get("title", cve["cve_id"]),
            description=cve.get("description"),
            severity=cve.get("severity", "medium"),
            cvss_score=cve.get("cvss_score"),
            status="open",
            added_by=current_user.id,
        )
        db.add(vuln)
        created_vulns.append(vuln)

    await db.flush()

    # Reload with relationships
    vuln_responses: list[VulnerabilityResponse] = []
    for v in created_vulns:
        res = await db.execute(
            select(Vulnerability)
            .where(Vulnerability.id == v.id)
            .options(
                selectinload(Vulnerability.asset).selectinload(AssetDB.zone),
                selectinload(Vulnerability.reporter),
            )
        )
        loaded = res.scalar_one()
        vuln_responses.append(_vuln_to_response(loaded))

    return AssetScanResponse(
        asset_id=asset_id,
        asset_name=asset.name,
        cves_found=len(cves),
        cves_created=len(created_vulns),
        cves_skipped=skipped,
        vulnerabilities=vuln_responses,
    )


@router.post(
    "/projects/{project_id}/scan-all-cves",
    response_model=ScanStatusResponse,
)
@limiter.limit("2/minute")
async def scan_all_cves(
    request: Request,
    project_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScanStatusResponse:
    """Start a batch CVE scan for all assets in a project."""
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.EDITOR, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Editor permission required"
        )

    # Count scannable assets
    result = await db.execute(
        select(AssetDB)
        .join(ZoneDB, AssetDB.zone_db_id == ZoneDB.id)
        .where(ZoneDB.project_id == project_id, AssetDB.vendor.isnot(None))
    )
    scannable_assets = result.scalars().all()

    if not scannable_assets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No assets with vendor info found to scan",
        )

    job_id = str(uuid.uuid4())

    # Initialize scan jobs dict on app state if needed
    if not hasattr(request.app.state, "scan_jobs"):
        request.app.state.scan_jobs = {}

    job_state = {
        "status": "running",
        "total_assets": len(scannable_assets),
        "assets_scanned": 0,
        "total_cves_found": 0,
        "total_cves_created": 0,
        "errors": [],
    }
    request.app.state.scan_jobs[job_id] = job_state

    # Collect asset info before background task (session won't be available later)
    asset_infos = [
        {
            "db_id": a.id,
            "asset_id": a.asset_id,
            "vendor": a.vendor,
            "model": a.model or "",
            "firmware": a.firmware_version or "",
        }
        for a in scannable_assets
    ]

    async def _run_batch_scan() -> None:
        from induform.db import get_db as get_db_factory

        try:
            async for scan_db in get_db_factory():
                for asset_info in asset_infos:
                    try:
                        cves = await scan_asset_cves(
                            vendor=asset_info["vendor"],
                            model=asset_info["model"],
                            firmware=asset_info["firmware"],
                        )
                        created = 0
                        for cve in cves:
                            existing = await scan_db.execute(
                                select(Vulnerability).where(
                                    Vulnerability.asset_db_id == asset_info["db_id"],
                                    Vulnerability.cve_id == cve["cve_id"],
                                )
                            )
                            if existing.scalar_one_or_none():
                                continue
                            vuln = Vulnerability(
                                asset_db_id=asset_info["db_id"],
                                cve_id=cve["cve_id"],
                                title=cve.get("title", cve["cve_id"]),
                                description=cve.get("description"),
                                severity=cve.get("severity", "medium"),
                                cvss_score=cve.get("cvss_score"),
                                status="open",
                                added_by=current_user.id,
                            )
                            scan_db.add(vuln)
                            created += 1

                        await scan_db.flush()
                        job_state["total_cves_found"] += len(cves)
                        job_state["total_cves_created"] += created
                    except Exception as exc:
                        job_state["errors"].append(f"Asset {asset_info['asset_id']}: {exc}")
                    job_state["assets_scanned"] += 1

                await scan_db.commit()
        except Exception as exc:
            job_state["errors"].append(f"Batch scan error: {exc}")
        finally:
            job_state["status"] = "completed"

    asyncio.create_task(_run_batch_scan())

    return ScanStatusResponse(
        job_id=job_id,
        **job_state,
    )


@router.get(
    "/projects/{project_id}/scan-status/{job_id}",
    response_model=ScanStatusResponse,
)
@limiter.limit("60/minute")
async def get_scan_status(
    request: Request,
    project_id: str,
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ScanStatusResponse:
    """Poll batch scan progress."""
    has_access = await check_project_permission(
        db, project_id, current_user.id, Permission.VIEWER, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    scan_jobs = getattr(request.app.state, "scan_jobs", {})
    job_state = scan_jobs.get(job_id)
    if not job_state:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan job not found")

    return ScanStatusResponse(job_id=job_id, **job_state)
