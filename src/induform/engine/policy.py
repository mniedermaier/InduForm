"""IEC 62443 policy rules engine."""

from collections.abc import Callable
from enum import StrEnum

from pydantic import BaseModel, Field

from induform.models.project import Project
from induform.models.zone import ZoneType


class PolicySeverity(StrEnum):
    """Severity of policy rule violations."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class PolicyViolation(BaseModel):
    """A policy rule violation."""

    rule_id: str
    rule_name: str
    severity: PolicySeverity
    message: str
    affected_entities: list[str] = Field(default_factory=list)
    remediation: str | None = None


class PolicyRule(BaseModel):
    """A policy rule definition."""

    id: str
    name: str
    description: str
    severity: PolicySeverity
    enabled: bool = True


# Policy rule definitions
POLICY_RULES: dict[str, PolicyRule] = {
    "POL-001": PolicyRule(
        id="POL-001",
        name="Default Deny",
        description="All traffic must be explicitly allowed via conduits",
        severity=PolicySeverity.HIGH,
    ),
    "POL-002": PolicyRule(
        id="POL-002",
        name="SL Boundary Protection",
        description="Conduits spanning SL difference >= 2 require inspection",
        severity=PolicySeverity.HIGH,
    ),
    "POL-003": PolicyRule(
        id="POL-003",
        name="Protocol Allowlist",
        description="Only approved industrial protocols are permitted",
        severity=PolicySeverity.MEDIUM,
    ),
    "POL-004": PolicyRule(
        id="POL-004",
        name="Cell Zone Isolation",
        description="Cell zones must not have direct connectivity to each other",
        severity=PolicySeverity.MEDIUM,
    ),
    "POL-005": PolicyRule(
        id="POL-005",
        name="DMZ Requirement",
        description="Enterprise to cell communication must traverse DMZ",
        severity=PolicySeverity.CRITICAL,
    ),
    "POL-006": PolicyRule(
        id="POL-006",
        name="Safety Zone Protection",
        description="Safety zones require SL-T >= 3 and limited connectivity",
        severity=PolicySeverity.CRITICAL,
    ),
    "POL-007": PolicyRule(
        id="POL-007",
        name="Purdue Model Hierarchy",
        description="Conduits should connect adjacent Purdue model levels",
        severity=PolicySeverity.LOW,
    ),
    "NIST-001": PolicyRule(
        id="NIST-001",
        name="Asset Identification",
        description="All zones should have assets registered for complete inventory",
        severity=PolicySeverity.MEDIUM,
    ),
    "CIP-001": PolicyRule(
        id="CIP-001",
        name="ESP Boundary",
        description="Critical zones require a DMZ as Electronic Security Perimeter",
        severity=PolicySeverity.HIGH,
    ),
    "CIP-002": PolicyRule(
        id="CIP-002",
        name="BES Asset Classification",
        description="Assets in critical zones must have a criticality classification",
        severity=PolicySeverity.MEDIUM,
    ),
}


def evaluate_policies(
    project: Project,
    enabled_standards: list[str] | None = None,
) -> list[PolicyViolation]:
    """Evaluate all policy rules against a project.

    Args:
        project: The project to evaluate
        enabled_standards: If provided, only run rules applicable to these standards

    Returns a list of policy violations.
    """
    from induform.engine.standards import POLICY_RULE_STANDARDS

    # Build set of rule IDs to run based on enabled standards
    if enabled_standards:
        standards_set = set(enabled_standards)
        enabled_rules = {
            rule_id
            for rule_id, rule_standards in POLICY_RULE_STANDARDS.items()
            if standards_set & rule_standards
        }
    else:
        enabled_rules = None  # Run all

    violations = []

    # Map of rule_id -> checker function
    rule_checks: list[tuple[str, Callable[[Project], list[PolicyViolation]]]] = [
        ("POL-001", _check_default_deny),
        ("POL-002", _check_sl_boundary_protection),
        ("POL-003", _check_protocol_allowlist),
        ("POL-004", _check_cell_isolation),
        ("POL-005", _check_dmz_requirement),
        ("POL-006", _check_safety_zone_protection),
        ("POL-007", _check_purdue_hierarchy),
        ("NIST-001", _check_nist_asset_identification),
        ("CIP-001", _check_cip_esp_boundary),
        ("CIP-002", _check_cip_bes_classification),
    ]

    for rule_id, check_fn in rule_checks:
        if enabled_rules is not None and rule_id not in enabled_rules:
            continue
        violations.extend(check_fn(project))

    return violations


def _check_default_deny(project: Project) -> list[PolicyViolation]:
    """Check POL-001: Default deny — conduits with no flows mean traffic is implicitly allowed."""
    violations = []
    rule = POLICY_RULES["POL-001"]

    if not rule.enabled:
        return violations

    for conduit in project.conduits:
        if len(conduit.flows) == 0:
            from_zone = project.get_zone(conduit.from_zone)
            to_zone = project.get_zone(conduit.to_zone)
            violations.append(
                PolicyViolation(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    message=(
                        f"Conduit '{conduit.id}' between "
                        f"'{from_zone.name if from_zone else conduit.from_zone}' and "
                        f"'{to_zone.name if to_zone else conduit.to_zone}' has no protocol "
                        "flows defined — traffic is implicitly undefined "
                        "rather than explicitly denied"
                    ),
                    affected_entities=[conduit.id, conduit.from_zone, conduit.to_zone],
                    remediation=(
                        "Define explicit protocol flows on this conduit to enforce "
                        "default-deny. Only explicitly allowed traffic "
                        "should traverse zone boundaries."
                    ),
                )
            )

    return violations


def _check_protocol_allowlist(project: Project) -> list[PolicyViolation]:
    """Check POL-003: Only approved industrial protocols are permitted."""
    violations = []
    rule = POLICY_RULES["POL-003"]

    if not rule.enabled:
        return violations

    from induform.engine.validator import INDUSTRIAL_PROTOCOLS

    effective_allowlist = INDUSTRIAL_PROTOCOLS | {
        p.lower() for p in project.project.allowed_protocols
    }

    for conduit in project.conduits:
        for flow in conduit.flows:
            protocol_lower = flow.protocol.lower()
            if protocol_lower not in effective_allowlist:
                violations.append(
                    PolicyViolation(
                        rule_id=rule.id,
                        rule_name=rule.name,
                        severity=rule.severity,
                        message=(
                            f"Protocol '{flow.protocol}' in conduit '{conduit.id}' "
                            "is not in the approved industrial protocol allowlist"
                        ),
                        affected_entities=[conduit.id],
                        remediation=(
                            f"Replace '{flow.protocol}' with an approved industrial protocol "
                            "or add it to the project's allowed protocols list if justified"
                        ),
                    )
                )

    return violations


def _check_sl_boundary_protection(project: Project) -> list[PolicyViolation]:
    """Check POL-002: SL boundary protection."""
    violations = []
    rule = POLICY_RULES["POL-002"]

    if not rule.enabled:
        return violations

    for conduit in project.conduits:
        from_zone = project.get_zone(conduit.from_zone)
        to_zone = project.get_zone(conduit.to_zone)

        if not from_zone or not to_zone:
            continue

        sl_diff = abs(from_zone.security_level_target - to_zone.security_level_target)

        if sl_diff >= 2 and not conduit.requires_inspection:
            violations.append(
                PolicyViolation(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    message=(
                        f"Conduit '{conduit.id}' spans SL difference of {sl_diff} "
                        "without inspection enabled"
                    ),
                    affected_entities=[conduit.id, from_zone.id, to_zone.id],
                    remediation=(
                        "Enable requires_inspection on the conduit or deploy "
                        "a deep packet inspection firewall"
                    ),
                )
            )

    return violations


def _check_cell_isolation(project: Project) -> list[PolicyViolation]:
    """Check POL-004: Cell zone isolation."""
    violations = []
    rule = POLICY_RULES["POL-004"]

    if not rule.enabled:
        return violations

    cell_zones = {z.id for z in project.zones if z.type == ZoneType.CELL}

    for conduit in project.conduits:
        if conduit.from_zone in cell_zones and conduit.to_zone in cell_zones:
            violations.append(
                PolicyViolation(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    message=(
                        f"Direct cell-to-cell communication via conduit '{conduit.id}' "
                        f"between '{conduit.from_zone}' and '{conduit.to_zone}'"
                    ),
                    affected_entities=[conduit.id, conduit.from_zone, conduit.to_zone],
                    remediation=("Route cell-to-cell traffic through a supervisory zone or DMZ"),
                )
            )

    return violations


def _check_dmz_requirement(project: Project) -> list[PolicyViolation]:
    """Check POL-005: DMZ requirement for enterprise-cell communication."""
    violations = []
    rule = POLICY_RULES["POL-005"]

    if not rule.enabled:
        return violations

    enterprise_zones = {z.id for z in project.zones if z.type == ZoneType.ENTERPRISE}
    cell_zones = {z.id for z in project.zones if z.type == ZoneType.CELL}

    for conduit in project.conduits:
        is_enterprise_to_cell = (
            conduit.from_zone in enterprise_zones and conduit.to_zone in cell_zones
        ) or (conduit.from_zone in cell_zones and conduit.to_zone in enterprise_zones)

        if is_enterprise_to_cell:
            violations.append(
                PolicyViolation(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    message=(
                        f"Conduit '{conduit.id}' directly connects enterprise "
                        "and cell zones without traversing DMZ"
                    ),
                    affected_entities=[conduit.id, conduit.from_zone, conduit.to_zone],
                    remediation=("Create a DMZ zone and route enterprise-cell traffic through it"),
                )
            )

    return violations


def _check_safety_zone_protection(project: Project) -> list[PolicyViolation]:
    """Check POL-006: Safety zone protection requirements."""
    violations = []
    rule = POLICY_RULES["POL-006"]

    if not rule.enabled:
        return violations

    safety_zones = [z for z in project.zones if z.type == ZoneType.SAFETY]

    for zone in safety_zones:
        # Safety zones should have SL-T >= 3
        if zone.security_level_target < 3:
            violations.append(
                PolicyViolation(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    message=(
                        f"Safety zone '{zone.id}' has SL-T={zone.security_level_target}, "
                        "but safety zones require SL-T >= 3"
                    ),
                    affected_entities=[zone.id],
                    remediation="Increase security_level_target to at least 3",
                )
            )

        # Count conduits to safety zone
        conduit_count = len(project.get_conduits_for_zone(zone.id))
        if conduit_count > 2:
            violations.append(
                PolicyViolation(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    severity=PolicySeverity.HIGH,
                    message=(
                        f"Safety zone '{zone.id}' has {conduit_count} conduits. "
                        "Safety zones should have minimal connectivity."
                    ),
                    affected_entities=[zone.id],
                    remediation="Reduce the number of conduits to safety zones",
                )
            )

    return violations


# Purdue model levels for zone types
_PURDUE_LEVEL: dict[ZoneType, int] = {
    ZoneType.ENTERPRISE: 5,
    ZoneType.DMZ: 4,
    ZoneType.SITE: 3,
    ZoneType.AREA: 2,
    ZoneType.CELL: 1,
    ZoneType.SAFETY: 0,
}

_ADJACENT_PAIRS: set[frozenset[ZoneType]] = {
    frozenset({ZoneType.ENTERPRISE, ZoneType.DMZ}),
    frozenset({ZoneType.DMZ, ZoneType.SITE}),
    frozenset({ZoneType.SITE, ZoneType.AREA}),
    frozenset({ZoneType.AREA, ZoneType.CELL}),
    frozenset({ZoneType.CELL, ZoneType.SAFETY}),
}


def _check_purdue_hierarchy(project: Project) -> list[PolicyViolation]:
    """Check POL-007: Purdue model hierarchy enforcement.

    Connections must follow the Purdue model — each conduit should only
    connect zones at adjacent levels. Skipping levels (e.g. cell→DMZ,
    area→enterprise) violates defense-in-depth.
    """
    violations = []
    rule = POLICY_RULES["POL-007"]

    if not rule.enabled:
        return violations

    for conduit in project.conduits:
        from_zone = project.get_zone(conduit.from_zone)
        to_zone = project.get_zone(conduit.to_zone)
        if not from_zone or not to_zone:
            continue

        # Same-type is fine
        if from_zone.type == to_zone.type:
            continue

        pair = frozenset({from_zone.type, to_zone.type})
        if pair in _ADJACENT_PAIRS:
            continue

        from_level = _PURDUE_LEVEL[from_zone.type]
        to_level = _PURDUE_LEVEL[to_zone.type]
        gap = abs(from_level - to_level)

        violations.append(
            PolicyViolation(
                rule_id=rule.id,
                rule_name=rule.name,
                severity=rule.severity,
                message=(
                    f"Conduit '{conduit.id}' connects {from_zone.type.value} zone "
                    f"'{from_zone.name}' directly to {to_zone.type.value} zone "
                    f"'{to_zone.name}' (skips {gap - 1} Purdue model "
                    f"level{'s' if gap - 1 != 1 else ''})"
                ),
                affected_entities=[conduit.id, from_zone.id, to_zone.id],
                remediation=(
                    "Route traffic through intermediate zones at each Purdue level. "
                    "Direct connections should only span one level in the hierarchy: "
                    "Enterprise ↔ DMZ ↔ Site ↔ Area ↔ Cell ↔ Safety"
                ),
            )
        )

    return violations


def _check_nist_asset_identification(project: Project) -> list[PolicyViolation]:
    """Check NIST-001: Zones should have assets for complete inventory."""
    violations = []
    rule = POLICY_RULES["NIST-001"]

    if not rule.enabled:
        return violations

    for zone in project.zones:
        if len(zone.assets) == 0:
            violations.append(
                PolicyViolation(
                    rule_id=rule.id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    message=(
                        f"Zone '{zone.name}' ({zone.id}) has no assets registered. "
                        "NIST CSF requires complete asset identification."
                    ),
                    affected_entities=[zone.id],
                    remediation="Add assets to this zone to maintain a complete inventory",
                )
            )

    return violations


def _check_cip_esp_boundary(project: Project) -> list[PolicyViolation]:
    """Check CIP-001: Critical zones need a DMZ as ESP."""
    violations = []
    rule = POLICY_RULES["CIP-001"]

    if not rule.enabled:
        return violations

    dmz_zones = [z for z in project.zones if z.type == ZoneType.DMZ]
    critical_zones = [
        z
        for z in project.zones
        if z.type in (ZoneType.CELL, ZoneType.SAFETY) and z.security_level_target >= 3
    ]

    if critical_zones and not dmz_zones:
        violations.append(
            PolicyViolation(
                rule_id=rule.id,
                rule_name=rule.name,
                severity=rule.severity,
                message=(
                    "Critical zones exist but no DMZ zone provides an "
                    "Electronic Security Perimeter (ESP) boundary"
                ),
                affected_entities=[z.id for z in critical_zones],
                remediation="Add a DMZ zone to establish an ESP boundary per NERC CIP-005",
            )
        )

    return violations


def _check_cip_bes_classification(project: Project) -> list[PolicyViolation]:
    """Check CIP-002: Assets in critical zones should have criticality classification."""
    violations = []
    rule = POLICY_RULES["CIP-002"]

    if not rule.enabled:
        return violations

    critical_zones = [
        z
        for z in project.zones
        if z.type in (ZoneType.CELL, ZoneType.SAFETY) and z.security_level_target >= 3
    ]

    for zone in critical_zones:
        for asset in zone.assets:
            # Default criticality of 3 is unclassified — flag assets that haven't been
            # explicitly classified (criticality left at default or None)
            if asset.criticality is None or asset.criticality == 3:
                violations.append(
                    PolicyViolation(
                        rule_id=rule.id,
                        rule_name=rule.name,
                        severity=rule.severity,
                        message=(
                            f"Asset '{asset.name}' in critical zone '{zone.name}' "
                            "has default criticality. NERC CIP-002 requires explicit "
                            "BES Cyber Asset classification."
                        ),
                        affected_entities=[zone.id, asset.id],
                        remediation=(
                            "Set an explicit criticality level (1-5) for this asset "
                            "based on its impact on reliable BES operation"
                        ),
                    )
                )

    return violations


def get_policy_rule(rule_id: str) -> PolicyRule | None:
    """Get a policy rule by ID."""
    return POLICY_RULES.get(rule_id)


def get_all_policy_rules() -> list[PolicyRule]:
    """Get all defined policy rules."""
    return list(POLICY_RULES.values())
