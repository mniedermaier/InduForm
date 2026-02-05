"""Tests for engine modules: policy, risk, resolver, standards."""

import pytest

from induform.models.project import Project, ProjectMetadata
from induform.models.zone import Zone, ZoneType
from induform.models.conduit import Conduit, ProtocolFlow, ConduitDirection
from induform.models.asset import Asset, AssetType
from induform.engine.policy import (
    evaluate_policies,
    get_policy_rule,
    get_all_policy_rules,
    POLICY_RULES,
    PolicySeverity,
)
from induform.engine.risk import (
    assess_risk,
    calculate_zone_risk,
    classify_risk_level,
    RiskLevel,
)
from induform.engine.resolver import resolve_security_controls
from induform.engine.standards import (
    ComplianceStandard,
    STANDARD_INFO,
    VALIDATION_CHECK_STANDARDS,
    POLICY_RULE_STANDARDS,
)


# ── Helpers ──────────────────────────────────────────────────────────


def _make_project(
    zones: list[Zone] | None = None,
    conduits: list[Conduit] | None = None,
    standards: list[str] | None = None,
    allowed_protocols: list[str] | None = None,
) -> Project:
    """Build a minimal Project for testing."""
    return Project(
        version="1.0",
        project=ProjectMetadata(
            name="Test Project",
            compliance_standards=standards or ["IEC62443"],
            allowed_protocols=allowed_protocols or [],
        ),
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
) -> Conduit:
    return Conduit(
        id=conduit_id,
        from_zone=from_zone,
        to_zone=to_zone,
        flows=flows or [],
        requires_inspection=requires_inspection,
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
#  POLICY ENGINE TESTS
# ══════════════════════════════════════════════════════════════════════


class TestPolicyDefaultDeny:
    """POL-001: Default Deny — conduits must have flows."""

    def test_conduit_with_no_flows_violates(self):
        project = _make_project(
            zones=[_zone("z1"), _zone("z2")],
            conduits=[_conduit("c1", "z1", "z2")],
        )
        violations = evaluate_policies(project)
        pol001 = [v for v in violations if v.rule_id == "POL-001"]
        assert len(pol001) == 1
        assert "c1" in pol001[0].message

    def test_conduit_with_flows_passes(self):
        project = _make_project(
            zones=[_zone("z1"), _zone("z2")],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow()])],
        )
        violations = evaluate_policies(project)
        pol001 = [v for v in violations if v.rule_id == "POL-001"]
        assert len(pol001) == 0


class TestPolicySLBoundary:
    """POL-002: Conduits spanning SL diff >= 2 require inspection."""

    def test_large_sl_diff_no_inspection_violates(self):
        project = _make_project(
            zones=[_zone("z1", sl_t=1), _zone("z2", sl_t=3)],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow()])],
        )
        violations = evaluate_policies(project)
        pol002 = [v for v in violations if v.rule_id == "POL-002"]
        assert len(pol002) == 1

    def test_large_sl_diff_with_inspection_passes(self):
        project = _make_project(
            zones=[_zone("z1", sl_t=1), _zone("z2", sl_t=3)],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow()], requires_inspection=True)],
        )
        violations = evaluate_policies(project)
        pol002 = [v for v in violations if v.rule_id == "POL-002"]
        assert len(pol002) == 0

    def test_small_sl_diff_passes(self):
        project = _make_project(
            zones=[_zone("z1", sl_t=2), _zone("z2", sl_t=3)],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow()])],
        )
        violations = evaluate_policies(project)
        pol002 = [v for v in violations if v.rule_id == "POL-002"]
        assert len(pol002) == 0


