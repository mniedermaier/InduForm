"""Compliance report generator for IEC 62443."""

from datetime import datetime, timezone

from induform.engine.policy import evaluate_policies, PolicyViolation, PolicySeverity
from induform.engine.resolver import resolve_security_controls
from induform.engine.validator import validate_project, ValidationSeverity
from induform.iec62443.requirements import get_requirements_for_level, SECURITY_REQUIREMENTS
from induform.iec62443.security_levels import SECURITY_LEVEL_DESCRIPTIONS
from induform.models.project import Project


def generate_compliance_report(
    project: Project,
    include_controls: bool = True,
    include_requirements: bool = True,
) -> str:
    """Generate a Markdown compliance report.

    Args:
        project: The project configuration
        include_controls: Include security control recommendations
        include_requirements: Include IEC 62443-3-3 requirements mapping

    Returns:
        Markdown formatted report
    """
    lines = []

    # Header
    lines.extend([
        f"# IEC 62443 Compliance Report",
        "",
        f"**Project:** {project.project.name}",
        f"**Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"**Standard:** {', '.join(project.project.compliance_standards)}",
        "",
    ])

    # Executive Summary
    lines.extend(_generate_executive_summary(project))

    # Zone Overview
    lines.extend(_generate_zone_overview(project))

    # Conduit Overview
    lines.extend(_generate_conduit_overview(project))

    # Validation Results
    lines.extend(_generate_validation_section(project))

    # Policy Compliance
    lines.extend(_generate_policy_section(project))

    # Security Requirements Mapping
    if include_requirements:
        lines.extend(_generate_requirements_section(project))

    # Security Controls
    if include_controls:
        lines.extend(_generate_controls_section(project))

    return "\n".join(lines)


def _generate_executive_summary(project: Project) -> list[str]:
    """Generate executive summary section."""
    validation = validate_project(project)
    violations = evaluate_policies(project)

    # Calculate stats
    zone_count = len(project.zones)
    conduit_count = len(project.conduits)
    asset_count = sum(len(z.assets) for z in project.zones)
    max_sl = max((z.security_level_target for z in project.zones), default=1)

    critical_violations = sum(1 for v in violations if v.severity == PolicySeverity.CRITICAL)
    high_violations = sum(1 for v in violations if v.severity == PolicySeverity.HIGH)

    status = "COMPLIANT" if validation.valid and critical_violations == 0 else "NON-COMPLIANT"
    status_icon = "PASS" if status == "COMPLIANT" else "FAIL"

    lines = [
        "## Executive Summary",
        "",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| Overall Status | **{status}** ({status_icon}) |",
        f"| Zones | {zone_count} |",
        f"| Conduits | {conduit_count} |",
        f"| Assets | {asset_count} |",
        f"| Maximum SL-T | {max_sl} |",
        f"| Validation Errors | {validation.error_count} |",
        f"| Validation Warnings | {validation.warning_count} |",
        f"| Critical Policy Violations | {critical_violations} |",
        f"| High Policy Violations | {high_violations} |",
        "",
    ]

    return lines


def _generate_zone_overview(project: Project) -> list[str]:
    """Generate zone overview section."""
    lines = [
        "## Zone Overview",
        "",
        "| Zone ID | Name | Type | SL-T | Assets | Parent |",
        "|---------|------|------|------|--------|--------|",
    ]

    for zone in project.zones:
        parent = zone.parent_zone or "-"
        lines.append(
            f"| {zone.id} | {zone.name} | {zone.type.value} | "
            f"{zone.security_level_target} | {len(zone.assets)} | {parent} |"
        )

    lines.append("")
    return lines


def _generate_conduit_overview(project: Project) -> list[str]:
    """Generate conduit overview section."""
    lines = [
        "## Conduit Overview",
        "",
        "| Conduit ID | From Zone | To Zone | Protocols | Inspection |",
        "|------------|-----------|---------|-----------|------------|",
    ]

    for conduit in project.conduits:
        protocols = ", ".join(f.protocol for f in conduit.flows) or "none"
        inspection = "Yes" if conduit.requires_inspection else "No"
        lines.append(
            f"| {conduit.id} | {conduit.from_zone} | {conduit.to_zone} | "
            f"{protocols} | {inspection} |"
        )

    lines.append("")
    return lines


