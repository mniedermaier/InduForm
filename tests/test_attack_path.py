"""Tests for attack path analysis engine."""

import pytest

from induform.models.project import Project, ProjectMetadata
from induform.models.zone import Zone, ZoneType
from induform.models.conduit import Conduit, ProtocolFlow
from induform.models.asset import Asset, AssetType
from induform.engine.attack_path import (
    WeaknessType,
    analyze_attack_paths,
    _calculate_traversal_cost,
    _identify_entry_points,
    _identify_targets,
    _identify_weaknesses,
)


# ── Helpers ──────────────────────────────────────────────────────────


def _make_project(
    zones: list[Zone] | None = None,
    conduits: list[Conduit] | None = None,
) -> Project:
    return Project(
        version="1.0",
        project=ProjectMetadata(name="Test", compliance_standards=["IEC62443"]),
        zones=zones or [],
        conduits=conduits or [],
    )


def _zone(
    zone_id: str,
    zone_type: ZoneType = ZoneType.CELL,
    sl_t: int = 2,
    sl_c: int | None = None,
    assets: list[Asset] | None = None,
) -> Zone:
    return Zone(
        id=zone_id,
        name=zone_id.replace("_", " ").title(),
        type=zone_type,
        security_level_target=sl_t,
        security_level_capability=sl_c,
        assets=assets or [],
    )


def _conduit(
    conduit_id: str,
    from_zone: str,
    to_zone: str,
    flows: list[ProtocolFlow] | None = None,
    requires_inspection: bool = False,
    sl_required: int | None = None,
) -> Conduit:
    return Conduit(
        id=conduit_id,
        from_zone=from_zone,
        to_zone=to_zone,
        flows=flows or [],
        requires_inspection=requires_inspection,
        security_level_required=sl_required,
    )


def _flow(protocol: str = "modbus_tcp", port: int | None = 502) -> ProtocolFlow:
    return ProtocolFlow(protocol=protocol, port=port)


def _asset(
    asset_id: str = "plc-1",
    name: str = "PLC",
    asset_type: AssetType = AssetType.PLC,
    criticality: int = 3,
) -> Asset:
    return Asset(id=asset_id, name=name, type=asset_type, criticality=criticality)


# ══════════════════════════════════════════════════════════════════════
#  ATTACK PATH ANALYSIS TESTS
# ══════════════════════════════════════════════════════════════════════


class TestEmptyAndMinimalProjects:
    """Edge cases with no zones, single zone, or no conduits."""

    def test_empty_project_returns_no_paths(self):
        result = analyze_attack_paths(_make_project())
        assert result.paths == []
        assert result.counts["total"] == 0

    def test_single_zone_returns_no_paths(self):
        project = _make_project(zones=[_zone("z1", ZoneType.ENTERPRISE)])
        result = analyze_attack_paths(project)
        assert result.paths == []

    def test_two_zones_no_conduits_returns_no_paths(self):
        project = _make_project(
            zones=[_zone("z1", ZoneType.ENTERPRISE), _zone("z2", ZoneType.SAFETY)],
        )
        result = analyze_attack_paths(project)
        assert result.paths == []


class TestEntryPointIdentification:
    """Entry point detection: enterprise, DMZ, or fallback."""

    def test_enterprise_zone_is_entry(self):
        project = _make_project(
            zones=[
                _zone("ent", ZoneType.ENTERPRISE, sl_t=2),
                _zone("ctrl", ZoneType.AREA, sl_t=3),
            ],
        )
        entries = _identify_entry_points(project)
        assert any(z.id == "ent" for z in entries)

    def test_dmz_zone_is_entry(self):
        project = _make_project(
            zones=[
                _zone("dmz", ZoneType.DMZ, sl_t=3),
                _zone("ctrl", ZoneType.AREA, sl_t=3),
            ],
        )
        entries = _identify_entry_points(project)
        assert any(z.id == "dmz" for z in entries)

    def test_fallback_to_lowest_sl(self):
        """When no enterprise/DMZ, pick zone with lowest SL-T."""
        project = _make_project(
            zones=[
                _zone("z1", ZoneType.CELL, sl_t=3),
                _zone("z2", ZoneType.AREA, sl_t=1),
            ],
        )
        entries = _identify_entry_points(project)
        assert len(entries) == 1
        assert entries[0].id == "z2"