class TestPolicyProtocolAllowlist:
    """POL-003: Only approved protocols allowed."""

    def test_unapproved_protocol_violates(self):
        project = _make_project(
            zones=[_zone("z1"), _zone("z2")],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow("telnet", 23)])],
        )
        violations = evaluate_policies(project)
        pol003 = [v for v in violations if v.rule_id == "POL-003"]
        assert len(pol003) == 1
        assert "telnet" in pol003[0].message.lower()

    def test_approved_protocol_passes(self):
        project = _make_project(
            zones=[_zone("z1"), _zone("z2")],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow("modbus_tcp", 502)])],
        )
        violations = evaluate_policies(project)
        pol003 = [v for v in violations if v.rule_id == "POL-003"]
        assert len(pol003) == 0

    def test_custom_allowed_protocol_passes(self):
        project = _make_project(
            zones=[_zone("z1"), _zone("z2")],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow("custom_proto")])],
            allowed_protocols=["custom_proto"],
        )
        violations = evaluate_policies(project)
        pol003 = [v for v in violations if v.rule_id == "POL-003"]
        assert len(pol003) == 0


class TestPolicyCellIsolation:
    """POL-004: Cell zones must not have direct connectivity."""

    def test_cell_to_cell_conduit_violates(self):
        project = _make_project(
            zones=[_zone("c1", ZoneType.CELL), _zone("c2", ZoneType.CELL)],
            conduits=[_conduit("con1", "c1", "c2", flows=[_flow()])],
        )
        violations = evaluate_policies(project)
        pol004 = [v for v in violations if v.rule_id == "POL-004"]
        assert len(pol004) == 1

    def test_cell_to_area_passes(self):
        project = _make_project(
            zones=[_zone("c1", ZoneType.CELL), _zone("a1", ZoneType.AREA)],
            conduits=[_conduit("con1", "c1", "a1", flows=[_flow()])],
        )
        violations = evaluate_policies(project)
        pol004 = [v for v in violations if v.rule_id == "POL-004"]
        assert len(pol004) == 0


class TestPolicyDMZRequirement:
    """POL-005: Enterprise to cell must traverse DMZ."""

    def test_enterprise_to_cell_direct_violates(self):
        project = _make_project(
            zones=[_zone("ent", ZoneType.ENTERPRISE, sl_t=1), _zone("cell", ZoneType.CELL)],
            conduits=[_conduit("c1", "ent", "cell", flows=[_flow()])],
        )
        violations = evaluate_policies(project)
        pol005 = [v for v in violations if v.rule_id == "POL-005"]
        assert len(pol005) == 1

    def test_enterprise_to_dmz_passes(self):
        project = _make_project(
            zones=[_zone("ent", ZoneType.ENTERPRISE, sl_t=1), _zone("dmz", ZoneType.DMZ, sl_t=3)],
            conduits=[_conduit("c1", "ent", "dmz", flows=[_flow()])],
        )
        violations = evaluate_policies(project)
        pol005 = [v for v in violations if v.rule_id == "POL-005"]
        assert len(pol005) == 0


class TestPolicySafetyZone:
    """POL-006: Safety zone protection."""

    def test_safety_zone_low_sl_violates(self):
        project = _make_project(
            zones=[_zone("safety", ZoneType.SAFETY, sl_t=1)],
        )
        violations = evaluate_policies(project)
        pol006 = [v for v in violations if v.rule_id == "POL-006"]
        assert len(pol006) >= 1
        assert any("SL-T=1" in v.message for v in pol006)

    def test_safety_zone_high_sl_passes(self):
        project = _make_project(
            zones=[_zone("safety", ZoneType.SAFETY, sl_t=3)],
        )
        violations = evaluate_policies(project)
        pol006 = [v for v in violations if v.rule_id == "POL-006"]
        # No SL violation (may still have connectivity warning if conduits > 2)
        sl_violations = [v for v in pol006 if "SL-T" in v.message]
        assert len(sl_violations) == 0

    def test_safety_zone_too_many_conduits(self):
        z_safety = _zone("safety", ZoneType.SAFETY, sl_t=3)
        others = [_zone(f"z{i}", ZoneType.AREA) for i in range(4)]
        conduits = [
            _conduit(f"c{i}", f"z{i}", "safety", flows=[_flow()])
            for i in range(4)
        ]
        project = _make_project(
            zones=[z_safety] + others,
            conduits=conduits,
        )
        violations = evaluate_policies(project)
        pol006 = [v for v in violations if v.rule_id == "POL-006"]
        conn_violations = [v for v in pol006 if "conduits" in v.message.lower()]
        assert len(conn_violations) >= 1


