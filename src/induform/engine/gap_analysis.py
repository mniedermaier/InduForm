"""IEC 62443-3-3 compliance gap analysis engine.

Maps foundational requirements (FR1-FR7) to specific system requirements (SRs)
and assesses which controls are met, partially met, or unmet for each zone
based on the zone's security level target.
"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from induform.models.asset import AssetType
from induform.models.project import Project
from induform.models.zone import Zone

# ---------------------------------------------------------------------------
# Foundational Requirements (FR) definitions
# ---------------------------------------------------------------------------

FR_DEFINITIONS: dict[str, str] = {
    "FR 1": "Identification and Authentication Control (IAC)",
    "FR 2": "Use Control (UC)",
    "FR 3": "System Integrity (SI)",
    "FR 4": "Data Confidentiality (DC)",
    "FR 5": "Restricted Data Flow (RDF)",
    "FR 6": "Timely Response to Events (TRE)",
    "FR 7": "Resource Availability (RA)",
}

# ---------------------------------------------------------------------------
# Return-type models
# ---------------------------------------------------------------------------


class ControlStatus(StrEnum):
    """Status of a single security control assessment."""

    MET = "met"
    PARTIAL = "partial"
    UNMET = "unmet"
    NOT_APPLICABLE = "not_applicable"


class ControlAssessment(BaseModel):
    """Assessment of a single IEC 62443-3-3 system requirement."""

    sr_id: str = Field(..., description="System Requirement ID")
    sr_name: str = Field(..., description="System Requirement name")
    fr_id: str = Field(..., description="Foundational Requirement ID")
    fr_name: str = Field(..., description="Foundational Requirement name")
    status: ControlStatus = Field(..., description="Assessment status")
    details: str = Field(..., description="Human-readable assessment details")
    remediation: str | None = Field(None, description="Recommended remediation action")


class ZoneGapAnalysis(BaseModel):
    """Gap analysis results for a single zone."""

    zone_id: str
    zone_name: str
    zone_type: str
    security_level_target: int
    total_controls: int = Field(0, description="Total applicable controls")
    met_controls: int = Field(0, description="Controls fully met")
    partial_controls: int = Field(0, description="Controls partially met")
    unmet_controls: int = Field(0, description="Controls not met")
    compliance_percentage: float = Field(0.0, description="Pct of controls met or partially met")
    controls: list[ControlAssessment] = Field(default_factory=list)


class GapAnalysisReport(BaseModel):
    """Complete IEC 62443-3-3 gap analysis report for a project."""

    project_name: str
    analysis_date: str
    overall_compliance: float = Field(
        0.0,
        description="Overall compliance percentage across all zones",
    )
    zones: list[ZoneGapAnalysis] = Field(default_factory=list)
    summary: dict[str, int] = Field(
        default_factory=dict,
        description="Aggregate counts: met, partial, unmet, not_applicable",
    )
    priority_remediations: list[str] = Field(
        default_factory=list,
        description="Top-priority remediation actions across the project",
    )


# ---------------------------------------------------------------------------
# Assessment helpers
# ---------------------------------------------------------------------------

_AUTH_ASSET_TYPES: set[AssetType] = {
    AssetType.JUMP_HOST,
    AssetType.SERVER,
    AssetType.ENGINEERING_WORKSTATION,
}

_NETWORK_SECURITY_ASSET_TYPES: set[AssetType] = {
    AssetType.FIREWALL,
    AssetType.SWITCH,
    AssetType.ROUTER,
}

_DEVICE_ASSET_TYPES: set[AssetType] = {
    AssetType.PLC,
    AssetType.RTU,
    AssetType.IED,
    AssetType.DCS,
    AssetType.HMI,
    AssetType.SCADA,
}


def _has_type(zone: Zone, types: set[AssetType]) -> bool:
    return any(a.type in types for a in zone.assets)


def _has_fw(zone: Zone) -> bool:
    return any(a.type == AssetType.FIREWALL for a in zone.assets)


# ---------------------------------------------------------------------------
# Individual SR assessors
# ---------------------------------------------------------------------------


def _assess_sr_1_1(zone: Zone, project: Project) -> ControlAssessment:
    """SR 1.1 - Human user identification and authentication."""
    fr_id, fr_name = "FR 1", FR_DEFINITIONS["FR 1"]
    sr_name = "Human user identification and authentication"

    has_auth = _has_type(zone, _AUTH_ASSET_TYPES)
    has_dev = _has_type(zone, _DEVICE_ASSET_TYPES)

    if has_auth and has_dev:
        return ControlAssessment(
            sr_id="SR 1.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details=(
                "Zone has authentication infrastructure co-located with controllable devices."
            ),
        )
    if has_dev and not has_auth:
        return ControlAssessment(
            sr_id="SR 1.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details=(
                "Zone has controllable devices but no dedicated authentication infrastructure."
            ),
            remediation=(
                "Add a jump host or engineering workstation for authenticated device access."
            ),
        )
    if not zone.assets:
        return ControlAssessment(
            sr_id="SR 1.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.UNMET,
            details="Zone has no assets; cannot verify auth controls.",
            remediation="Register assets and deploy auth infrastructure.",
        )
    return ControlAssessment(
        sr_id="SR 1.1",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.PARTIAL,
        details="Zone has assets but auth coverage cannot be verified.",
        remediation=(
            "Ensure all human user access paths include identification and authentication."
        ),
    )


def _assess_sr_1_2(zone: Zone, project: Project) -> ControlAssessment:
    """SR 1.2 - Software process and device identification."""
    fr_id, fr_name = "FR 1", FR_DEFINITIONS["FR 1"]
    sr_name = "Software process and device identification and authentication"

    has_dev = _has_type(zone, _DEVICE_ASSET_TYPES)
    has_net = _has_type(zone, _NETWORK_SECURITY_ASSET_TYPES)

    if has_dev and has_net:
        return ControlAssessment(
            sr_id="SR 1.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details=("Zone has devices and network infrastructure for device authentication."),
        )
    if has_dev:
        return ControlAssessment(
            sr_id="SR 1.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details="Zone has devices but no network auth infrastructure.",
            remediation=(
                "Deploy switches or firewalls with 802.1X or certificate-based device auth."
            ),
        )
    return ControlAssessment(
        sr_id="SR 1.2",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET if not zone.assets else ControlStatus.PARTIAL,
        details="No controllable devices; device auth not assessable.",
        remediation="Register devices and deploy auth infrastructure.",
    )


def _assess_sr_1_3(zone: Zone, project: Project) -> ControlAssessment:
    """SR 1.3 - Account management."""
    fr_id, fr_name = "FR 1", FR_DEFINITIONS["FR 1"]
    sr_name = "Account management"

    has_mgmt = any(
        a.type
        in {
            AssetType.SERVER,
            AssetType.JUMP_HOST,
            AssetType.ENGINEERING_WORKSTATION,
        }
        for a in zone.assets
    )

    if has_mgmt:
        return ControlAssessment(
            sr_id="SR 1.3",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details="Zone has management infrastructure for accounts.",
        )
    if zone.assets:
        return ControlAssessment(
            sr_id="SR 1.3",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details="Zone has assets but no management server.",
            remediation=(
                "Deploy a management server or integrate with centralized directory service."
            ),
        )
    return ControlAssessment(
        sr_id="SR 1.3",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET,
        details="No assets in zone; account management not assessable.",
        remediation="Register assets and implement account management.",
    )


def _assess_sr_2_1(zone: Zone, project: Project) -> ControlAssessment:
    """SR 2.1 - Authorization enforcement."""
    fr_id, fr_name = "FR 2", FR_DEFINITIONS["FR 2"]
    sr_name = "Authorization enforcement"

    has_auth = _has_type(zone, _AUTH_ASSET_TYPES)
    has_fw = _has_fw(zone)

    if has_auth and has_fw:
        return ControlAssessment(
            sr_id="SR 2.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details=("Zone has firewall and auth infrastructure for authorization enforcement."),
        )
    if has_auth or has_fw:
        present = "firewall" if has_fw else "auth infrastructure"
        missing = "auth infrastructure" if has_fw else "firewall"
        return ControlAssessment(
            sr_id="SR 2.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details=f"Partial authorization: {present} present but {missing} missing.",
            remediation=(
                "Deploy both firewall and auth infrastructure for complete authorization."
            ),
        )
    return ControlAssessment(
        sr_id="SR 2.1",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET,
        details="No authorization enforcement infrastructure.",
        remediation="Deploy firewall and access control systems.",
    )


def _assess_sr_2_2(zone: Zone, project: Project) -> ControlAssessment:
    """SR 2.2 - Wireless use control (min SL-2)."""
    fr_id, fr_name = "FR 2", FR_DEFINITIONS["FR 2"]
    sr_name = "Wireless use control"

    if zone.security_level_target < 2:
        return ControlAssessment(
            sr_id="SR 2.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.NOT_APPLICABLE,
            details="Wireless use control only required for SL-T >= 2.",
        )

    if _has_fw(zone):
        return ControlAssessment(
            sr_id="SR 2.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details=(
                "Zone has firewall for wireless restriction "
                "but dedicated wireless control not confirmed."
            ),
            remediation=("Deploy WPA3/RADIUS for wireless auth; consider wireless IDS."),
        )
    return ControlAssessment(
        sr_id="SR 2.2",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET,
        details="No wireless access control infrastructure detected.",
        remediation=("Implement WPA2/WPA3 with RADIUS auth; add wireless IDS for SL-3+."),
    )


def _assess_sr_3_1(zone: Zone, project: Project) -> ControlAssessment:
    """SR 3.1 - Communication integrity."""
    fr_id, fr_name = "FR 3", FR_DEFINITIONS["FR 3"]
    sr_name = "Communication integrity"

    conduits = project.get_conduits_for_zone(zone.id)
    if not conduits:
        if zone.assets:
            return ControlAssessment(
                sr_id="SR 3.1",
                sr_name=sr_name,
                fr_id=fr_id,
                fr_name=fr_name,
                status=ControlStatus.PARTIAL,
                details="Zone has assets but no conduits defined.",
                remediation="Define conduits and enable integrity protection.",
            )
        return ControlAssessment(
            sr_id="SR 3.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.UNMET,
            details="No conduits or assets; integrity not assessable.",
            remediation="Define assets and conduits, enable integrity.",
        )

    n_insp = sum(1 for c in conduits if c.requires_inspection)
    n_flows = sum(1 for c in conduits if c.flows)
    n = len(conduits)

    if n_insp == n and n_flows == n:
        return ControlAssessment(
            sr_id="SR 3.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details="All conduits have inspection and defined flows.",
        )
    if n_insp > 0 or n_flows > 0:
        return ControlAssessment(
            sr_id="SR 3.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details=(f"{n_insp}/{n} conduits inspected; {n_flows}/{n} have defined flows."),
            remediation="Enable inspection and flows on all conduits.",
        )
    return ControlAssessment(
        sr_id="SR 3.1",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET,
        details="No conduits have inspection or defined flows.",
        remediation=(
            "Enable deep packet inspection and define explicit protocol flows on all conduits."
        ),
    )


def _assess_sr_3_2(zone: Zone, project: Project) -> ControlAssessment:
    """SR 3.2 - Malicious code protection."""
    fr_id, fr_name = "FR 3", FR_DEFINITIONS["FR 3"]
    sr_name = "Malicious code protection"

    has_srv = any(
        a.type
        in {
            AssetType.SERVER,
            AssetType.ENGINEERING_WORKSTATION,
            AssetType.HISTORIAN,
            AssetType.SCADA,
        }
        for a in zone.assets
    )
    has_fw = _has_fw(zone)

    if has_srv and has_fw:
        return ControlAssessment(
            sr_id="SR 3.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details="Zone has servers and firewall for malware protection.",
        )
    if has_fw:
        return ControlAssessment(
            sr_id="SR 3.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details="Zone has firewall but no server for endpoint protection.",
            remediation="Deploy endpoint protection on zone devices.",
        )
    if has_srv:
        return ControlAssessment(
            sr_id="SR 3.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details="Zone has servers but no firewall at boundary.",
            remediation="Deploy a firewall for network-level protection.",
        )
    return ControlAssessment(
        sr_id="SR 3.2",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET,
        details="No malicious code protection infrastructure.",
        remediation="Deploy firewall and endpoint protection.",
    )


def _assess_sr_4_1(zone: Zone, project: Project) -> ControlAssessment:
    """SR 4.1 - Information confidentiality."""
    fr_id, fr_name = "FR 4", FR_DEFINITIONS["FR 4"]
    sr_name = "Information confidentiality"

    conduits = project.get_conduits_for_zone(zone.id)
    has_fw = _has_fw(zone)

    if not conduits and not zone.assets:
        return ControlAssessment(
            sr_id="SR 4.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.UNMET,
            details="No assets or conduits; confidentiality not assessable.",
            remediation="Register assets, define conduits, add encryption.",
        )

    n_insp = sum(1 for c in conduits if c.requires_inspection) if conduits else 0

    if has_fw and conduits and n_insp == len(conduits):
        return ControlAssessment(
            sr_id="SR 4.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details="Firewall and conduit inspection enforce confidentiality.",
        )
    if has_fw or n_insp > 0:
        return ControlAssessment(
            sr_id="SR 4.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details="Partial confidentiality controls present.",
            remediation=(
                "Ensure all conduits have encryption/inspection; deploy firewall if missing."
            ),
        )
    return ControlAssessment(
        sr_id="SR 4.1",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET,
        details="No confidentiality controls detected.",
        remediation=("Deploy firewall, enable conduit inspection, implement TLS/encryption."),
    )


def _assess_sr_5_1(zone: Zone, project: Project) -> ControlAssessment:
    """SR 5.1 - Network segmentation."""
    fr_id, fr_name = "FR 5", FR_DEFINITIONS["FR 5"]
    sr_name = "Network segmentation"

    has_seg = bool(zone.network_segment)
    has_fw = _has_fw(zone)

    if has_seg and has_fw:
        return ControlAssessment(
            sr_id="SR 5.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details=(f"Zone has segment '{zone.network_segment}' and firewall."),
        )
    if has_seg:
        return ControlAssessment(
            sr_id="SR 5.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details=(f"Zone has segment '{zone.network_segment}' but no firewall."),
            remediation="Deploy firewall to enforce segmentation.",
        )
    if has_fw:
        return ControlAssessment(
            sr_id="SR 5.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details="Zone has firewall but no VLAN/segment defined.",
            remediation="Define a network segment (VLAN) for this zone.",
        )
    return ControlAssessment(
        sr_id="SR 5.1",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET,
        details="No network segmentation (no VLAN, no firewall).",
        remediation="Assign a VLAN and deploy a boundary firewall.",
    )


def _assess_sr_5_2(zone: Zone, project: Project) -> ControlAssessment:
    """SR 5.2 - Zone boundary protection."""
    fr_id, fr_name = "FR 5", FR_DEFINITIONS["FR 5"]
    sr_name = "Zone boundary protection"

    conduits = project.get_conduits_for_zone(zone.id)
    has_fw = _has_fw(zone)

    if not conduits:
        return ControlAssessment(
            sr_id="SR 5.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=(ControlStatus.PARTIAL if has_fw else ControlStatus.UNMET),
            details="No conduits; boundary protection not fully assessed.",
            remediation="Define conduits and protect with firewalls.",
        )

    n_flows = sum(1 for c in conduits if c.flows)
    n = len(conduits)

    if has_fw and n_flows == n:
        return ControlAssessment(
            sr_id="SR 5.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details="Firewall and all conduits have defined flows.",
        )
    if has_fw or n_flows > 0:
        missing = []
        if not has_fw:
            missing.append("firewall")
        if n_flows < n:
            missing.append(f"flows on {n - n_flows} conduit(s)")
        return ControlAssessment(
            sr_id="SR 5.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details=f"Partial; missing: {', '.join(missing)}.",
            remediation="Deploy firewall and define flows on all conduits.",
        )
    return ControlAssessment(
        sr_id="SR 5.2",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET,
        details="No firewall and no conduit flows defined.",
        remediation=("Deploy a stateful firewall and define explicit protocol flows."),
    )


def _assess_sr_5_3(zone: Zone, project: Project) -> ControlAssessment:
    """SR 5.3 - Person-to-person communication restrictions (SL-2+)."""
    fr_id, fr_name = "FR 5", FR_DEFINITIONS["FR 5"]
    sr_name = "General purpose person-to-person communication restrictions"

    if zone.security_level_target < 2:
        return ControlAssessment(
            sr_id="SR 5.3",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.NOT_APPLICABLE,
            details="Only required for SL-T >= 2.",
        )

    has_fw = _has_fw(zone)
    conduits = project.get_conduits_for_zone(zone.id)
    n_flows = sum(1 for c in conduits if c.flows) if conduits else 0

    if has_fw and conduits and n_flows == len(conduits):
        return ControlAssessment(
            sr_id="SR 5.3",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details="Firewall and flows restrict communications.",
        )
    if has_fw or n_flows > 0:
        return ControlAssessment(
            sr_id="SR 5.3",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details="Partial restriction on communications.",
            remediation=("Block email/web at boundaries; define explicit protocol allowlists."),
        )
    return ControlAssessment(
        sr_id="SR 5.3",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET,
        details="No communication restrictions configured.",
        remediation=("Deploy firewall with email/web filtering; block person-to-person protocols."),
    )


def _assess_sr_6_1(zone: Zone, project: Project) -> ControlAssessment:
    """SR 6.1 - Audit log accessibility."""
    fr_id, fr_name = "FR 6", FR_DEFINITIONS["FR 6"]
    sr_name = "Audit log accessibility"

    has_log = any(
        a.type in {AssetType.SERVER, AssetType.HISTORIAN, AssetType.SCADA} for a in zone.assets
    )

    if has_log:
        return ControlAssessment(
            sr_id="SR 6.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details=("Zone has server/historian for storing and providing audit logs."),
        )
    if zone.assets:
        return ControlAssessment(
            sr_id="SR 6.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details="Assets present but no server/historian for logs.",
            remediation="Deploy log server or forward to centralized SIEM.",
        )
    return ControlAssessment(
        sr_id="SR 6.1",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET,
        details="No assets; audit logging not assessable.",
        remediation="Register assets and deploy logging infrastructure.",
    )


def _assess_sr_6_2(zone: Zone, project: Project) -> ControlAssessment:
    """SR 6.2 - Continuous monitoring (min SL-2)."""
    fr_id, fr_name = "FR 6", FR_DEFINITIONS["FR 6"]
    sr_name = "Continuous monitoring"

    if zone.security_level_target < 2:
        return ControlAssessment(
            sr_id="SR 6.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.NOT_APPLICABLE,
            details="Continuous monitoring only required for SL-T >= 2.",
        )

    has_mon = any(
        a.type in {AssetType.SERVER, AssetType.HISTORIAN, AssetType.SCADA} for a in zone.assets
    )
    has_fw = _has_fw(zone)

    if has_mon and has_fw:
        return ControlAssessment(
            sr_id="SR 6.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details="Monitoring infrastructure and firewall present.",
        )
    if has_mon or has_fw:
        return ControlAssessment(
            sr_id="SR 6.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details="Partial monitoring infrastructure present.",
            remediation=("Deploy monitoring server/SIEM and firewall with alerting."),
        )
    return ControlAssessment(
        sr_id="SR 6.2",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET,
        details="No continuous monitoring infrastructure.",
        remediation="Deploy SIEM or monitoring with real-time alerting.",
    )


def _assess_sr_7_1(zone: Zone, project: Project) -> ControlAssessment:
    """SR 7.1 - Denial of service protection."""
    fr_id, fr_name = "FR 7", FR_DEFINITIONS["FR 7"]
    sr_name = "Denial of service protection"

    has_fw = _has_fw(zone)
    has_net = _has_type(zone, _NETWORK_SECURITY_ASSET_TYPES)
    conduits = project.get_conduits_for_zone(zone.id)
    n_insp = sum(1 for c in conduits if c.requires_inspection) if conduits else 0

    if has_fw and n_insp > 0:
        return ControlAssessment(
            sr_id="SR 7.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details="Firewall and conduit inspection for DoS protection.",
        )
    if has_fw or has_net:
        return ControlAssessment(
            sr_id="SR 7.1",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details="Network infra present but inspection not on all conduits.",
            remediation="Enable rate limiting and DPI on boundary conduits.",
        )
    return ControlAssessment(
        sr_id="SR 7.1",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET,
        details="No DoS protection infrastructure detected.",
        remediation="Deploy firewall with rate limiting; enable inspection.",
    )


def _assess_sr_7_2(zone: Zone, project: Project) -> ControlAssessment:
    """SR 7.2 - Resource management."""
    fr_id, fr_name = "FR 7", FR_DEFINITIONS["FR 7"]
    sr_name = "Resource management"

    has_mgmt = any(
        a.type in {AssetType.SERVER, AssetType.SCADA, AssetType.DCS} for a in zone.assets
    )

    if has_mgmt and zone.assets:
        return ControlAssessment(
            sr_id="SR 7.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.MET,
            details="Management infrastructure for resource monitoring.",
        )
    if zone.assets:
        return ControlAssessment(
            sr_id="SR 7.2",
            sr_name=sr_name,
            fr_id=fr_id,
            fr_name=fr_name,
            status=ControlStatus.PARTIAL,
            details="Assets present but no management server.",
            remediation=("Deploy resource monitoring tools (SNMP, agent-based)."),
        )
    return ControlAssessment(
        sr_id="SR 7.2",
        sr_name=sr_name,
        fr_id=fr_id,
        fr_name=fr_name,
        status=ControlStatus.UNMET,
        details="No assets; resource management not assessable.",
        remediation="Register assets and implement resource monitoring.",
    )


# ---------------------------------------------------------------------------
# SR assessor registry: (sr_id, min_sl, assessor_fn)
# ---------------------------------------------------------------------------

_SR_ASSESSORS: list[tuple[str, int, object]] = [
    ("SR 1.1", 1, _assess_sr_1_1),
    ("SR 1.2", 1, _assess_sr_1_2),
    ("SR 1.3", 1, _assess_sr_1_3),
    ("SR 2.1", 1, _assess_sr_2_1),
    ("SR 2.2", 2, _assess_sr_2_2),
    ("SR 3.1", 1, _assess_sr_3_1),
    ("SR 3.2", 1, _assess_sr_3_2),
    ("SR 4.1", 1, _assess_sr_4_1),
    ("SR 5.1", 1, _assess_sr_5_1),
    ("SR 5.2", 1, _assess_sr_5_2),
    ("SR 5.3", 2, _assess_sr_5_3),
    ("SR 6.1", 1, _assess_sr_6_1),
    ("SR 6.2", 2, _assess_sr_6_2),
    ("SR 7.1", 1, _assess_sr_7_1),
    ("SR 7.2", 1, _assess_sr_7_2),
]


# ---------------------------------------------------------------------------
# Main analysis functions
# ---------------------------------------------------------------------------


def _analyze_zone(zone: Zone, project: Project) -> ZoneGapAnalysis:
    """Perform gap analysis for a single zone."""
    controls: list[ControlAssessment] = []

    for _sr_id, min_sl, assessor_fn in _SR_ASSESSORS:
        if zone.security_level_target >= min_sl:
            assessment = assessor_fn(zone, project)
            controls.append(assessment)

    total = len(controls)
    met = sum(1 for c in controls if c.status == ControlStatus.MET)
    partial = sum(1 for c in controls if c.status == ControlStatus.PARTIAL)
    unmet = sum(1 for c in controls if c.status == ControlStatus.UNMET)
    na = sum(1 for c in controls if c.status == ControlStatus.NOT_APPLICABLE)

    applicable = total - na
    if applicable > 0:
        compliance_pct = round(((met * 100.0) + (partial * 50.0)) / applicable, 1)
    else:
        compliance_pct = 100.0

    zone_type = zone.type.value if hasattr(zone.type, "value") else str(zone.type)

    return ZoneGapAnalysis(
        zone_id=zone.id,
        zone_name=zone.name,
        zone_type=zone_type,
        security_level_target=zone.security_level_target,
        total_controls=total,
        met_controls=met,
        partial_controls=partial,
        unmet_controls=unmet,
        compliance_percentage=compliance_pct,
        controls=controls,
    )


def analyze_gaps(project: Project) -> GapAnalysisReport:
    """Perform IEC 62443-3-3 compliance gap analysis.

    For each zone, checks which FRs/SRs apply based on its
    security_level_target, then determines whether each applicable
    control is MET, PARTIAL, or UNMET based on zone assets, conduit
    configuration, and network segmentation.

    Args:
        project: The project to analyze.

    Returns:
        GapAnalysisReport with per-zone analysis and remediations.
    """
    zone_analyses: list[ZoneGapAnalysis] = []
    for zone in project.zones:
        zone_analyses.append(_analyze_zone(zone, project))

    # Aggregate
    total_met = sum(z.met_controls for z in zone_analyses)
    total_partial = sum(z.partial_controls for z in zone_analyses)
    total_unmet = sum(z.unmet_controls for z in zone_analyses)
    total_na = sum(
        sum(1 for c in z.controls if c.status == ControlStatus.NOT_APPLICABLE)
        for z in zone_analyses
    )

    total_applicable = total_met + total_partial + total_unmet
    if total_applicable > 0:
        overall_compliance = round(
            ((total_met * 100.0) + (total_partial * 50.0)) / total_applicable,
            1,
        )
    else:
        overall_compliance = 100.0

    # Collect remediations by frequency
    rem_counts: dict[str, int] = {}
    for za in zone_analyses:
        for ctrl in za.controls:
            if ctrl.remediation and ctrl.status in {
                ControlStatus.UNMET,
                ControlStatus.PARTIAL,
            }:
                rem_counts[ctrl.remediation] = rem_counts.get(ctrl.remediation, 0) + 1

    priority_remediations = sorted(
        rem_counts.keys(),
        key=lambda r: rem_counts[r],
        reverse=True,
    )[:10]

    return GapAnalysisReport(
        project_name=project.project.name,
        analysis_date=datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        overall_compliance=overall_compliance,
        zones=zone_analyses,
        summary={
            "met": total_met,
            "partial": total_partial,
            "unmet": total_unmet,
            "not_applicable": total_na,
        },
        priority_remediations=priority_remediations,
    )
