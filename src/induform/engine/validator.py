"""Schema and IEC 62443 validation engine."""

from enum import Enum
from pathlib import Path

from pydantic import BaseModel, Field

from induform.models.project import Project
from induform.models.zone import ZoneType


class ValidationSeverity(str, Enum):
    """Severity levels for validation findings."""

    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class ValidationResult(BaseModel):
    """A single validation finding."""

    severity: ValidationSeverity
    code: str = Field(..., description="Unique code for this finding type")
    message: str = Field(..., description="Human-readable description")
    location: str | None = Field(None, description="Location in config (e.g., zone.id)")
    recommendation: str | None = Field(None, description="Suggested fix")


class ValidationReport(BaseModel):
    """Complete validation report."""

    valid: bool = Field(..., description="Whether the configuration is valid (no errors)")
    results: list[ValidationResult] = Field(default_factory=list)
    error_count: int = 0
    warning_count: int = 0
    info_count: int = 0


def validate_project(
    project: Project,
    strict: bool = False,
    enabled_standards: list[str] | None = None,
) -> ValidationReport:
    """Validate a project against schema and IEC 62443 policies.

    Args:
        project: The project to validate
        strict: If True, treat warnings as errors
        enabled_standards: If provided, only return checks applicable to these standards

    Returns:
        ValidationReport with all findings
    """
    from induform.engine.standards import VALIDATION_CHECK_STANDARDS

    results: list[ValidationResult] = []

    # Run all validation checks
    results.extend(_validate_zone_hierarchy(project))
    results.extend(_validate_conduit_security_levels(project))
    results.extend(_validate_purdue_model_adjacency(project))
    results.extend(_validate_dmz_requirement(project))
    results.extend(_validate_zone_isolation(project))
    results.extend(_validate_protocol_allowlist(project))
    results.extend(_validate_asset_placement(project))
    results.extend(_validate_zone_connectivity(project))
    results.extend(_validate_conduit_flows(project))
    results.extend(_validate_safety_zone_assets(project))
    results.extend(_validate_nist_asset_inventory(project))
    results.extend(_validate_cip_esp(project))

    # Filter by enabled standards if specified
    if enabled_standards:
        standards_set = set(enabled_standards)
        results = [
            r for r in results
            if standards_set & VALIDATION_CHECK_STANDARDS.get(r.code, standards_set)
        ]

    # Count by severity
    error_count = sum(1 for r in results if r.severity == ValidationSeverity.ERROR)
    warning_count = sum(1 for r in results if r.severity == ValidationSeverity.WARNING)
    info_count = sum(1 for r in results if r.severity == ValidationSeverity.INFO)

    # Determine validity
    valid = error_count == 0
    if strict:
        valid = valid and warning_count == 0

    return ValidationReport(
        valid=valid,
        results=results,
        error_count=error_count,
        warning_count=warning_count,
        info_count=info_count,
    )


def _validate_zone_hierarchy(project: Project) -> list[ValidationResult]:
    """Validate zone parent relationships form a valid hierarchy."""
    results = []
    zone_ids = {z.id for z in project.zones}

    for zone in project.zones:
        # Check for circular references
        if zone.parent_zone:
            visited = {zone.id}
            current_id = zone.parent_zone

            while current_id:
                if current_id in visited:
                    results.append(
                        ValidationResult(
                            severity=ValidationSeverity.ERROR,
                            code="ZONE_CIRCULAR_REF",
                            message=f"Circular parent reference detected for zone '{zone.id}'",
                            location=f"zones[{zone.id}].parent_zone",
                            recommendation="Remove the circular reference in zone hierarchy",
                        )
                    )
                    break

                visited.add(current_id)
                parent_zone = project.get_zone(current_id)
                current_id = parent_zone.parent_zone if parent_zone else None

    return results


