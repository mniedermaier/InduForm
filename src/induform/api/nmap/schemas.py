"""Pydantic schemas for Nmap API."""

from datetime import datetime

from pydantic import BaseModel, Field


class NmapUploadRequest(BaseModel):
    """Request to upload Nmap XML data."""

    xml_content: str = Field(
        ..., max_length=10_000_000, description="Nmap XML output content (max 10MB)"
    )
    filename: str = Field(default="scan.xml", max_length=255, description="Original filename")


class NmapPortInfo(BaseModel):
    """Information about an open port."""

    port: int
    protocol: str
    service: str | None = None
    product: str | None = None
    version: str | None = None


class NmapHostResponse(BaseModel):
    """Response schema for a discovered host."""

    id: str
    ip_address: str
    mac_address: str | None
    hostname: str | None
    os_detection: str | None
    status: str
    open_ports: list[NmapPortInfo]
    imported_as_asset_id: str | None
    suggested_asset_type: str
    suggested_asset_name: str


class NmapScanResponse(BaseModel):
    """Response schema for an Nmap scan."""

    id: str
    project_id: str
    filename: str
    scan_date: datetime | None
    host_count: int
    created_at: datetime


class NmapScanDetailResponse(BaseModel):
    """Detailed response for an Nmap scan including hosts."""

    id: str
    project_id: str
    filename: str
    scan_date: datetime | None
    host_count: int
    created_at: datetime
    hosts: list[NmapHostResponse]


class ImportHostRequest(BaseModel):
    """Request to import a host as an asset."""

    host_id: str
    zone_id: str
    asset_id: str = Field(..., min_length=1, max_length=100)
    asset_name: str = Field(..., min_length=1, max_length=255)
    asset_type: str = Field(..., min_length=1, max_length=50)


class ImportHostsRequest(BaseModel):
    """Request to import multiple hosts as assets."""

    imports: list[ImportHostRequest] = Field(..., max_length=500)


class ImportHostsResponse(BaseModel):
    """Response from importing hosts as assets."""

    imported: int
    errors: int
    error_messages: list[str] | None = None