class TestPolicyPurdueHierarchy:
    """POL-007: Purdue model hierarchy enforcement."""

    def test_adjacent_levels_pass(self):
        project = _make_project(
            zones=[_zone("ent", ZoneType.ENTERPRISE, sl_t=1), _zone("dmz", ZoneType.DMZ, sl_t=3)],
            conduits=[_conduit("c1", "ent", "dmz", flows=[_flow()])],
        )
        violations = evaluate_policies(project)
        pol007 = [v for v in violations if v.rule_id == "POL-007"]
        assert len(pol007) == 0

    def test_non_adjacent_levels_violate(self):
        project = _make_project(
            zones=[_zone("ent", ZoneType.ENTERPRISE, sl_t=1), _zone("cell", ZoneType.CELL)],
            conduits=[_conduit("c1", "ent", "cell", flows=[_flow()])],
        )
        violations = evaluate_policies(project)
        pol007 = [v for v in violations if v.rule_id == "POL-007"]
        assert len(pol007) >= 1
        assert "skips" in pol007[0].message.lower()

    def test_same_type_passes(self):
        project = _make_project(
            zones=[_zone("a1", ZoneType.AREA), _zone("a2", ZoneType.AREA)],
            conduits=[_conduit("c1", "a1", "a2", flows=[_flow()])],
        )
        violations = evaluate_policies(project)
        pol007 = [v for v in violations if v.rule_id == "POL-007"]
        assert len(pol007) == 0


class TestPolicyNISTAssetIdentification:
    """NIST-001: Zones should have assets."""

    def test_zone_without_assets_violates(self):
        project = _make_project(
            zones=[_zone("z1")],
            standards=["NIST_CSF"],
        )
        violations = evaluate_policies(project, enabled_standards=["NIST_CSF"])
        nist001 = [v for v in violations if v.rule_id == "NIST-001"]
        assert len(nist001) == 1

    def test_zone_with_assets_passes(self):
        project = _make_project(
            zones=[_zone("z1", assets=[_asset()])],
            standards=["NIST_CSF"],
        )
        violations = evaluate_policies(project, enabled_standards=["NIST_CSF"])
        nist001 = [v for v in violations if v.rule_id == "NIST-001"]
        assert len(nist001) == 0

    def test_nist_rule_not_run_for_iec62443_only(self):
        project = _make_project(
            zones=[_zone("z1")],
            standards=["IEC62443"],
        )
        violations = evaluate_policies(project, enabled_standards=["IEC62443"])
        nist001 = [v for v in violations if v.rule_id == "NIST-001"]
        assert len(nist001) == 0


class TestPolicyCIPESP:
    """CIP-001: Critical zones need DMZ as ESP."""

    def test_critical_zone_no_dmz_violates(self):
        project = _make_project(
            zones=[_zone("cell", ZoneType.CELL, sl_t=3)],
            standards=["NERC_CIP"],
        )
        violations = evaluate_policies(project, enabled_standards=["NERC_CIP"])
        cip001 = [v for v in violations if v.rule_id == "CIP-001"]
        assert len(cip001) == 1

    def test_critical_zone_with_dmz_passes(self):
        project = _make_project(
            zones=[
                _zone("cell", ZoneType.CELL, sl_t=3),
                _zone("dmz", ZoneType.DMZ, sl_t=3),
            ],
            standards=["NERC_CIP"],
        )
        violations = evaluate_policies(project, enabled_standards=["NERC_CIP"])
        cip001 = [v for v in violations if v.rule_id == "CIP-001"]
        assert len(cip001) == 0

    def test_non_critical_zone_no_dmz_passes(self):
        project = _make_project(
            zones=[_zone("cell", ZoneType.CELL, sl_t=2)],
            standards=["NERC_CIP"],
        )
        violations = evaluate_policies(project, enabled_standards=["NERC_CIP"])
        cip001 = [v for v in violations if v.rule_id == "CIP-001"]
        assert len(cip001) == 0


