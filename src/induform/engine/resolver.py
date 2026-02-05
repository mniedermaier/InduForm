"""Intent to security controls resolver."""

from pydantic import BaseModel, Field

from induform.iec62443.requirements import (
    SecurityRequirement,
    get_requirements_for_level,
)
from induform.iec62443.security_levels import (
    calculate_conduit_security_level,
    requires_inspection,
)
from induform.models.conduit import Conduit
from induform.models.project import Project
from induform.models.zone import Zone


class SecurityControl(BaseModel):
    """A resolved security control recommendation."""

    requirement_id: str = Field(..., description="IEC 62443-3-3 SR ID")
    requirement_name: str
    control_description: str = Field(..., description="Specific control to implement")
    applies_to: list[str] = Field(
        default_factory=list,
        description="Zone or conduit IDs this applies to",
    )
    priority: int = Field(
        default=3,
        ge=1,
        le=5,
        description="Implementation priority (1=highest)",
    )


class ConduitSecurityProfile(BaseModel):
    """Security profile for a conduit."""

    conduit_id: str
    from_zone: str
    to_zone: str
    required_security_level: int
    requires_inspection: bool
    requires_encryption: bool
    allowed_protocols: list[str]
    recommended_controls: list[str]


class ZoneSecurityProfile(BaseModel):
    """Security profile for a zone."""

    zone_id: str
    zone_name: str
    security_level_target: int
    applicable_requirements: list[str]
    recommended_controls: list[SecurityControl]


def resolve_security_controls(project: Project) -> dict:
    """Resolve high-level intent into specific security controls.

    Takes a project configuration and returns specific security
    controls that should be implemented based on:
    - Zone security levels
    - Conduit configurations
    - IEC 62443-3-3 requirements

    Returns:
        Dictionary containing:
        - zone_profiles: Security profiles per zone
        - conduit_profiles: Security profiles per conduit
        - global_controls: Project-wide controls
    """
    zone_profiles = []
    conduit_profiles = []
    global_controls = []

    # Resolve zone-level controls
    for zone in project.zones:
        profile = _resolve_zone_controls(zone)
        zone_profiles.append(profile)

    # Resolve conduit-level controls
    for conduit in project.conduits:
        from_zone = project.get_zone(conduit.from_zone)
        to_zone = project.get_zone(conduit.to_zone)
        if from_zone and to_zone:
            profile = _resolve_conduit_controls(conduit, from_zone, to_zone)
            conduit_profiles.append(profile)

    # Determine global controls based on highest SL in project
    max_sl = max((z.security_level_target for z in project.zones), default=1)
    global_controls = _resolve_global_controls(max_sl)

    return {
        "zone_profiles": [p.model_dump() for p in zone_profiles],
        "conduit_profiles": [p.model_dump() for p in conduit_profiles],
        "global_controls": global_controls,
        "max_security_level": max_sl,
    }


def _resolve_zone_controls(zone: Zone) -> ZoneSecurityProfile:
    """Resolve security controls for a single zone."""
    sl = zone.security_level_target
    requirements = get_requirements_for_level(sl)

    controls = []
    for req in requirements:
        sl_detail = req.sl_levels.get(sl, req.sl_levels.get(req.minimum_sl, ""))
        controls.append(
            SecurityControl(
                requirement_id=req.id,
                requirement_name=req.name,
                control_description=sl_detail,
                applies_to=[zone.id],
                priority=_calculate_priority(req, sl),
            )
        )

    return ZoneSecurityProfile(
        zone_id=zone.id,
        zone_name=zone.name,
        security_level_target=sl,
        applicable_requirements=[req.id for req in requirements],
        recommended_controls=controls,
    )


def _resolve_conduit_controls(
    conduit: Conduit, from_zone: Zone, to_zone: Zone
) -> ConduitSecurityProfile:
    """Resolve security controls for a conduit."""
    required_sl = calculate_conduit_security_level(
        from_zone.security_level_target, to_zone.security_level_target
    )
    needs_inspection = requires_inspection(
        from_zone.security_level_target, to_zone.security_level_target
    )

    # Determine if encryption is required based on SL
    needs_encryption = required_sl >= 3

    # Extract protocols from flows
    protocols = [flow.protocol for flow in conduit.flows]

    # Generate control recommendations
    recommendations = []

    if needs_inspection:
        recommendations.append(
            "Deploy application-layer firewall with deep packet inspection"
        )

    if needs_encryption:
        recommendations.append("Encrypt all traffic using TLS 1.3 or IPsec")

    if required_sl >= 2:
        recommendations.append("Enable stateful firewall with protocol validation")

    if required_sl >= 3:
        recommendations.append("Deploy industrial protocol-aware IDS/IPS")

    if not conduit.flows:
        recommendations.append("Define explicit protocol flows (default deny)")

    return ConduitSecurityProfile(
        conduit_id=conduit.id,
        from_zone=from_zone.id,
        to_zone=to_zone.id,
        required_security_level=required_sl,
        requires_inspection=needs_inspection or conduit.requires_inspection,
        requires_encryption=needs_encryption,
        allowed_protocols=protocols,
        recommended_controls=recommendations,
    )


def _resolve_global_controls(max_sl: int) -> list[dict]:
    """Resolve project-wide security controls."""
    controls = []

    # Always recommend network segmentation
    controls.append({
        "control": "Network Segmentation",
        "description": "Implement VLAN or physical network segmentation between zones",
        "priority": 1,
    })

    # Always recommend centralized logging
    controls.append({
        "control": "Centralized Logging",
        "description": "Deploy SIEM for security event collection and correlation",
        "priority": 2,
    })

    if max_sl >= 2:
        controls.append({
            "control": "Security Monitoring",
            "description": "Implement 24/7 security monitoring with alerting",
            "priority": 2,
        })

    if max_sl >= 3:
        controls.append({
            "control": "Incident Response",
            "description": "Establish OT-specific incident response procedures",
            "priority": 1,
        })
        controls.append({
            "control": "Vulnerability Management",
            "description": "Implement OT-aware vulnerability scanning and patching program",
            "priority": 2,
        })

    if max_sl >= 4:
        controls.append({
            "control": "Red Team Assessment",
            "description": "Conduct regular red team exercises against OT environment",
            "priority": 2,
        })
        controls.append({
            "control": "Threat Intelligence",
            "description": "Subscribe to ICS-CERT and vendor threat intelligence feeds",
            "priority": 2,
        })

    return controls


def _calculate_priority(req: SecurityRequirement, sl: int) -> int:
    """Calculate implementation priority for a requirement.

    Lower number = higher priority.
    """
    # FR 5 (Restricted Data Flow) is highest priority for zone-based security
    if "FR 5" in req.foundational_requirement:
        return 1

    # FR 1 (IAC) and FR 2 (UC) are high priority
    if "FR 1" in req.foundational_requirement or "FR 2" in req.foundational_requirement:
        return 2

    # FR 3 (SI) and FR 6 (TRE) are medium priority
    if "FR 3" in req.foundational_requirement or "FR 6" in req.foundational_requirement:
        return 3

    # FR 4 (DC) and FR 7 (RA) are lower priority
    return 4