def _validate_conduit_security_levels(project: Project) -> list[ValidationResult]:
    """Validate conduit security levels match zone requirements."""
    results = []

    for conduit in project.conduits:
        from_zone = project.get_zone(conduit.from_zone)
        to_zone = project.get_zone(conduit.to_zone)

        if not from_zone or not to_zone:
            continue  # Reference errors caught by model validation

        # Calculate required SL for conduit
        required_sl = max(from_zone.security_level_target, to_zone.security_level_target)

        # Check if explicit SL is set and sufficient
        if conduit.security_level_required:
            if conduit.security_level_required < required_sl:
                results.append(
                    ValidationResult(
                        severity=ValidationSeverity.ERROR,
                        code="CONDUIT_SL_INSUFFICIENT",
                        message=(
                            f"Conduit '{conduit.id}' has security_level_required={conduit.security_level_required} "
                            f"but connects zones with SL-T {from_zone.security_level_target} and "
                            f"{to_zone.security_level_target} (requires at least {required_sl})"
                        ),
                        location=f"conduits[{conduit.id}].security_level_required",
                        recommendation=f"Set security_level_required to at least {required_sl}",
                    )
                )

        # Check if inspection is required for large SL difference
        sl_diff = abs(from_zone.security_level_target - to_zone.security_level_target)
        if sl_diff >= 2 and not conduit.requires_inspection:
            results.append(
                ValidationResult(
                    severity=ValidationSeverity.WARNING,
                    code="CONDUIT_INSPECTION_RECOMMENDED",
                    message=(
                        f"Conduit '{conduit.id}' spans SL difference of {sl_diff} "
                        f"(SL-T {from_zone.security_level_target} to {to_zone.security_level_target}). "
                        "Deep packet inspection is recommended."
                    ),
                    location=f"conduits[{conduit.id}].requires_inspection",
                    recommendation="Set requires_inspection: true or add inspection device",
                )
            )

    return results


# Purdue model levels for zone types (higher = closer to IT/enterprise)
PURDUE_LEVEL: dict[ZoneType, int] = {
    ZoneType.ENTERPRISE: 5,
    ZoneType.DMZ: 4,
    ZoneType.SITE: 3,
    ZoneType.AREA: 2,
    ZoneType.CELL: 1,
    ZoneType.SAFETY: 0,
}

# Valid direct connections (adjacent levels in the Purdue model)
_ADJACENT_PAIRS: set[frozenset[ZoneType]] = {
    frozenset({ZoneType.ENTERPRISE, ZoneType.DMZ}),
    frozenset({ZoneType.DMZ, ZoneType.SITE}),
    frozenset({ZoneType.SITE, ZoneType.AREA}),
    frozenset({ZoneType.AREA, ZoneType.CELL}),
    frozenset({ZoneType.CELL, ZoneType.SAFETY}),
    # Same-type connections are allowed
}


def _validate_purdue_model_adjacency(project: Project) -> list[ValidationResult]:
    """Validate that conduits only connect adjacent Purdue model levels.

    Direct connections between non-adjacent levels (e.g. cell↔enterprise,
    area↔DMZ, cell↔DMZ) violate the Purdue model defense-in-depth principle.
    """
    results = []

    for conduit in project.conduits:
        from_zone = project.get_zone(conduit.from_zone)
        to_zone = project.get_zone(conduit.to_zone)
        if not from_zone or not to_zone:
            continue

        # Same-type connections are fine (handled by cell isolation check)
        if from_zone.type == to_zone.type:
            continue

        pair = frozenset({from_zone.type, to_zone.type})
        if pair in _ADJACENT_PAIRS:
            continue

        from_level = PURDUE_LEVEL[from_zone.type]
        to_level = PURDUE_LEVEL[to_zone.type]
        gap = abs(from_level - to_level)

        results.append(
            ValidationResult(
                severity=ValidationSeverity.INFO,
                code="PURDUE_NON_ADJACENT",
                message=(
                    f"Conduit '{conduit.id}' connects {from_zone.type.value} zone "
                    f"'{from_zone.name}' to {to_zone.type.value} zone "
                    f"'{to_zone.name}', skipping {gap - 1} Purdue model "
                    f"level{'s' if gap - 1 != 1 else ''}."
                ),
                location=f"conduits[{conduit.id}]",
                recommendation=(
                    "Consider adding intermediate zones or document "
                    "the business justification for this cross-level connection."
                ),
            )
        )

    return results


