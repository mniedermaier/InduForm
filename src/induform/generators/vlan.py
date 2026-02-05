"""VLAN mapping generator."""

from pydantic import BaseModel, Field

from induform.models.project import Project
from induform.models.zone import Zone, ZoneType


class VLANAssignment(BaseModel):
    """VLAN assignment for a zone."""

    zone_id: str
    zone_name: str
    zone_type: ZoneType
    vlan_id: int
    vlan_name: str
    network_segment: str | None = None
    security_level: int
    description: str | None = None


class VLANMapping(BaseModel):
    """Complete VLAN mapping for a project."""

    project_name: str
    assignments: list[VLANAssignment] = Field(default_factory=list)
    reserved_vlans: list[int] = Field(
        default_factory=lambda: [1, 4095],
        description="VLANs reserved and not to be used",
    )


# VLAN ID ranges by zone type (suggested ranges)
VLAN_RANGES = {
    ZoneType.ENTERPRISE: (100, 199),
    ZoneType.SITE: (200, 299),
    ZoneType.DMZ: (300, 399),
    ZoneType.AREA: (400, 499),
    ZoneType.CELL: (500, 699),
    ZoneType.SAFETY: (700, 799),
}


def generate_vlan_mapping(
    project: Project,
    start_vlan: int | None = None,
    vlan_ranges: dict[ZoneType, tuple[int, int]] | None = None,
) -> VLANMapping:
    """Generate VLAN assignments for zones.

    Assigns VLANs based on zone type using predefined ranges,
    or sequentially from a start VLAN.

    Args:
        project: The project configuration
        start_vlan: Optional starting VLAN ID for sequential assignment
        vlan_ranges: Optional custom VLAN ranges by zone type

    Returns:
        VLANMapping with assignments
    """
    ranges = vlan_ranges or VLAN_RANGES
    assignments = []

    # Track used VLANs per zone type
    used_vlans: dict[ZoneType, int] = {}

    if start_vlan:
        # Sequential assignment
        current_vlan = start_vlan
        for zone in project.zones:
            assignment = _create_assignment(zone, current_vlan)
            assignments.append(assignment)
            current_vlan += 1
    else:
        # Range-based assignment by zone type
        for zone in project.zones:
            zone_range = ranges.get(zone.type, (800, 899))
            base_vlan = zone_range[0]

            # Get next available VLAN in range
            current_offset = used_vlans.get(zone.type, 0)
            vlan_id = base_vlan + current_offset
            used_vlans[zone.type] = current_offset + 1

            # Ensure we don't exceed range
            if vlan_id > zone_range[1]:
                raise ValueError(
                    f"Exceeded VLAN range for zone type {zone.type}: {zone_range}"
                )

            assignment = _create_assignment(zone, vlan_id)
            assignments.append(assignment)

    return VLANMapping(
        project_name=project.project.name,
        assignments=assignments,
    )


def _create_assignment(zone: Zone, vlan_id: int) -> VLANAssignment:
    """Create a VLAN assignment for a zone."""
    # Generate VLAN name from zone ID (max 32 chars for most switches)
    vlan_name = f"VLAN_{zone.id[:27]}"

    return VLANAssignment(
        zone_id=zone.id,
        zone_name=zone.name,
        zone_type=zone.type,
        vlan_id=vlan_id,
        vlan_name=vlan_name,
        network_segment=zone.network_segment,
        security_level=zone.security_level_target,
        description=zone.description,
    )


def export_vlan_csv(mapping: VLANMapping) -> str:
    """Export VLAN mapping to CSV format."""
    lines = ["vlan_id,vlan_name,zone_id,zone_name,zone_type,security_level,network_segment"]

    for assignment in mapping.assignments:
        lines.append(
            f"{assignment.vlan_id},"
            f"{assignment.vlan_name},"
            f"{assignment.zone_id},"
            f"\"{assignment.zone_name}\","
            f"{assignment.zone_type.value},"
            f"{assignment.security_level},"
            f"{assignment.network_segment or ''}"
        )

    return "\n".join(lines)


def export_vlan_cisco(mapping: VLANMapping) -> str:
    """Export VLAN mapping to Cisco IOS format."""
    lines = [
        "! Auto-generated VLAN configuration",
        f"! Project: {mapping.project_name}",
        "!",
        "configure terminal",
        "!",
    ]

    for assignment in mapping.assignments:
        lines.append(f"vlan {assignment.vlan_id}")
        lines.append(f" name {assignment.vlan_name}")
        if assignment.description:
            # Truncate description to 80 chars
            desc = assignment.description[:80]
            lines.append(f" ! {desc}")
        lines.append("!")

    lines.append("end")
    return "\n".join(lines)