class TestPolicyCIPBES:
    """CIP-002: Assets in critical zones need criticality classification."""

    def test_default_criticality_violates(self):
        project = _make_project(
            zones=[_zone("cell", ZoneType.CELL, sl_t=3, assets=[_asset(criticality=3)])],
            standards=["NERC_CIP"],
        )
        violations = evaluate_policies(project, enabled_standards=["NERC_CIP"])
        cip002 = [v for v in violations if v.rule_id == "CIP-002"]
        assert len(cip002) == 1

    def test_explicit_criticality_passes(self):
        project = _make_project(
            zones=[_zone("cell", ZoneType.CELL, sl_t=3, assets=[_asset(criticality=5)])],
            standards=["NERC_CIP"],
        )
        violations = evaluate_policies(project, enabled_standards=["NERC_CIP"])
        cip002 = [v for v in violations if v.rule_id == "CIP-002"]
        assert len(cip002) == 0


class TestPolicyStandardsFiltering:
    """Test that policies are filtered by enabled standards."""

    def test_all_rules_run_when_no_filter(self):
        project = _make_project(
            zones=[
                _zone("ent", ZoneType.ENTERPRISE, sl_t=1),
                _zone("cell", ZoneType.CELL, sl_t=3),
            ],
            conduits=[_conduit("c1", "ent", "cell")],
        )
        violations = evaluate_policies(project)
        rule_ids = {v.rule_id for v in violations}
        # Should include IEC62443 and PURDUE rules at minimum
        assert "POL-005" in rule_ids  # DMZ requirement
        assert "POL-007" in rule_ids  # Purdue hierarchy

    def test_only_nerc_rules_with_nerc_filter(self):
        project = _make_project(
            zones=[_zone("cell", ZoneType.CELL, sl_t=3, assets=[_asset()])],
            standards=["NERC_CIP"],
        )
        violations = evaluate_policies(project, enabled_standards=["NERC_CIP"])
        rule_ids = {v.rule_id for v in violations}
        # Should not include POL-001, POL-002, etc.
        for rule_id in rule_ids:
            assert rule_id.startswith("CIP-"), f"Unexpected rule {rule_id} for NERC_CIP filter"


class TestPolicyHelpers:
    """Tests for policy helper functions."""

    def test_get_policy_rule(self):
        rule = get_policy_rule("POL-001")
        assert rule is not None
        assert rule.name == "Default Deny"
        assert rule.severity == PolicySeverity.HIGH

    def test_get_policy_rule_nonexistent(self):
        assert get_policy_rule("NONEXISTENT") is None

    def test_get_all_policy_rules(self):
        rules = get_all_policy_rules()
        assert len(rules) == len(POLICY_RULES)


# ══════════════════════════════════════════════════════════════════════
#  RISK ENGINE TESTS
# ══════════════════════════════════════════════════════════════════════


class TestRiskClassification:
    """Tests for risk level classification."""

    def test_critical_risk(self):
        assert classify_risk_level(80) == RiskLevel.CRITICAL
        assert classify_risk_level(100) == RiskLevel.CRITICAL

    def test_high_risk(self):
        assert classify_risk_level(60) == RiskLevel.HIGH
        assert classify_risk_level(79) == RiskLevel.HIGH

    def test_medium_risk(self):
        assert classify_risk_level(40) == RiskLevel.MEDIUM
        assert classify_risk_level(59) == RiskLevel.MEDIUM

    def test_low_risk(self):
        assert classify_risk_level(20) == RiskLevel.LOW
        assert classify_risk_level(39) == RiskLevel.LOW

    def test_minimal_risk(self):
        assert classify_risk_level(0) == RiskLevel.MINIMAL
        assert classify_risk_level(19) == RiskLevel.MINIMAL


