"""Tests for output generators."""

import pytest

from induform.models.asset import Asset, AssetType
from induform.models.conduit import Conduit, ConduitDirection, ProtocolFlow
from induform.models.zone import Zone, ZoneType
from induform.models.project import Project, ProjectMetadata
from induform.generators.firewall import (
    generate_firewall_rules,
    FirewallAction,
    export_rules_iptables,
)
from induform.generators.vlan import generate_vlan_mapping, export_vlan_csv
from induform.generators.compliance import generate_compliance_report


def make_project() -> Project:
    """Create a test project."""
    return Project(
        version="1.0",
        project=ProjectMetadata(name="Test Manufacturing"),
        zones=[
            Zone(
                id="dmz",
                name="Site DMZ",
                type=ZoneType.DMZ,
                security_level_target=3,
                assets=[
                    Asset(id="historian", name="Historian", type=AssetType.HISTORIAN, ip_address="10.1.1.10"),
                ],
            ),
            Zone(
                id="cell_01",
                name="Cell 01",
                type=ZoneType.CELL,
                security_level_target=2,
                assets=[
                    Asset(id="plc_01", name="PLC", type=AssetType.PLC, ip_address="10.10.1.10"),
                    Asset(id="hmi_01", name="HMI", type=AssetType.HMI, ip_address="10.10.1.20"),
                ],
            ),
        ],
        conduits=[
            Conduit(
                id="cell_to_dmz",
                from_zone="cell_01",
                to_zone="dmz",
                flows=[
                    ProtocolFlow(protocol="opcua", port=4840, direction=ConduitDirection.OUTBOUND),
                    ProtocolFlow(protocol="https", port=443, direction=ConduitDirection.BIDIRECTIONAL),
                ],
            ),
        ],
    )


class TestFirewallGenerator:
    """Tests for firewall rule generation."""

    def test_generate_allow_rules(self):
        """Test that allow rules are generated for conduit flows."""
        project = make_project()
        ruleset = generate_firewall_rules(project, include_deny_rules=False)

        # Should have 3 rules: 1 outbound opcua, 2 bidirectional https
        allow_rules = [r for r in ruleset.rules if r.action == FirewallAction.ALLOW]
        assert len(allow_rules) == 3

        # Check opcua rule
        opcua_rules = [r for r in allow_rules if r.protocol == "opcua"]
        assert len(opcua_rules) == 1
        assert opcua_rules[0].port == 4840

    def test_generate_deny_rules(self):
        """Test that deny rules are generated."""
        project = make_project()
        ruleset = generate_firewall_rules(project, include_deny_rules=True)

        deny_rules = [r for r in ruleset.rules if r.action == FirewallAction.DENY]
        # Should have deny rules for all zone pairs (2 zones = 2 deny rules)
        assert len(deny_rules) == 2

    def test_default_deny_action(self):
        """Test that default action is deny."""
        project = make_project()
        ruleset = generate_firewall_rules(project)

        assert ruleset.default_action == FirewallAction.DENY

    def test_rule_order(self):
        """Test that rules are properly ordered (allow before deny)."""
        project = make_project()
        ruleset = generate_firewall_rules(project)

        # Find first deny rule order
        deny_rules = [r for r in ruleset.rules if r.action == FirewallAction.DENY]
        allow_rules = [r for r in ruleset.rules if r.action == FirewallAction.ALLOW]

        if deny_rules and allow_rules:
            max_allow_order = max(r.order for r in allow_rules)
            min_deny_order = min(r.order for r in deny_rules)
            assert max_allow_order < min_deny_order

    def test_export_iptables(self):
        """Test iptables export format."""
        project = make_project()
        ruleset = generate_firewall_rules(project, include_deny_rules=False)
        iptables = export_rules_iptables(ruleset)

        assert "*filter" in iptables
        assert "COMMIT" in iptables
        assert "-A FORWARD" in iptables


class TestVLANGenerator:
    """Tests for VLAN mapping generation."""

    def test_generate_vlan_mapping(self):
        """Test basic VLAN mapping generation."""
        project = make_project()
        mapping = generate_vlan_mapping(project)

        assert len(mapping.assignments) == 2
        assert mapping.project_name == "Test Manufacturing"

    def test_vlan_ranges_by_type(self):
        """Test that VLANs are assigned by zone type ranges."""
        project = make_project()
        mapping = generate_vlan_mapping(project)

        # DMZ should be in 300-399 range
        dmz_assignment = next(a for a in mapping.assignments if a.zone_id == "dmz")
        assert 300 <= dmz_assignment.vlan_id <= 399

        # Cell should be in 500-699 range
        cell_assignment = next(a for a in mapping.assignments if a.zone_id == "cell_01")
        assert 500 <= cell_assignment.vlan_id <= 699

    def test_sequential_vlan_assignment(self):
        """Test sequential VLAN assignment from start."""
        project = make_project()
        mapping = generate_vlan_mapping(project, start_vlan=100)

        vlans = [a.vlan_id for a in mapping.assignments]
        assert vlans == [100, 101]

    def test_export_csv(self):
        """Test CSV export format."""
        project = make_project()
        mapping = generate_vlan_mapping(project)
        csv = export_vlan_csv(mapping)

        lines = csv.split("\n")
        assert "vlan_id" in lines[0]  # Header
        assert len(lines) == 3  # Header + 2 zones


class TestComplianceReportGenerator:
    """Tests for compliance report generation."""

    def test_generate_report(self):
        """Test basic report generation."""
        project = make_project()
        report = generate_compliance_report(project)

        assert "# IEC 62443 Compliance Report" in report
        assert "Test Manufacturing" in report

    def test_report_includes_zones(self):
        """Test that report includes zone overview."""
        project = make_project()
        report = generate_compliance_report(project)

        assert "## Zone Overview" in report
        assert "cell_01" in report
        assert "dmz" in report

    def test_report_includes_conduits(self):
        """Test that report includes conduit overview."""
        project = make_project()
        report = generate_compliance_report(project)

        assert "## Conduit Overview" in report
        assert "cell_to_dmz" in report

    def test_report_includes_validation(self):
        """Test that report includes validation results."""
        project = make_project()
        report = generate_compliance_report(project)

        assert "## Validation Results" in report

    def test_report_includes_requirements(self):
        """Test that report includes security requirements."""
        project = make_project()
        report = generate_compliance_report(project, include_requirements=True)

        assert "## IEC 62443-3-3 Requirements" in report
        assert "SR" in report  # Should have SR references

    def test_report_includes_controls(self):
        """Test that report includes security controls."""
        project = make_project()
        report = generate_compliance_report(project, include_controls=True)

        assert "## Recommended Security Controls" in report

    def test_report_executive_summary(self):
        """Test that report includes executive summary."""
        project = make_project()
        report = generate_compliance_report(project)

        assert "## Executive Summary" in report
        assert "Zones" in report
        assert "Conduits" in report