class TestTargetIdentification:
    """Target detection: safety zones, critical assets, cell + PLC/SCADA/DCS."""

    def test_safety_zone_is_target(self):
        project = _make_project(
            zones=[_zone("safety", ZoneType.SAFETY, sl_t=4)],
        )
        targets = _identify_targets(project)
        assert any(z.id == "safety" for z, _ in targets)

    def test_critical_asset_zone_is_target(self):
        project = _make_project(
            zones=[
                _zone(
                    "field",
                    ZoneType.CELL,
                    sl_t=3,
                    assets=[_asset("plc-1", criticality=4)],
                ),
            ],
        )
        targets = _identify_targets(project)
        assert any(z.id == "field" for z, _ in targets)

    def test_cell_with_plc_is_target(self):
        project = _make_project(
            zones=[
                _zone(
                    "field",
                    ZoneType.CELL,
                    sl_t=3,
                    assets=[_asset("plc-1", asset_type=AssetType.PLC, criticality=2)],
                ),
            ],
        )
        targets = _identify_targets(project)
        # Should be identified as cell with PLC
        assert any(z.id == "field" for z, _ in targets)


class TestTraversalCost:
    """Cost function: inspection, SL, protocols."""

    def test_inspection_increases_cost(self):
        zone = _zone("z", sl_t=2)
        c_no_insp = _conduit("c1", "a", "z")
        c_with_insp = _conduit("c2", "a", "z", requires_inspection=True)
        cost_no = _calculate_traversal_cost(c_no_insp, zone)
        cost_yes = _calculate_traversal_cost(c_with_insp, zone)
        assert cost_yes > cost_no

    def test_sl_gap_without_inspection_decreases_cost(self):
        """SL gap >= 2 without inspection makes traversal easier."""
        zone_high_sl = _zone("z", sl_t=4)
        c_low_sl = _conduit("c1", "a", "z", sl_required=1)
        c_matching = _conduit("c2", "a", "z", sl_required=4)
        cost_gap = _calculate_traversal_cost(c_low_sl, zone_high_sl)
        cost_no_gap = _calculate_traversal_cost(c_matching, zone_high_sl)
        assert cost_gap < cost_no_gap

    def test_insecure_protocol_decreases_cost(self):
        zone = _zone("z", sl_t=2)
        c_secure = _conduit("c1", "a", "z", flows=[_flow("https", 443)])
        c_insecure = _conduit("c2", "a", "z", flows=[_flow("modbus_tcp", 502)])
        cost_secure = _calculate_traversal_cost(c_secure, zone)
        cost_insecure = _calculate_traversal_cost(c_insecure, zone)
        assert cost_insecure < cost_secure

    def test_cost_never_below_one(self):
        """Cost floor is 1.0 regardless of how many negative factors."""
        zone = _zone("z", sl_t=1)
        c = _conduit(
            "c1", "a", "z",
            flows=[_flow("modbus_tcp"), _flow("s7comm", 102), _flow("dnp3", 20000)],
        )
        cost = _calculate_traversal_cost(c, zone)
        assert cost >= 1.0


class TestWeaknessDetection:
    """Conduit weakness identification."""

    def test_no_inspection_flagged(self):
        from_zone = _zone("a", sl_t=2)
        to_zone = _zone("b", sl_t=4)
        conduit = _conduit("c", "a", "b")
        weaknesses = _identify_weaknesses(conduit, from_zone, to_zone)
        types = [w.weakness_type for w in weaknesses]
        assert WeaknessType.NO_INSPECTION in types

    def test_insecure_protocol_flagged(self):
        from_zone = _zone("a", sl_t=2)
        to_zone = _zone("b", sl_t=2)
        conduit = _conduit("c", "a", "b", flows=[_flow("modbus_tcp", 502)])
        weaknesses = _identify_weaknesses(conduit, from_zone, to_zone)
        types = [w.weakness_type for w in weaknesses]
        assert WeaknessType.UNENCRYPTED_PROTOCOL in types

    def test_sl_gap_flagged(self):
        from_zone = _zone("a", sl_t=1)
        to_zone = _zone("b", sl_t=4)
        conduit = _conduit("c", "a", "b", requires_inspection=True)
        weaknesses = _identify_weaknesses(conduit, from_zone, to_zone)
        types = [w.weakness_type for w in weaknesses]
        assert WeaknessType.SL_GAP in types

    def test_no_flows_flagged(self):
        from_zone = _zone("a", sl_t=2)
        to_zone = _zone("b", sl_t=2)
        conduit = _conduit("c", "a", "b")
        weaknesses = _identify_weaknesses(conduit, from_zone, to_zone)
        types = [w.weakness_type for w in weaknesses]
        assert WeaknessType.NO_FLOWS_DEFINED in types