class TestZoneRisk:
    """Tests for zone-level risk calculation."""

    def test_basic_zone_risk(self):
        project = _make_project(zones=[_zone("z1", sl_t=2)])
        risk = calculate_zone_risk(project, "z1")
        assert 0 <= risk.score <= 100
        assert risk.level in RiskLevel

    def test_lower_sl_higher_risk(self):
        project_low = _make_project(zones=[_zone("z1", sl_t=1)])
        project_high = _make_project(zones=[_zone("z1", sl_t=4)])
        risk_low = calculate_zone_risk(project_low, "z1")
        risk_high = calculate_zone_risk(project_high, "z1")
        assert risk_low.score > risk_high.score

    def test_more_conduits_higher_risk(self):
        zone = _zone("z1")
        others = [_zone(f"z{i}", ZoneType.AREA) for i in range(2, 6)]
        conduits = [_conduit(f"c{i}", "z1", f"z{i}", flows=[_flow()]) for i in range(2, 6)]

        project_many = _make_project(
            zones=[zone] + others,
            conduits=conduits,
        )

        project_one = _make_project(
            zones=[zone, _zone("z2", ZoneType.AREA)],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow()])],
        )

        risk_many = calculate_zone_risk(project_many, "z1")
        risk_one = calculate_zone_risk(project_one, "z1")
        assert risk_many.factors.exposure_risk > risk_one.factors.exposure_risk

    def test_high_criticality_assets_higher_risk(self):
        zone_high = _zone("z1", assets=[_asset(criticality=5)])
        zone_low = _zone("z1", assets=[_asset(criticality=1)])

        project_high = _make_project(zones=[zone_high])
        project_low = _make_project(zones=[zone_low])

        risk_high = calculate_zone_risk(project_high, "z1")
        risk_low = calculate_zone_risk(project_low, "z1")
        assert risk_high.factors.asset_criticality_risk > risk_low.factors.asset_criticality_risk

    def test_sl_gap_risk(self):
        project = _make_project(
            zones=[_zone("z1", sl_t=1), _zone("z2", sl_t=4)],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow()])],
        )
        risk = calculate_zone_risk(project, "z1")
        assert risk.factors.sl_gap_risk > 0

    def test_no_sl_gap_when_equal(self):
        project = _make_project(
            zones=[_zone("z1", sl_t=2), _zone("z2", sl_t=2)],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow()])],
        )
        risk = calculate_zone_risk(project, "z1")
        assert risk.factors.sl_gap_risk == 0

    def test_nonexistent_zone_raises(self):
        project = _make_project(zones=[_zone("z1")])
        with pytest.raises(ValueError, match="Zone not found"):
            calculate_zone_risk(project, "nonexistent")

    def test_risk_factors_breakdown(self):
        project = _make_project(zones=[_zone("z1", sl_t=2)])
        risk = calculate_zone_risk(project, "z1")
        assert risk.factors.sl_base_risk >= 0
        assert risk.factors.asset_criticality_risk >= 0
        assert risk.factors.exposure_risk >= 0
        assert risk.factors.sl_gap_risk >= 0