def _validate_dmz_requirement(project: Project) -> list[ValidationResult]:
    """Validate that enterprise-to-cell traffic traverses DMZ."""
    results = []

    enterprise_zones = {z.id for z in project.zones if z.type == ZoneType.ENTERPRISE}
    cell_zones = {z.id for z in project.zones if z.type == ZoneType.CELL}
    dmz_zones = {z.id for z in project.zones if z.type == ZoneType.DMZ}

    # Check for direct enterprise-to-cell conduits
    for conduit in project.conduits:
        is_enterprise_to_cell = (
            (conduit.from_zone in enterprise_zones and conduit.to_zone in cell_zones)
            or (conduit.from_zone in cell_zones and conduit.to_zone in enterprise_zones)
        )

        if is_enterprise_to_cell:
            # Check if there's a DMZ in between (simplified check)
            if dmz_zones:
                results.append(
                    ValidationResult(
                        severity=ValidationSeverity.ERROR,
                        code="DMZ_BYPASS",
                        message=(
                            f"Conduit '{conduit.id}' directly connects enterprise zone "
                            f"'{conduit.from_zone}' to cell zone '{conduit.to_zone}' "
                            "bypassing the DMZ"
                        ),
                        location=f"conduits[{conduit.id}]",
                        recommendation="Route traffic through DMZ zone for proper security boundary",
                    )
                )
            else:
                results.append(
                    ValidationResult(
                        severity=ValidationSeverity.WARNING,
                        code="DMZ_MISSING",
                        message=(
                            f"Conduit '{conduit.id}' connects enterprise to cell zone "
                            "but no DMZ zone exists in the project"
                        ),
                        location=f"conduits[{conduit.id}]",
                        recommendation="Add a DMZ zone between enterprise and cell zones",
                    )
                )

    return results


def _validate_zone_isolation(project: Project) -> list[ValidationResult]:
    """Validate that cell zones are isolated from each other by default."""
    results = []

    cell_zones = {z.id for z in project.zones if z.type == ZoneType.CELL}

    for conduit in project.conduits:
        # Check for direct cell-to-cell communication
        if conduit.from_zone in cell_zones and conduit.to_zone in cell_zones:
            results.append(
                ValidationResult(
                    severity=ValidationSeverity.WARNING,
                    code="CELL_ISOLATION_VIOLATION",
                    message=(
                        f"Conduit '{conduit.id}' allows direct communication between "
                        f"cell zones '{conduit.from_zone}' and '{conduit.to_zone}'. "
                        "Cell zones should typically be isolated."
                    ),
                    location=f"conduits[{conduit.id}]",
                    recommendation=(
                        "Consider routing through a supervisory zone or DMZ, "
                        "or document the business justification for this connection"
                    ),
                )
            )

    return results


# Industrial protocol allowlist
INDUSTRIAL_PROTOCOLS = {
    "modbus_tcp",
    "modbus_rtu",
    "opcua",
    "opc_da",
    "dnp3",
    "iec61850",
    "iec104",
    "bacnet",
    "profinet",
    "ethercat",
    "ethernet_ip",
    "cip",
    "s7comm",
    "mqtt",
    "amqp",
    "https",
    "http",
    "ssh",
    "sftp",
    "ntp",
    "snmp",
    "syslog",
    "ldap",
    "ldaps",
    "radius",
    "kerberos",
    "rdp",
    "vnc",
    "icmp",
}


def _validate_protocol_allowlist(project: Project) -> list[ValidationResult]:
    """Validate that only allowed protocols are used in conduits."""
    results = []

    effective_allowlist = INDUSTRIAL_PROTOCOLS | {
        p.lower() for p in project.project.allowed_protocols
    }

    for conduit in project.conduits:
        for flow in conduit.flows:
            protocol_lower = flow.protocol.lower()
            if protocol_lower not in effective_allowlist:
                results.append(
                    ValidationResult(
                        severity=ValidationSeverity.INFO,
                        code="PROTOCOL_NOT_IN_ALLOWLIST",
                        message=(
                            f"Protocol '{flow.protocol}' in conduit '{conduit.id}' "
                            "is not in the standard industrial protocol allowlist"
                        ),
                        location=f"conduits[{conduit.id}].flows[].protocol",
                        recommendation=(
                            "Verify this protocol is required and appropriate for OT networks"
                        ),
                    )
                )

    return results


def _validate_asset_placement(project: Project) -> list[ValidationResult]:
    """Validate that critical assets are in appropriately secured zones."""
    results = []

    # Asset types that require higher security levels
    critical_asset_types = {"plc", "scada", "dcs", "safety"}

    for zone in project.zones:
        for asset in zone.assets:
            asset_type_lower = asset.type.value.lower()
            if asset_type_lower in critical_asset_types:
                if zone.security_level_target < 2:
                    results.append(
                        ValidationResult(
                            severity=ValidationSeverity.WARNING,
                            code="CRITICAL_ASSET_LOW_SL",
                            message=(
                                f"Critical asset '{asset.name}' ({asset.type.value}) "
                                f"is in zone '{zone.id}' with SL-T={zone.security_level_target}. "
                                "Consider a higher security level."
                            ),
                            location=f"zones[{zone.id}].assets[{asset.id}]",
                            recommendation="Place critical assets in zones with SL-T >= 2",
                        )
                    )

    return results


