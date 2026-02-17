"""Attack path analysis engine for IEC 62443 zone/conduit models.

Identifies potential lateral movement paths from entry points (enterprise/DMZ)
to high-value targets (safety zones, critical PLCs) using a cost-weighted
Dijkstra algorithm with per-conduit weakness annotations.
"""

from __future__ import annotations

import heapq
import uuid
from enum import StrEnum

from pydantic import BaseModel, Field

from induform.models.asset import AssetType
from induform.models.conduit import Conduit
from induform.models.project import Project
from induform.models.zone import Zone, ZoneType

# Protocols considered insecure (no built-in authentication/encryption)
INSECURE_PROTOCOLS = {"modbus_tcp", "modbus/tcp", "s7comm", "profinet", "dnp3"}


class WeaknessType(StrEnum):
    """Types of conduit weaknesses an attacker could exploit."""

    NO_INSPECTION = "no_inspection"
    SL_GAP = "sl_gap"
    NO_FLOWS_DEFINED = "no_flows_defined"
    UNENCRYPTED_PROTOCOL = "unencrypted_protocol"
    EXCESSIVE_PROTOCOLS = "excessive_protocols"


class ConduitWeakness(BaseModel):
    """A specific weakness identified on a conduit."""

    weakness_type: WeaknessType
    description: str
    remediation: str
    severity_contribution: float = Field(
        ..., ge=0, le=1, description="How much this weakness contributes to risk (0-1)"
    )

    model_config = {"extra": "forbid"}


class AttackPathStep(BaseModel):
    """One step (conduit traversal) in an attack path."""

    conduit_id: str
    from_zone_id: str
    from_zone_name: str
    to_zone_id: str
    to_zone_name: str
    traversal_cost: float
    weaknesses: list[ConduitWeakness] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class AttackPath(BaseModel):
    """A complete attack path from entry point to target."""

    id: str
    entry_zone_id: str
    entry_zone_name: str
    target_zone_id: str
    target_zone_name: str
    target_reason: str
    steps: list[AttackPathStep]
    total_cost: float
    risk_score: float = Field(..., ge=0, le=100)
    risk_level: str
    zone_ids: list[str]
    conduit_ids: list[str]

    model_config = {"extra": "forbid"}


class AttackPathAnalysis(BaseModel):
    """Complete attack path analysis result."""

    paths: list[AttackPath] = Field(default_factory=list)
    entry_points: list[str] = Field(default_factory=list)
    high_value_targets: list[str] = Field(default_factory=list)
    summary: str = ""
    counts: dict[str, int] = Field(default_factory=dict)

    model_config = {"extra": "forbid"}


def _classify_risk_level(score: float) -> str:
    """Classify a risk score into a risk level."""
    if score >= 80:
        return "critical"
    elif score >= 60:
        return "high"
    elif score >= 40:
        return "medium"
    elif score >= 20:
        return "low"
    else:
        return "minimal"


def _identify_entry_points(project: Project) -> list[Zone]:
    """Identify zones that could serve as attacker entry points."""
    entries = [z for z in project.zones if z.type in (ZoneType.ENTERPRISE, ZoneType.DMZ)]
    if not entries:
        # Fallback: zone with lowest SL target
        if project.zones:
            entries = [min(project.zones, key=lambda z: z.security_level_target)]
    return entries


def _identify_targets(project: Project) -> list[tuple[Zone, str]]:
    """Identify high-value target zones with reasons."""
    targets: list[tuple[Zone, str]] = []
    seen_ids: set[str] = set()

    for zone in project.zones:
        if zone.type == ZoneType.SAFETY and zone.id not in seen_ids:
            targets.append((zone, "Safety instrumented system"))
            seen_ids.add(zone.id)

        if zone.assets:
            has_critical = any(a.criticality >= 4 for a in zone.assets)
            if has_critical and zone.id not in seen_ids:
                targets.append((zone, "Contains critical assets (criticality >= 4)"))
                seen_ids.add(zone.id)

            if zone.type == ZoneType.CELL:
                has_ics = any(
                    a.type in (AssetType.PLC, AssetType.SCADA, AssetType.DCS) for a in zone.assets
                )
                if has_ics and zone.id not in seen_ids:
                    targets.append((zone, "Cell zone with PLC/SCADA/DCS assets"))
                    seen_ids.add(zone.id)

    return targets


