"""Tests for the validation engine."""

import pytest

from induform.models.asset import Asset, AssetType
from induform.models.conduit import Conduit, ProtocolFlow
from induform.models.zone import Zone, ZoneType
from induform.models.project import Project, ProjectMetadata
from induform.engine.validator import (
    validate_project,
    ValidationSeverity,
)


def make_project(zones: list[Zone], conduits: list[Conduit]) -> Project:
    """Helper to create a project for testing."""
    return Project(
        version="1.0",
        project=ProjectMetadata(name="Test Project"),
        zones=zones,
        conduits=conduits,
    )


class TestValidation:
    """Tests for project validation."""

    def test_valid_project(self):
        """Test that a valid project passes validation."""
        project = make_project(
            zones=[
                Zone(id="dmz", name="DMZ", type=ZoneType.DMZ, security_level_target=3),
                Zone(id="cell", name="Cell", type=ZoneType.CELL, security_level_target=2),
            ],
            conduits=[
                Conduit(
                    id="c1",
                    from_zone="cell",
                    to_zone="dmz",
                    flows=[ProtocolFlow(protocol="opcua", port=4840)],
                ),
            ],
        )

        report = validate_project(project)
        assert report.error_count == 0

    def test_conduit_sl_insufficient(self):
        """Test that conduit SL validation catches insufficient levels."""
        project = make_project(
            zones=[
                Zone(id="z1", name="Z1", type=ZoneType.CELL, security_level_target=3),
                Zone(id="z2", name="Z2", type=ZoneType.DMZ, security_level_target=2),
            ],
            conduits=[
                Conduit(
                    id="c1",
                    from_zone="z1",
                    to_zone="z2",
                    security_level_required=1,  # Too low - should be at least 3
                ),
            ],
        )

        report = validate_project(project)
        errors = [r for r in report.results if r.severity == ValidationSeverity.ERROR]
        assert any("CONDUIT_SL_INSUFFICIENT" in r.code for r in errors)

    def test_sl_boundary_inspection_warning(self):
        """Test warning when SL difference >= 2 without inspection."""
        project = make_project(
            zones=[
                Zone(id="z1", name="Z1", type=ZoneType.CELL, security_level_target=4),
                Zone(id="z2", name="Z2", type=ZoneType.ENTERPRISE, security_level_target=1),
            ],
            conduits=[
                Conduit(id="c1", from_zone="z1", to_zone="z2"),
            ],
        )

        report = validate_project(project)
        warnings = [r for r in report.results if r.severity == ValidationSeverity.WARNING]
        assert any("CONDUIT_INSPECTION_RECOMMENDED" in r.code for r in warnings)

    def test_dmz_bypass_error(self):
        """Test error when enterprise connects directly to cell with DMZ present."""
        project = make_project(
            zones=[
                Zone(id="enterprise", name="Enterprise", type=ZoneType.ENTERPRISE, security_level_target=1),
                Zone(id="dmz", name="DMZ", type=ZoneType.DMZ, security_level_target=3),
                Zone(id="cell", name="Cell", type=ZoneType.CELL, security_level_target=2),
            ],
            conduits=[
                # Direct enterprise to cell - should error
                Conduit(id="c1", from_zone="enterprise", to_zone="cell"),
            ],
        )

        report = validate_project(project)
        errors = [r for r in report.results if r.severity == ValidationSeverity.ERROR]
        assert any("DMZ_BYPASS" in r.code for r in errors)

    def test_cell_isolation_warning(self):
        """Test warning for direct cell-to-cell communication."""
        project = make_project(
            zones=[
                Zone(id="cell_01", name="Cell 1", type=ZoneType.CELL, security_level_target=2),
                Zone(id="cell_02", name="Cell 2", type=ZoneType.CELL, security_level_target=2),
            ],
            conduits=[
                Conduit(id="c1", from_zone="cell_01", to_zone="cell_02"),
            ],
        )

        report = validate_project(project)
        warnings = [r for r in report.results if r.severity == ValidationSeverity.WARNING]
        assert any("CELL_ISOLATION_VIOLATION" in r.code for r in warnings)

    def test_protocol_not_in_allowlist(self):
        """Test info message for non-standard protocols."""
        project = make_project(
            zones=[
                Zone(id="z1", name="Z1", type=ZoneType.CELL, security_level_target=2),
                Zone(id="z2", name="Z2", type=ZoneType.AREA, security_level_target=2),
            ],
            conduits=[
                Conduit(
                    id="c1",
                    from_zone="z1",
                    to_zone="z2",
                    flows=[ProtocolFlow(protocol="custom_protocol", port=9999)],
                ),
            ],
        )

        report = validate_project(project)
        infos = [r for r in report.results if r.severity == ValidationSeverity.INFO]
        assert any("PROTOCOL_NOT_IN_ALLOWLIST" in r.code for r in infos)

    def test_critical_asset_low_sl_warning(self):
        """Test warning for critical assets in low SL zones."""
        project = make_project(
            zones=[
                Zone(
                    id="cell",
                    name="Cell",
                    type=ZoneType.CELL,
                    security_level_target=1,  # Low SL
                    assets=[
                        Asset(id="plc", name="PLC", type=AssetType.PLC),  # Critical asset
                    ],
                ),
            ],
            conduits=[],
        )

        report = validate_project(project)
        warnings = [r for r in report.results if r.severity == ValidationSeverity.WARNING]
        assert any("CRITICAL_ASSET_LOW_SL" in r.code for r in warnings)

    def test_strict_mode(self):
        """Test that strict mode treats warnings as errors."""
        project = make_project(
            zones=[
                Zone(id="cell_01", name="Cell 1", type=ZoneType.CELL, security_level_target=2),
                Zone(id="cell_02", name="Cell 2", type=ZoneType.CELL, security_level_target=2),
            ],
            conduits=[
                Conduit(id="c1", from_zone="cell_01", to_zone="cell_02"),  # Will generate warning
            ],
        )

        # Normal mode: valid despite warnings
        report = validate_project(project, strict=False)
        assert report.valid is True

        # Strict mode: invalid due to warnings
        report = validate_project(project, strict=True)
        assert report.valid is False


class TestCircularReference:
    """Tests for circular reference detection."""

    def test_circular_parent_reference(self):
        """Test detection of circular parent zone references."""
        # Note: This creates a circular reference z1 -> z2 -> z1
        # The model validator catches invalid references first,
        # so we need to construct the project carefully
        zones = [
            Zone(id="z1", name="Z1", type=ZoneType.AREA, security_level_target=2, parent_zone="z2"),
            Zone(id="z2", name="Z2", type=ZoneType.AREA, security_level_target=2, parent_zone="z1"),
        ]

        project = make_project(zones=zones, conduits=[])
        report = validate_project(project)

        errors = [r for r in report.results if r.severity == ValidationSeverity.ERROR]
        assert any("ZONE_CIRCULAR_REF" in r.code for r in errors)