def _generate_validation_section(project: Project) -> list[str]:
    """Generate validation results section."""
    validation = validate_project(project)

    lines = [
        "## Validation Results",
        "",
    ]

    if validation.valid:
        lines.append("Configuration validation passed with no errors.")
        lines.append("")
    else:
        lines.append(f"**{validation.error_count} errors found.**")
        lines.append("")

    if validation.results:
        lines.extend([
            "| Severity | Code | Message | Location |",
            "|----------|------|---------|----------|",
        ])

        for result in validation.results:
            severity_icon = {
                ValidationSeverity.ERROR: "ERROR",
                ValidationSeverity.WARNING: "WARN",
                ValidationSeverity.INFO: "INFO",
            }.get(result.severity, "")

            location = result.location or "-"
            message = result.message.replace("|", "/")  # Escape pipes
            lines.append(
                f"| {severity_icon} | {result.code} | {message} | {location} |"
            )

        lines.append("")

    return lines


def _generate_policy_section(project: Project) -> list[str]:
    """Generate policy compliance section."""
    violations = evaluate_policies(project)

    lines = [
        "## Policy Compliance",
        "",
    ]

    if not violations:
        lines.append("All policy rules passed.")
        lines.append("")
        return lines

    lines.extend([
        f"**{len(violations)} policy violations found.**",
        "",
        "| Severity | Rule | Message | Affected Entities |",
        "|----------|------|---------|-------------------|",
    ])

    for violation in violations:
        entities = ", ".join(violation.affected_entities[:3])
        if len(violation.affected_entities) > 3:
            entities += "..."
        message = violation.message.replace("|", "/")

        lines.append(
            f"| {violation.severity.value.upper()} | {violation.rule_id} | "
            f"{message} | {entities} |"
        )

    lines.append("")
    return lines


def _generate_requirements_section(project: Project) -> list[str]:
    """Generate IEC 62443-3-3 requirements mapping section."""
    max_sl = max((z.security_level_target for z in project.zones), default=1)
    requirements = get_requirements_for_level(max_sl)

    lines = [
        "## IEC 62443-3-3 Requirements",
        "",
        f"Based on maximum Security Level Target (SL-T) of **{max_sl}**, "
        f"the following security requirements apply:",
        "",
        "| Requirement | Name | SL-{} Detail |".format(max_sl),
        "|-------------|------|-------------|",
    ]

    for req in requirements:
        detail = req.sl_levels.get(max_sl, req.sl_levels.get(req.minimum_sl, "-"))
        detail = detail.replace("|", "/")  # Escape pipes
        lines.append(f"| {req.id} | {req.name} | {detail} |")

    lines.append("")
    return lines


def _generate_controls_section(project: Project) -> list[str]:
    """Generate security controls section."""
    controls = resolve_security_controls(project)

    lines = [
        "## Recommended Security Controls",
        "",
        "### Global Controls",
        "",
    ]

    for control in controls["global_controls"]:
        lines.append(f"- **{control['control']}** (Priority {control['priority']})")
        lines.append(f"  - {control['description']}")
        lines.append("")

    lines.extend([
        "### Conduit-Specific Controls",
        "",
    ])

    for profile in controls["conduit_profiles"]:
        lines.append(f"#### Conduit: {profile['conduit_id']}")
        lines.append(f"- From: {profile['from_zone']} → To: {profile['to_zone']}")
        lines.append(f"- Required SL: {profile['required_security_level']}")
        lines.append(f"- Requires Inspection: {'Yes' if profile['requires_inspection'] else 'No'}")
        lines.append(f"- Requires Encryption: {'Yes' if profile['requires_encryption'] else 'No'}")

        if profile["recommended_controls"]:
            lines.append("- Recommendations:")
            for ctrl in profile["recommended_controls"]:
                lines.append(f"  - {ctrl}")

        lines.append("")

    return lines