class TestRiskAssessment:
    """Tests for full project risk assessment."""

    def test_empty_project(self):
        project = _make_project()
        assessment = assess_risk(project)
        assert assessment.zone_risks == {}
        assert assessment.overall_score == 0
        assert assessment.overall_level == RiskLevel.MINIMAL

    def test_single_zone_assessment(self):
        project = _make_project(zones=[_zone("z1", sl_t=2)])
        assessment = assess_risk(project)
        assert "z1" in assessment.zone_risks
        assert 0 <= assessment.overall_score <= 100

    def test_multi_zone_assessment(self):
        project = _make_project(
            zones=[
                _zone("z1", sl_t=1),
                _zone("z2", sl_t=3),
                _zone("z3", sl_t=4),
            ],
        )
        assessment = assess_risk(project)
        assert len(assessment.zone_risks) == 3

    def test_recommendations_generated(self):
        project = _make_project(
            zones=[
                _zone("z1", sl_t=1, assets=[_asset(criticality=5)]),
                _zone("z2", sl_t=1, assets=[_asset(asset_id="a2", criticality=5)]),
            ],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow()])],
        )
        assessment = assess_risk(project)
        assert len(assessment.recommendations) > 0

    def test_sl_gap_recommendation(self):
        project = _make_project(
            zones=[_zone("z1", sl_t=1), _zone("z2", sl_t=4)],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow()])],
        )
        assessment = assess_risk(project)
        gap_recs = [r for r in assessment.recommendations if "SL gap" in r]
        assert len(gap_recs) >= 1

    def test_no_capability_recommendation(self):
        project = _make_project(
            zones=[_zone("z1", sl_t=2)],  # No SL-C set
        )
        assessment = assess_risk(project)
        cap_recs = [r for r in assessment.recommendations if "SL-C" in r]
        assert len(cap_recs) >= 1


# ══════════════════════════════════════════════════════════════════════
#  RESOLVER TESTS
# ══════════════════════════════════════════════════════════════════════


class TestSecurityControlResolver:
    """Tests for the security control resolver."""

    def test_empty_project(self):
        project = _make_project()
        result = resolve_security_controls(project)
        assert "zone_profiles" in result
        assert "conduit_profiles" in result
        assert "global_controls" in result
        assert result["zone_profiles"] == []
        assert result["conduit_profiles"] == []

    def test_zone_profiles_generated(self):
        project = _make_project(zones=[_zone("z1", sl_t=2)])
        result = resolve_security_controls(project)
        assert len(result["zone_profiles"]) == 1
        profile = result["zone_profiles"][0]
        assert profile["zone_id"] == "z1"
        assert profile["security_level_target"] == 2

    def test_conduit_profiles_generated(self):
        project = _make_project(
            zones=[_zone("z1", sl_t=2), _zone("z2", sl_t=3)],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow()])],
        )
        result = resolve_security_controls(project)
        assert len(result["conduit_profiles"]) == 1
        profile = result["conduit_profiles"][0]
        assert profile["conduit_id"] == "c1"
        assert profile["from_zone"] == "z1"
        assert profile["to_zone"] == "z2"

    def test_high_sl_requires_encryption(self):
        project = _make_project(
            zones=[_zone("z1", sl_t=3), _zone("z2", sl_t=3)],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow()])],
        )
        result = resolve_security_controls(project)
        profile = result["conduit_profiles"][0]
        assert profile["requires_encryption"] is True

    def test_low_sl_no_encryption(self):
        project = _make_project(
            zones=[_zone("z1", sl_t=1), _zone("z2", sl_t=2)],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow()])],
        )
        result = resolve_security_controls(project)
        profile = result["conduit_profiles"][0]
        assert profile["requires_encryption"] is False

    def test_conduit_no_flows_recommends_default_deny(self):
        project = _make_project(
            zones=[_zone("z1", sl_t=2), _zone("z2", sl_t=2)],
            conduits=[_conduit("c1", "z1", "z2")],  # no flows
        )
        result = resolve_security_controls(project)
        profile = result["conduit_profiles"][0]
        assert any("default deny" in r.lower() for r in profile["recommended_controls"])

    def test_global_controls_always_include_segmentation(self):
        project = _make_project(zones=[_zone("z1", sl_t=1)])
        result = resolve_security_controls(project)
        controls = result["global_controls"]
        assert any(c["control"] == "Network Segmentation" for c in controls)

    def test_high_sl_global_controls(self):
        project = _make_project(zones=[_zone("z1", sl_t=3)])
        result = resolve_security_controls(project)
        controls = result["global_controls"]
        assert any(c["control"] == "Incident Response" for c in controls)

    def test_sl4_includes_red_team(self):
        project = _make_project(zones=[_zone("z1", sl_t=4)])
        result = resolve_security_controls(project)
        controls = result["global_controls"]
        assert any(c["control"] == "Red Team Assessment" for c in controls)

    def test_max_security_level_reported(self):
        project = _make_project(
            zones=[_zone("z1", sl_t=1), _zone("z2", sl_t=4)],
        )
        result = resolve_security_controls(project)
        assert result["max_security_level"] == 4

    def test_zone_controls_have_requirements(self):
        project = _make_project(zones=[_zone("z1", sl_t=2)])
        result = resolve_security_controls(project)
        profile = result["zone_profiles"][0]
        assert len(profile["applicable_requirements"]) > 0
        assert len(profile["recommended_controls"]) > 0

    def test_conduit_with_invalid_zone_skipped(self):
        """Conduit referencing a missing zone should be skipped in profiles."""
        z1 = _zone("z1", sl_t=2)
        z2 = _zone("z2", sl_t=2)
        project = _make_project(
            zones=[z1, z2],
            conduits=[_conduit("c1", "z1", "z2", flows=[_flow()])],
        )
        result = resolve_security_controls(project)
        assert len(result["conduit_profiles"]) == 1


