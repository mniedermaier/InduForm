"""Pydantic schemas for Vulnerabilities API."""

from datetime import datetime

from pydantic import BaseModel, Field


class VulnerabilityCreate(BaseModel):
    """Schema for creating a new vulnerability."""

    cve_id: str = Field(..., min_length=1, max_length=20, pattern=r"^CVE-\d{4}-\d{4,}$")
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    severity: str = Field(..., pattern=r"^(critical|high|medium|low)$")
    cvss_score: float | None = Field(None, ge=0.0, le=10.0)
    status: str = Field("open", pattern=r"^(open|mitigated|accepted|false_positive)$")


class VulnerabilityUpdate(BaseModel):
    """Schema for updating a vulnerability."""

    status: str | None = Field(None, pattern=r"^(open|mitigated|accepted|false_positive)$")
    mitigation_notes: str | None = None
    severity: str | None = Field(None, pattern=r"^(critical|high|medium|low)$")
    cvss_score: float | None = Field(None, ge=0.0, le=10.0)
    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None


class VulnerabilityResponse(BaseModel):
    """Response schema for a vulnerability."""

    id: str
    asset_db_id: str
    asset_name: str | None = None
    zone_name: str | None = None
    cve_id: str
    title: str
    description: str | None = None
    severity: str
    cvss_score: float | None = None
    status: str
    mitigation_notes: str | None = None
    discovered_at: datetime
    updated_at: datetime
    added_by: str
    reporter_username: str | None = None


class VulnerabilitySummary(BaseModel):
    """Summary statistics for project vulnerabilities."""

    total: int
    by_severity: dict[str, int]
    by_status: dict[str, int]
    top_affected_assets: list[dict[str, str | int]]


class CveLookupResponse(BaseModel):
    """Response from CVE lookup."""

    cve_id: str
    title: str
    description: str | None = None
    severity: str
    cvss_score: float | None = None


class AssetScanResponse(BaseModel):
    """Response from scanning a single asset for CVEs."""

    asset_id: str
    asset_name: str
    cves_found: int
    cves_created: int
    cves_skipped: int
    vulnerabilities: list[VulnerabilityResponse]


class ScanStatusResponse(BaseModel):
    """Response for batch scan status polling."""

    job_id: str
    status: str  # pending, running, completed, failed
    total_assets: int
    assets_scanned: int
    total_cves_found: int
    total_cves_created: int
    errors: list[str]
