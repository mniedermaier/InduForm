"""Tests for domain models."""

import pytest
from pydantic import ValidationError

from induform.models.asset import Asset, AssetType
from induform.models.conduit import Conduit, ConduitDirection, ProtocolFlow
from induform.models.zone import Zone, ZoneType
from induform.models.project import Project, ProjectMetadata


class TestAsset:
    """Tests for the Asset model."""

    def test_create_asset(self):
        """Test creating a basic asset."""
        asset = Asset(
            id="plc_01",
            name="Main PLC",
            type=AssetType.PLC,
            ip_address="10.0.0.1",
        )
        assert asset.id == "plc_01"
        assert asset.name == "Main PLC"
        assert asset.type == AssetType.PLC
        assert asset.ip_address == "10.0.0.1"
        assert asset.criticality == 3  # default

    def test_asset_criticality_range(self):
        """Test that criticality must be 1-5."""
        with pytest.raises(ValidationError):
            Asset(id="test", name="Test", type=AssetType.PLC, criticality=0)

        with pytest.raises(ValidationError):
            Asset(id="test", name="Test", type=AssetType.PLC, criticality=6)

    def test_asset_all_types(self):
        """Test all asset types are valid."""
        for asset_type in AssetType:
            asset = Asset(id="test", name="Test", type=asset_type)
            assert asset.type == asset_type


class TestZone:
    """Tests for the Zone model."""

    def test_create_zone(self):
        """Test creating a basic zone."""
        zone = Zone(
            id="cell_01",
            name="Cell 01",
            type=ZoneType.CELL,
            security_level_target=2,
        )
        assert zone.id == "cell_01"
        assert zone.name == "Cell 01"
        assert zone.type == ZoneType.CELL
        assert zone.security_level_target == 2
        assert zone.assets == []

    def test_zone_with_assets(self):
        """Test creating a zone with assets."""
        zone = Zone(
            id="cell_01",
            name="Cell 01",
            type=ZoneType.CELL,
            security_level_target=2,
            assets=[
                Asset(id="plc_01", name="PLC", type=AssetType.PLC),
                Asset(id="hmi_01", name="HMI", type=AssetType.HMI),
            ],
        )
        assert len(zone.assets) == 2

    def test_zone_security_level_range(self):
        """Test that security level must be 1-4."""
        with pytest.raises(ValidationError):
            Zone(id="test", name="Test", type=ZoneType.CELL, security_level_target=0)

        with pytest.raises(ValidationError):
            Zone(id="test", name="Test", type=ZoneType.CELL, security_level_target=5)

    def test_zone_sl_capability_validation(self):
        """Test that SL-C must meet or exceed SL-T."""
        # Valid: SL-C >= SL-T
        zone = Zone(
            id="test",
            name="Test",
            type=ZoneType.CELL,
            security_level_target=2,
            security_level_capability=3,
        )
        assert zone.security_level_capability == 3

        # Invalid: SL-C < SL-T
        with pytest.raises(ValidationError):
            Zone(
                id="test",
                name="Test",
                type=ZoneType.CELL,
                security_level_target=3,
                security_level_capability=2,
            )


class TestConduit:
    """Tests for the Conduit model."""

    def test_create_conduit(self):
        """Test creating a basic conduit."""
        conduit = Conduit(
            id="cell_to_dmz",
            from_zone="cell_01",
            to_zone="dmz",
            flows=[
                ProtocolFlow(protocol="opcua", port=4840),
            ],
        )
        assert conduit.id == "cell_to_dmz"
        assert conduit.from_zone == "cell_01"
        assert conduit.to_zone == "dmz"
        assert len(conduit.flows) == 1

    def test_conduit_zones_must_differ(self):
        """Test that from_zone and to_zone must be different."""
        with pytest.raises(ValidationError):
            Conduit(
                id="test",
                from_zone="zone_01",
                to_zone="zone_01",
            )

    def test_protocol_flow_direction(self):
        """Test protocol flow directions."""
        flow_out = ProtocolFlow(
            protocol="https",
            port=443,
            direction=ConduitDirection.OUTBOUND,
        )
        assert flow_out.direction == ConduitDirection.OUTBOUND

        flow_bidi = ProtocolFlow(protocol="modbus_tcp", port=502)
        assert flow_bidi.direction == ConduitDirection.BIDIRECTIONAL  # default

    def test_protocol_flow_port_range(self):
        """Test that port must be valid range."""
        with pytest.raises(ValidationError):
            ProtocolFlow(protocol="test", port=0)

        with pytest.raises(ValidationError):
            ProtocolFlow(protocol="test", port=65536)


class TestProject:
    """Tests for the Project model."""

    def test_create_project(self):
        """Test creating a basic project."""
        project = Project(
            version="1.0",
            project=ProjectMetadata(name="Test Project"),
            zones=[
                Zone(id="zone_01", name="Zone 1", type=ZoneType.CELL, security_level_target=2),
                Zone(id="zone_02", name="Zone 2", type=ZoneType.DMZ, security_level_target=3),
            ],
            conduits=[
                Conduit(id="c1", from_zone="zone_01", to_zone="zone_02"),
            ],
        )
        assert project.project.name == "Test Project"
        assert len(project.zones) == 2
        assert len(project.conduits) == 1

    def test_project_get_zone(self):
        """Test getting a zone by ID."""
        project = Project(
            version="1.0",
            project=ProjectMetadata(name="Test"),
            zones=[
                Zone(id="zone_01", name="Zone 1", type=ZoneType.CELL, security_level_target=2),
            ],
        )
        zone = project.get_zone("zone_01")
        assert zone is not None
        assert zone.id == "zone_01"

        assert project.get_zone("nonexistent") is None

    def test_project_invalid_conduit_reference(self):
        """Test that conduits must reference valid zones."""
        with pytest.raises(ValidationError):
            Project(
                version="1.0",
                project=ProjectMetadata(name="Test"),
                zones=[
                    Zone(id="zone_01", name="Zone 1", type=ZoneType.CELL, security_level_target=2),
                ],
                conduits=[
                    Conduit(id="c1", from_zone="zone_01", to_zone="nonexistent"),
                ],
            )

    def test_project_invalid_parent_zone(self):
        """Test that parent_zone must reference valid zones."""
        with pytest.raises(ValidationError):
            Project(
                version="1.0",
                project=ProjectMetadata(name="Test"),
                zones=[
                    Zone(
                        id="zone_01",
                        name="Zone 1",
                        type=ZoneType.CELL,
                        security_level_target=2,
                        parent_zone="nonexistent",
                    ),
                ],
            )

    def test_project_get_conduits_for_zone(self):
        """Test getting conduits connected to a zone."""
        project = Project(
            version="1.0",
            project=ProjectMetadata(name="Test"),
            zones=[
                Zone(id="zone_01", name="Z1", type=ZoneType.CELL, security_level_target=2),
                Zone(id="zone_02", name="Z2", type=ZoneType.DMZ, security_level_target=3),
                Zone(id="zone_03", name="Z3", type=ZoneType.ENTERPRISE, security_level_target=1),
            ],
            conduits=[
                Conduit(id="c1", from_zone="zone_01", to_zone="zone_02"),
                Conduit(id="c2", from_zone="zone_02", to_zone="zone_03"),
            ],
        )

        # zone_02 should have 2 conduits
        conduits = project.get_conduits_for_zone("zone_02")
        assert len(conduits) == 2

        # zone_01 should have 1 conduit
        conduits = project.get_conduits_for_zone("zone_01")
        assert len(conduits) == 1
