"""Nmap API routes."""

import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from induform.api.auth.dependencies import get_current_user
from induform.api.nmap.parser import (
    parse_nmap_xml,
    suggest_asset_name,
    suggest_asset_type,
)
from induform.api.nmap.schemas import (
    ImportHostsRequest,
    NmapHostResponse,
    NmapPortInfo,
    NmapScanDetailResponse,
    NmapScanResponse,
    NmapUploadRequest,
)
from induform.api.rate_limit import limiter
from induform.db import AssetDB, NmapHost, NmapScan, User, ZoneDB, get_db
from induform.security.permissions import Permission, check_project_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects/{project_id}/nmap", tags=["Nmap"])


@router.post("/upload", response_model=NmapScanResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def upload_nmap_scan(
    request: Request,
    project_id: str,
    upload_data: NmapUploadRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NmapScanResponse:
    """Upload and parse an Nmap XML scan."""
    # Check permission
    has_access = await check_project_permission(db, project_id, current_user.id, Permission.EDITOR)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You need editor access to upload scans",
        )

    # Parse the XML
    try:
        parsed = parse_nmap_xml(upload_data.xml_content)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Create scan record
    scan = NmapScan(
        project_id=project_id,
        uploaded_by=current_user.id,
        filename=upload_data.filename,
        scan_date=parsed.scan_date,
        host_count=parsed.host_count,
    )
    db.add(scan)
    await db.flush()

    # Create host records
    for host in parsed.hosts:
        host_record = NmapHost(
            scan_id=scan.id,
            ip_address=host.ip_address,
            mac_address=host.mac_address,
            hostname=host.hostname,
            os_detection=host.os_detection,
            status=host.status,
            ports_json=json.dumps(host.open_ports),
        )
        db.add(host_record)

    await db.flush()

    logger.info(
        "Nmap scan uploaded: file=%s hosts=%d project=%s user=%s",
        upload_data.filename,
        parsed.host_count,
        project_id,
        current_user.username,
    )

    return NmapScanResponse(
        id=scan.id,
        project_id=scan.project_id,
        filename=scan.filename,
        scan_date=scan.scan_date,
        host_count=scan.host_count,
        created_at=scan.created_at,
    )


@router.get("/scans", response_model=list[NmapScanResponse])
async def list_scans(
    project_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = 1,
    page_size: int = 20,
) -> list[NmapScanResponse]:
    """List Nmap scans for a project with pagination."""
    # Check permission
    has_access = await check_project_permission(db, project_id, current_user.id, Permission.VIEWER)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    offset = (page - 1) * page_size

    result = await db.execute(
        select(NmapScan)
        .where(NmapScan.project_id == project_id)
        .order_by(NmapScan.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    scans = result.scalars().all()

    return [
        NmapScanResponse(
            id=scan.id,
            project_id=scan.project_id,
            filename=scan.filename,
            scan_date=scan.scan_date,
            host_count=scan.host_count,
            created_at=scan.created_at,
        )
        for scan in scans
    ]


@router.get("/scans/{scan_id}", response_model=NmapScanDetailResponse)
async def get_scan(
    project_id: str,
    scan_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NmapScanDetailResponse:
    """Get a specific Nmap scan with host details."""
    # Check permission
    has_access = await check_project_permission(db, project_id, current_user.id, Permission.VIEWER)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    result = await db.execute(
        select(NmapScan)
        .options(selectinload(NmapScan.hosts))
        .where(NmapScan.id == scan_id, NmapScan.project_id == project_id)
    )
    scan = result.scalar_one_or_none()

    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    # Build host responses
    hosts = []
    for host in scan.hosts:
        open_ports = json.loads(host.ports_json) if host.ports_json else []

        # Create a simple object for suggestions
        class HostData:
            def __init__(self, h, ports):
                self.ip_address = h.ip_address
                self.mac_address = h.mac_address
                self.hostname = h.hostname
                self.os_detection = h.os_detection
                self.open_ports = ports

        host_data = HostData(host, open_ports)

        hosts.append(
            NmapHostResponse(
                id=host.id,
                ip_address=host.ip_address,
                mac_address=host.mac_address,
                hostname=host.hostname,
                os_detection=host.os_detection,
                status=host.status,
                open_ports=[
                    NmapPortInfo(
                        port=p.get("port", 0),
                        protocol=p.get("protocol", "tcp"),
                        service=p.get("service"),
                        product=p.get("product"),
                        version=p.get("version"),
                    )
                    for p in open_ports
                ],
                imported_as_asset_id=host.imported_as_asset_id,
                suggested_asset_type=suggest_asset_type(host_data),
                suggested_asset_name=suggest_asset_name(host_data),
            )
        )

    return NmapScanDetailResponse(
        id=scan.id,
        project_id=scan.project_id,
        filename=scan.filename,
        scan_date=scan.scan_date,
        host_count=scan.host_count,
        created_at=scan.created_at,
        hosts=hosts,
    )


@router.post("/scans/{scan_id}/import", status_code=status.HTTP_201_CREATED)
async def import_hosts_as_assets(
    project_id: str,
    scan_id: str,
    import_data: ImportHostsRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Import selected hosts as assets in specified zones."""
    # Check permission
    has_access = await check_project_permission(db, project_id, current_user.id, Permission.EDITOR)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You need editor access to import assets",
        )

    # Verify scan exists
    result = await db.execute(
        select(NmapScan)
        .options(selectinload(NmapScan.hosts))
        .where(NmapScan.id == scan_id, NmapScan.project_id == project_id)
    )
    scan = result.scalar_one_or_none()

    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    # Build host lookup
    hosts_by_id = {h.id: h for h in scan.hosts}

    # Get zones for this project
    result = await db.execute(select(ZoneDB).where(ZoneDB.project_id == project_id))
    zones = {z.zone_id: z for z in result.scalars().all()}

    imported_count = 0
    errors = []

    for imp in import_data.imports:
        # Verify host exists
        host = hosts_by_id.get(imp.host_id)
        if not host:
            errors.append(f"Host {imp.host_id} not found")
            continue

        # Verify zone exists
        zone = zones.get(imp.zone_id)
        if not zone:
            errors.append(f"Zone {imp.zone_id} not found")
            continue

        # Check if already imported
        if host.imported_as_asset_id:
            errors.append(f"Host {imp.host_id} already imported")
            continue

        # Create asset
        asset = AssetDB(
            zone_db_id=zone.id,
            asset_id=imp.asset_id,
            name=imp.asset_name,
            type=imp.asset_type,
            ip_address=host.ip_address,
            mac_address=host.mac_address,
            description=f"Imported from Nmap scan: {scan.filename}",
        )
        db.add(asset)
        await db.flush()

        # Update host record
        host.imported_as_asset_id = asset.id
        imported_count += 1

    await db.flush()

    return {
        "imported": imported_count,
        "errors": len(errors),
        "error_messages": errors if errors else None,
    }


@router.delete("/scans/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scan(
    project_id: str,
    scan_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    """Delete an Nmap scan and its host records."""
    # Check permission
    has_access = await check_project_permission(db, project_id, current_user.id, Permission.EDITOR)
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You need editor access to delete scans",
        )

    result = await db.execute(
        select(NmapScan).where(NmapScan.id == scan_id, NmapScan.project_id == project_id)
    )
    scan = result.scalar_one_or_none()

    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    await db.delete(scan)
    await db.flush()