class TestFullPathAnalysis:
    """End-to-end attack path analysis."""

    def test_simple_entry_to_target_path(self):
        """Enterprise → Safety via one conduit produces one path."""
        project = _make_project(
            zones=[
                _zone("ent", ZoneType.ENTERPRISE, sl_t=2),
                _zone("safety", ZoneType.SAFETY, sl_t=4),
            ],
            conduits=[_conduit("c1", "ent", "safety", flows=[_flow("https", 443)])],
        )
        result = analyze_attack_paths(project)
        assert len(result.paths) >= 1
        path = result.paths[0]
        assert path.entry_zone_id == "ent"
        assert path.target_zone_id == "safety"
        assert len(path.steps) == 1

    def test_paths_sorted_by_risk_descending(self):
        """Multiple paths should be ordered by risk_score (highest first)."""
        project = _make_project(
            zones=[
                _zone("ent", ZoneType.ENTERPRISE, sl_t=2),
                _zone("ctrl", ZoneType.AREA, sl_t=3),
                _zone(
                    "field",
                    ZoneType.CELL,
                    sl_t=4,
                    assets=[_asset("plc", criticality=5)],
                ),
                _zone("safety", ZoneType.SAFETY, sl_t=4),
            ],
            conduits=[
                _conduit("c1", "ent", "ctrl", flows=[_flow("https", 443)]),
                _conduit(
                    "c2",
                    "ctrl",
                    "field",
                    flows=[_flow("modbus_tcp", 502)],
                ),
                _conduit(
                    "c3",
                    "ctrl",
                    "safety",
                    flows=[_flow("https", 443)],
                    requires_inspection=True,
                    sl_required=4,
                ),
            ],
        )
        result = analyze_attack_paths(project)
        assert len(result.paths) >= 2
        for i in range(len(result.paths) - 1):
            assert result.paths[i].risk_score >= result.paths[i + 1].risk_score

    def test_max_paths_parameter_respected(self):
        """max_paths limits the number of returned paths."""
        project = _make_project(
            zones=[
                _zone("ent", ZoneType.ENTERPRISE, sl_t=2),
                _zone("dmz", ZoneType.DMZ, sl_t=3),
                _zone("ctrl", ZoneType.AREA, sl_t=3),
                _zone(
                    "field",
                    ZoneType.CELL,
                    sl_t=4,
                    assets=[_asset("plc", criticality=5)],
                ),
                _zone("safety", ZoneType.SAFETY, sl_t=4),
            ],
            conduits=[
                _conduit("c1", "ent", "dmz", flows=[_flow("https", 443)]),
                _conduit("c2", "dmz", "ctrl", flows=[_flow("https", 443)]),
                _conduit("c3", "ctrl", "field", flows=[_flow("modbus_tcp", 502)]),
                _conduit("c4", "ctrl", "safety", flows=[_flow("https", 443)]),
                _conduit("c5", "ent", "ctrl", flows=[_flow("https", 443)]),
            ],
        )
        result = analyze_attack_paths(project, max_paths=2)
        assert len(result.paths) <= 2

    def test_disconnected_zones_no_paths(self):
        """Zones with no connecting conduits produce no paths."""
        project = _make_project(
            zones=[
                _zone("ent", ZoneType.ENTERPRISE, sl_t=2),
                _zone("safety", ZoneType.SAFETY, sl_t=4),
                _zone("island", ZoneType.CELL, sl_t=3),
            ],
            conduits=[
                # Only connects ent → island, safety is disconnected
                _conduit("c1", "ent", "island", flows=[_flow("https", 443)]),
            ],
        )
        result = analyze_attack_paths(project)
        # Should not have a path to safety (disconnected)
        safety_paths = [p for p in result.paths if p.target_zone_id == "safety"]
        assert len(safety_paths) == 0

    def test_path_zone_ids_and_conduit_ids(self):
        """Path should contain correct zone_ids and conduit_ids."""
        project = _make_project(
            zones=[
                _zone("ent", ZoneType.ENTERPRISE, sl_t=2),
                _zone("ctrl", ZoneType.AREA, sl_t=3),
                _zone("safety", ZoneType.SAFETY, sl_t=4),
            ],
            conduits=[
                _conduit("c1", "ent", "ctrl", flows=[_flow("https", 443)]),
                _conduit("c2", "ctrl", "safety", flows=[_flow("https", 443)]),
            ],
        )
        result = analyze_attack_paths(project)
        assert len(result.paths) >= 1
        path = result.paths[0]
        assert path.zone_ids == ["ent", "ctrl", "safety"]
        assert path.conduit_ids == ["c1", "c2"]

    def test_summary_includes_counts(self):
        """Summary text should mention the number of paths."""
        project = _make_project(
            zones=[
                _zone("ent", ZoneType.ENTERPRISE, sl_t=2),
                _zone("safety", ZoneType.SAFETY, sl_t=4),
            ],
            conduits=[_conduit("c1", "ent", "safety", flows=[_flow("https", 443)])],
        )
        result = analyze_attack_paths(project)
        assert "1 attack path" in result.summary