def _validate_zone_connectivity(project: Project) -> list[ValidationResult]:
    """Warn if a zone has zero conduits (isolated, likely forgotten)."""
    results = []

    # Skip if project has only 1 zone — nothing to connect to
    if len(project.zones) <= 1:
        return results

    for zone in project.zones:
        conduits = project.get_conduits_for_zone(zone.id)
        if len(conduits) == 0:
            results.append(
                ValidationResult(
                    severity=ValidationSeverity.WARNING,
                    code="ZONE_NO_CONDUITS",
                    message=(
                        f"Zone '{zone.name}' ({zone.id}) has no conduits. "
                        "It may be isolated unintentionally."
                    ),
                    location=f"zones[{zone.id}]",
                    recommendation="Add a conduit to connect this zone or remove it if unused",
                )
            )

    return results


def _validate_conduit_flows(project: Project) -> list[ValidationResult]:
    """Warn if a conduit has no protocol flows defined."""
    results = []

    for conduit in project.conduits:
        if len(conduit.flows) == 0:
            results.append(
                ValidationResult(
                    severity=ValidationSeverity.WARNING,
                    code="CONDUIT_NO_FLOWS",
                    message=(
                        f"Conduit '{conduit.id}' has no protocol flows defined. "
                        "Traffic is implicitly undefined."
                    ),
                    location=f"conduits[{conduit.id}]",
                    recommendation="Define explicit protocol flows for this conduit",
                )
            )

    return results


# Asset types appropriate for safety zones
_SAFETY_ASSET_TYPES = {"plc", "ied", "rtu", "dcs", "firewall", "switch"}


def _validate_safety_zone_assets(project: Project) -> list[ValidationResult]:
    """Info if safety zone contains non-safety asset types."""
    results = []

    safety_zones = [z for z in project.zones if z.type == ZoneType.SAFETY]

    for zone in safety_zones:
        for asset in zone.assets:
            if asset.type.value.lower() not in _SAFETY_ASSET_TYPES:
                results.append(
                    ValidationResult(
                        severity=ValidationSeverity.INFO,
                        code="SAFETY_ZONE_NON_SAFETY_ASSET",
                        message=(
                            f"Asset '{asset.name}' ({asset.type.value}) in safety zone "
                            f"'{zone.name}' is not a typical safety zone asset type"
                        ),
                        location=f"zones[{zone.id}].assets[{asset.id}]",
                        recommendation=(
                            "Safety zones should primarily contain safety-related assets "
                            "(PLCs, IEDs, RTUs, DCS). Consider moving this asset to another zone."
                        ),
                    )
                )

    return results


def _validate_nist_asset_inventory(project: Project) -> list[ValidationResult]:
    """Warn if zones have no assets (NIST CSF asset inventory gap)."""
    results = []

    for zone in project.zones:
        if len(zone.assets) == 0:
            results.append(
                ValidationResult(
                    severity=ValidationSeverity.WARNING,
                    code="NIST_ASSET_INVENTORY_GAP",
                    message=(
                        f"Zone '{zone.name}' ({zone.id}) has no assets registered. "
                        "NIST CSF requires a complete asset inventory."
                    ),
                    location=f"zones[{zone.id}]",
                    recommendation="Add assets to this zone to maintain a complete inventory",
                )
            )

    return results


def _validate_cip_esp(project: Project) -> list[ValidationResult]:
    """Warn if no DMZ zone exists (NERC CIP Electronic Security Perimeter)."""
    results = []

    dmz_zones = [z for z in project.zones if z.type == ZoneType.DMZ]
    critical_zones = [
        z for z in project.zones
        if z.type in (ZoneType.CELL, ZoneType.SAFETY) and z.security_level_target >= 3
    ]

    if critical_zones and not dmz_zones:
        zone_names = ", ".join(f"'{z.name}'" for z in critical_zones[:3])
        results.append(
            ValidationResult(
                severity=ValidationSeverity.WARNING,
                code="CIP_ESP_MISSING",
                message=(
                    f"Critical zones ({zone_names}) exist but no DMZ zone is defined. "
                    "NERC CIP requires an Electronic Security Perimeter (ESP)."
                ),
                location="project",
                recommendation="Add a DMZ zone to establish an Electronic Security Perimeter boundary",
            )
        )

    return results


def validate_yaml_file(path: Path | str, strict: bool = False) -> ValidationReport:
    """Load and validate a YAML configuration file."""
    project = Project.from_yaml(path)
    return validate_project(project, strict=strict)