def _calculate_traversal_cost(
    conduit: Conduit,
    target_zone: Zone,
) -> float:
    """Calculate the cost for an attacker to traverse a conduit.

    Lower cost = easier for attacker to traverse.
    """
    cost = 0.0

    # Inspection makes traversal harder
    if conduit.requires_inspection:
        cost += 30.0

    # Higher target zone SL = harder to penetrate
    cost += 10.0 * target_zone.security_level_target

    # SL gap without inspection = very exploitable
    if conduit.security_level_required is not None:
        sl_gap = target_zone.security_level_target - conduit.security_level_required
        if sl_gap >= 2 and not conduit.requires_inspection:
            cost -= 15.0

    # Conduit's own security level
    if conduit.security_level_required:
        cost += 5.0 * conduit.security_level_required
    else:
        cost -= 5.0

    # Flow analysis
    flow_count = len(conduit.flows)
    if flow_count == 0:
        cost -= 10.0  # Undefined traffic = unknown attack surface
    elif flow_count > 3:
        cost -= 2.0 * flow_count  # Large attack surface

    # Insecure protocols
    for flow in conduit.flows:
        if flow.protocol.lower().replace("/", "_") in INSECURE_PROTOCOLS:
            cost -= 5.0

    # Floor at 1.0
    return max(cost, 1.0)


def _identify_weaknesses(
    conduit: Conduit,
    from_zone: Zone,
    to_zone: Zone,
) -> list[ConduitWeakness]:
    """Identify exploitable weaknesses on a conduit."""
    weaknesses: list[ConduitWeakness] = []

    # No inspection with SL gap
    sl_gap = abs(from_zone.security_level_target - to_zone.security_level_target)
    if not conduit.requires_inspection and sl_gap >= 1:
        weaknesses.append(
            ConduitWeakness(
                weakness_type=WeaknessType.NO_INSPECTION,
                description=(f"No deep packet inspection between zones with SL gap of {sl_gap}"),
                remediation="Enable deep packet inspection (IDS/IPS) on this conduit.",
                severity_contribution=0.3 if sl_gap >= 2 else 0.15,
            )
        )

    # SL gap >= 2
    if sl_gap >= 2:
        weaknesses.append(
            ConduitWeakness(
                weakness_type=WeaknessType.SL_GAP,
                description=(
                    f"Security level gap of {sl_gap} between "
                    f"{from_zone.name} (SL {from_zone.security_level_target}) and "
                    f"{to_zone.name} (SL {to_zone.security_level_target})"
                ),
                remediation="Add an intermediate DMZ zone or raise the lower zone's SL.",
                severity_contribution=0.25,
            )
        )

    # No flows defined
    if not conduit.flows:
        weaknesses.append(
            ConduitWeakness(
                weakness_type=WeaknessType.NO_FLOWS_DEFINED,
                description="No protocol flows defined — traffic is uncontrolled.",
                remediation="Define explicit allowed protocol flows for this conduit.",
                severity_contribution=0.2,
            )
        )

    # Insecure protocols
    for flow in conduit.flows:
        if flow.protocol.lower().replace("/", "_") in INSECURE_PROTOCOLS:
            weaknesses.append(
                ConduitWeakness(
                    weakness_type=WeaknessType.UNENCRYPTED_PROTOCOL,
                    description=(
                        f"Insecure protocol: {flow.protocol} (no built-in encryption/auth)."
                    ),
                    remediation=(
                        f"Migrate {flow.protocol} to a secure alternative "
                        f"(e.g., OPC-UA with TLS) or deploy protocol-aware firewall."
                    ),
                    severity_contribution=0.2,
                )
            )

    # Excessive protocols (> 4 flows)
    if len(conduit.flows) > 4:
        weaknesses.append(
            ConduitWeakness(
                weakness_type=WeaknessType.EXCESSIVE_PROTOCOLS,
                description=(
                    f"Excessive protocols ({len(conduit.flows)} flows) — large attack surface."
                ),
                remediation="Reduce allowed flows to essential protocols only.",
                severity_contribution=0.15,
            )
        )

    return weaknesses


def _build_adjacency(project: Project) -> dict[str, list[tuple[str, Conduit]]]:
    """Build bidirectional adjacency graph from conduits."""
    graph: dict[str, list[tuple[str, Conduit]]] = {}
    for zone in project.zones:
        graph[zone.id] = []
    for conduit in project.conduits:
        graph.setdefault(conduit.from_zone, []).append((conduit.to_zone, conduit))
        graph.setdefault(conduit.to_zone, []).append((conduit.from_zone, conduit))
    return graph


def _dijkstra(
    graph: dict[str, list[tuple[str, Conduit]]],
    start: str,
    end: str,
    zone_map: dict[str, Zone],
) -> list[tuple[str, Conduit]] | None:
    """Find cheapest path from start to end using Dijkstra.

    Returns list of (next_zone_id, conduit) tuples, or None if unreachable.
    """
    dist: dict[str, float] = {start: 0.0}
    prev: dict[str, tuple[str, Conduit] | None] = {start: None}
    heap: list[tuple[float, str]] = [(0.0, start)]

    while heap:
        d, u = heapq.heappop(heap)
        if u == end:
            # Reconstruct path
            path: list[tuple[str, Conduit]] = []
            node = end
            while prev[node] is not None:
                prev_node, conduit = prev[node]  # type: ignore[misc]
                path.append((node, conduit))
                node = prev_node
            path.reverse()
            return path

        if d > dist.get(u, float("inf")):
            continue

        for neighbor, conduit in graph.get(u, []):
            target_zone = zone_map.get(neighbor)
            if not target_zone:
                continue
            cost = _calculate_traversal_cost(conduit, target_zone)
            new_dist = d + cost
            if new_dist < dist.get(neighbor, float("inf")):
                dist[neighbor] = new_dist
                prev[neighbor] = (u, conduit)
                heapq.heappush(heap, (new_dist, neighbor))

    return None  # Unreachable