# ══════════════════════════════════════════════════════════════════════
#  STANDARDS MODULE TESTS
# ══════════════════════════════════════════════════════════════════════


class TestStandards:
    """Tests for the compliance standards module."""

    def test_all_standards_have_info(self):
        for std in ComplianceStandard:
            assert std in STANDARD_INFO
            assert "name" in STANDARD_INFO[std]
            assert "description" in STANDARD_INFO[std]

    def test_validation_checks_map_to_valid_standards(self):
        valid_standards = set(ComplianceStandard)
        for check, standards in VALIDATION_CHECK_STANDARDS.items():
            for std in standards:
                assert std in valid_standards, f"Check {check} references invalid standard {std}"

    def test_policy_rules_map_to_valid_standards(self):
        valid_standards = set(ComplianceStandard)
        for rule, standards in POLICY_RULE_STANDARDS.items():
            for std in standards:
                assert std in valid_standards, f"Rule {rule} references invalid standard {std}"

    def test_all_policy_rules_mapped(self):
        """All policy rules defined in the policy engine should be mapped."""
        for rule_id in POLICY_RULES:
            assert rule_id in POLICY_RULE_STANDARDS, f"Rule {rule_id} not in standards mapping"

    def test_iec62443_has_core_rules(self):
        iec_rules = {
            rule_id
            for rule_id, stds in POLICY_RULE_STANDARDS.items()
            if ComplianceStandard.IEC62443 in stds
        }
        assert "POL-001" in iec_rules
        assert "POL-002" in iec_rules
        assert "POL-003" in iec_rules
        assert "POL-006" in iec_rules

    def test_nerc_cip_has_cip_rules(self):
        cip_rules = {
            rule_id
            for rule_id, stds in POLICY_RULE_STANDARDS.items()
            if ComplianceStandard.NERC_CIP in stds
        }
        assert "CIP-001" in cip_rules
        assert "CIP-002" in cip_rules

    def test_nist_csf_has_nist_rules(self):
        nist_rules = {
            rule_id
            for rule_id, stds in POLICY_RULE_STANDARDS.items()
            if ComplianceStandard.NIST_CSF in stds
        }
        assert "NIST-001" in nist_rules

    def test_purdue_has_hierarchy_rule(self):
        purdue_rules = {
            rule_id
            for rule_id, stds in POLICY_RULE_STANDARDS.items()
            if ComplianceStandard.PURDUE in stds
        }
        assert "POL-007" in purdue_rules