def analyze_attack_paths(
    project: Project,
    max_paths: int = 10,
) -> AttackPathAnalysis:
    """Analyze potential attack paths in a project.

    Finds shortest (cheapest for attacker) paths from entry points to
    high-value targets using modified Dijkstra with cost-weighted edges.
    """
    if not project.zones or not project.conduits:
        return AttackPathAnalysis(
            summary="No attack paths identified — project has no zones or conduits.",
            counts={"total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0, "minimal": 0},
        )

    zone_map = {z.id: z for z in project.zones}
    graph = _build_adjacency(project)
    entry_zones = _identify_entry_points(project)
    target_pairs = _identify_targets(project)

    # Filter out entries that are also targets
    entry_ids = {z.id for z in entry_zones}
    target_pairs = [(z, r) for z, r in target_pairs if z.id not in entry_ids]

    if not entry_zones or not target_pairs:
        return AttackPathAnalysis(
            entry_points=[z.name for z in entry_zones],
            high_value_targets=[z.name for z, _ in target_pairs],
            summary="No attack paths identified — no valid entry/target pairs.",
            counts={"total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0, "minimal": 0},
        )

    paths: list[AttackPath] = []
    seen_routes: set[tuple[str, str]] = set()

    for entry in entry_zones:
        for target, reason in target_pairs:
            route_key = (entry.id, target.id)
            if route_key in seen_routes:
                continue
            seen_routes.add(route_key)

            result = _dijkstra(graph, entry.id, target.id, zone_map)
            if result is None:
                continue

            steps: list[AttackPathStep] = []
            total_cost = 0.0
            zone_ids = [entry.id]
            conduit_ids: list[str] = []

            prev_zone_id = entry.id
            for next_zone_id, conduit in result:
                from_zone = zone_map[prev_zone_id]
                to_zone = zone_map[next_zone_id]
                cost = _calculate_traversal_cost(conduit, to_zone)
                weaknesses = _identify_weaknesses(conduit, from_zone, to_zone)

                steps.append(
                    AttackPathStep(
                        conduit_id=conduit.id,
                        from_zone_id=prev_zone_id,
                        from_zone_name=from_zone.name,
                        to_zone_id=next_zone_id,
                        to_zone_name=to_zone.name,
                        traversal_cost=round(cost, 1),
                        weaknesses=weaknesses,
                    )
                )
                total_cost += cost
                zone_ids.append(next_zone_id)
                conduit_ids.append(conduit.id)
                prev_zone_id = next_zone_id

            # Convert cost to risk score
            num_steps = len(steps)
            if num_steps > 0:
                avg_cost = total_cost / num_steps
                risk_score = 100.0 - (avg_cost - 1.0) * 1.8
            else:
                risk_score = 0.0
            risk_score = max(0.0, min(100.0, risk_score))
            risk_level = _classify_risk_level(risk_score)

            paths.append(
                AttackPath(
                    id=str(uuid.uuid4()),
                    entry_zone_id=entry.id,
                    entry_zone_name=entry.name,
                    target_zone_id=target.id,
                    target_zone_name=target.name,
                    target_reason=reason,
                    steps=steps,
                    total_cost=round(total_cost, 1),
                    risk_score=round(risk_score, 1),
                    risk_level=risk_level,
                    zone_ids=zone_ids,
                    conduit_ids=conduit_ids,
                )
            )

    # Sort by risk_score descending, take top max_paths
    paths.sort(key=lambda p: p.risk_score, reverse=True)
    paths = paths[:max_paths]

    # Count by risk level
    counts: dict[str, int] = {
        "total": len(paths),
        "critical": 0,
        "high": 0,
        "medium": 0,
        "low": 0,
        "minimal": 0,
    }
    for p in paths:
        counts[p.risk_level] = counts.get(p.risk_level, 0) + 1

    # Generate summary
    if paths:
        summary_parts = [f"{len(paths)} attack path(s) identified"]
        if counts["critical"]:
            summary_parts.append(f"{counts['critical']} critical")
        if counts["high"]:
            summary_parts.append(f"{counts['high']} high")
        if counts["medium"]:
            summary_parts.append(f"{counts['medium']} medium")
        summary = ", ".join(summary_parts) + "."
    else:
        summary = "No attack paths identified between entry points and high-value targets."

    return AttackPathAnalysis(
        paths=paths,
        entry_points=[z.name for z in entry_zones],
        high_value_targets=[z.name for z, _ in target_pairs],
        summary=summary,
        counts=counts,
    )
