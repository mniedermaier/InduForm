"""Tests for the single-file YAML mode API routes (routes.py).

These endpoints are used in local/CLI mode where projects are stored as YAML files.
They require app.state.config_path to be set.
"""

import os
import tempfile
from pathlib import Path

import pytest
import pytest_asyncio
import yaml
from httpx import AsyncClient, ASGITransport

# Disable rate limiting for tests
os.environ["INDUFORM_RATE_LIMIT_ENABLED"] = "false"

from induform.api.server import app


@pytest_asyncio.fixture
async def yaml_client(tmp_path: Path):
    """Create a test client with a temp YAML config file."""
    # Create a starter YAML project
    project_data = {
        "version": "1.0",
        "project": {
            "name": "Test Project",
            "description": "Test description",
            "compliance_standards": ["IEC62443"],
        },
        "zones": [
            {
                "id": "enterprise",
                "name": "Enterprise Network",
                "type": "enterprise",
                "security_level_target": 1,
                "assets": [],
            },
            {
                "id": "dmz",
                "name": "Site DMZ",
                "type": "dmz",
                "security_level_target": 3,
                "assets": [
                    {"id": "historian", "name": "Historian", "type": "historian"},
                ],
            },
            {
                "id": "cell_01",
                "name": "Assembly Cell",
                "type": "cell",
                "security_level_target": 2,
                "assets": [
                    {"id": "plc_01", "name": "Main PLC", "type": "plc", "criticality": 4},
                ],
            },
        ],
        "conduits": [
            {
                "id": "ent_to_dmz",
                "from_zone": "enterprise",
                "to_zone": "dmz",
                "requires_inspection": True,
                "flows": [
                    {"protocol": "https", "port": 443, "direction": "bidirectional"},
                ],
            },
            {
                "id": "dmz_to_cell",
                "from_zone": "dmz",
                "to_zone": "cell_01",
                "flows": [
                    {"protocol": "opcua", "port": 4840, "direction": "bidirectional"},
                ],
            },
        ],
    }

    config_file = tmp_path / "test_project.yaml"
    with config_file.open("w") as f:
        yaml.dump(project_data, f, default_flow_style=False, sort_keys=False)

    app.state.config_path = config_file

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


class TestRootEndpoint:
    """Tests for the root API endpoint."""

    @pytest.mark.asyncio
    async def test_root(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "InduForm API"
        assert "version" in data


class TestGetProject:
    """Tests for getting the current project."""

    @pytest.mark.asyncio
    async def test_get_project(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/project")
        assert response.status_code == 200
        data = response.json()
        assert "project" in data
        assert "validation" in data
        assert "policy_violations" in data
        assert "file_path" in data

    @pytest.mark.asyncio
    async def test_get_project_has_zones(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/project")
        data = response.json()
        project = data["project"]
        assert len(project["zones"]) == 3
        assert len(project["conduits"]) == 2


class TestValidateEndpoint:
    """Tests for the validate endpoint."""

    @pytest.mark.asyncio
    async def test_validate_project(self, yaml_client: AsyncClient):
        # First get the project
        resp = await yaml_client.get("/api/project")
        project = resp.json()["project"]

        response = await yaml_client.post("/api/validate", json=project)
        assert response.status_code == 200
        data = response.json()
        assert "results" in data
        assert "valid" in data

    @pytest.mark.asyncio
    async def test_validate_empty_project(self, yaml_client: AsyncClient):
        empty = {
            "version": "1.0",
            "project": {"name": "Empty", "compliance_standards": ["IEC62443"]},
            "zones": [],
            "conduits": [],
        }
        response = await yaml_client.post("/api/validate", json=empty)
        assert response.status_code == 200


class TestPoliciesEndpoint:
    """Tests for the policies endpoint."""

    @pytest.mark.asyncio
    async def test_check_policies(self, yaml_client: AsyncClient):
        resp = await yaml_client.get("/api/project")
        project = resp.json()["project"]

        response = await yaml_client.post("/api/policies", json=project)
        assert response.status_code == 200
        violations = response.json()
        assert isinstance(violations, list)

    @pytest.mark.asyncio
    async def test_policies_detect_violations(self, yaml_client: AsyncClient):
        """Project with enterprise-to-cell conduit (no DMZ) should have violations."""
        bad_project = {
            "version": "1.0",
            "project": {"name": "Bad", "compliance_standards": ["IEC62443"]},
            "zones": [
                {"id": "ent", "name": "Enterprise", "type": "enterprise", "security_level_target": 1, "assets": []},
                {"id": "cell", "name": "Cell", "type": "cell", "security_level_target": 2, "assets": []},
            ],
            "conduits": [
                {"id": "c1", "from_zone": "ent", "to_zone": "cell", "flows": []},
            ],
        }
        response = await yaml_client.post("/api/policies", json=bad_project)
        assert response.status_code == 200
        violations = response.json()
        rule_ids = {v["rule_id"] for v in violations}
        assert "POL-005" in rule_ids  # DMZ requirement


class TestResolveEndpoint:
    """Tests for the security controls resolve endpoint."""

    @pytest.mark.asyncio
    async def test_resolve_controls(self, yaml_client: AsyncClient):
        resp = await yaml_client.get("/api/project")
        project = resp.json()["project"]

        response = await yaml_client.post("/api/resolve", json=project)
        assert response.status_code == 200
        data = response.json()
        assert "zone_profiles" in data
        assert "conduit_profiles" in data
        assert "global_controls" in data
        assert len(data["zone_profiles"]) == 3
        assert len(data["conduit_profiles"]) == 2


class TestRiskEndpoint:
    """Tests for the risk assessment endpoint."""

    @pytest.mark.asyncio
    async def test_risk_assessment(self, yaml_client: AsyncClient):
        resp = await yaml_client.get("/api/project")
        project = resp.json()["project"]

        response = await yaml_client.post("/api/risk", json=project)
        assert response.status_code == 200
        data = response.json()
        assert "zone_risks" in data
        assert "overall_score" in data
        assert "overall_level" in data
        assert "recommendations" in data
        assert len(data["zone_risks"]) == 3


class TestGenerateEndpoint:
    """Tests for the generate endpoint."""

    @pytest.mark.asyncio
    async def test_generate_firewall(self, yaml_client: AsyncClient):
        resp = await yaml_client.get("/api/project")
        project = resp.json()["project"]

        response = await yaml_client.post(
            "/api/generate",
            json={
                **project,
                "generator": "firewall",
                "options": {},
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["generator"] == "firewall"
        assert data["content"] is not None

    @pytest.mark.asyncio
    async def test_generate_vlan(self, yaml_client: AsyncClient):
        resp = await yaml_client.get("/api/project")
        project = resp.json()["project"]

        response = await yaml_client.post(
            "/api/generate",
            json={
                **project,
                "generator": "vlan",
                "options": {},
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["generator"] == "vlan"

    @pytest.mark.asyncio
    async def test_generate_report(self, yaml_client: AsyncClient):
        resp = await yaml_client.get("/api/project")
        project = resp.json()["project"]

        response = await yaml_client.post(
            "/api/generate",
            json={
                **project,
                "generator": "report",
                "options": {},
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["generator"] == "report"
        assert isinstance(data["content"], str)

    @pytest.mark.asyncio
    async def test_generate_unknown_generator(self, yaml_client: AsyncClient):
        resp = await yaml_client.get("/api/project")
        project = resp.json()["project"]

        response = await yaml_client.post(
            "/api/generate",
            json={
                **project,
                "generator": "nonexistent",
                "options": {},
            },
        )
        assert response.status_code == 400


class TestZoneCRUD:
    """Tests for zone CRUD operations (YAML mode)."""

    @pytest.mark.asyncio
    async def test_list_zones(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/zones")
        assert response.status_code == 200
        zones = response.json()
        assert len(zones) == 3

    @pytest.mark.asyncio
    async def test_get_zone(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/zones/enterprise")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "enterprise"
        assert data["name"] == "Enterprise Network"

    @pytest.mark.asyncio
    async def test_get_zone_not_found(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/zones/nonexistent")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_zone(self, yaml_client: AsyncClient):
        response = await yaml_client.post(
            "/api/zones",
            json={
                "id": "new_zone",
                "name": "New Zone",
                "type": "area",
                "security_level_target": 2,
                "assets": [],
            },
        )
        assert response.status_code == 200
        assert response.json()["id"] == "new_zone"

        # Verify it was added
        resp = await yaml_client.get("/api/zones")
        assert len(resp.json()) == 4

    @pytest.mark.asyncio
    async def test_create_duplicate_zone(self, yaml_client: AsyncClient):
        response = await yaml_client.post(
            "/api/zones",
            json={
                "id": "enterprise",
                "name": "Duplicate",
                "type": "enterprise",
                "security_level_target": 1,
                "assets": [],
            },
        )
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_update_zone(self, yaml_client: AsyncClient):
        response = await yaml_client.put(
            "/api/zones/enterprise",
            json={
                "id": "enterprise",
                "name": "Updated Enterprise",
                "type": "enterprise",
                "security_level_target": 2,
                "assets": [],
            },
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Enterprise"

    @pytest.mark.asyncio
    async def test_update_zone_not_found(self, yaml_client: AsyncClient):
        response = await yaml_client.put(
            "/api/zones/nonexistent",
            json={
                "id": "nonexistent",
                "name": "Ghost",
                "type": "cell",
                "security_level_target": 2,
                "assets": [],
            },
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_zone(self, yaml_client: AsyncClient):
        # Add a standalone zone first
        await yaml_client.post(
            "/api/zones",
            json={
                "id": "deletable",
                "name": "Deletable",
                "type": "area",
                "security_level_target": 2,
                "assets": [],
            },
        )

        response = await yaml_client.delete("/api/zones/deletable")
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

    @pytest.mark.asyncio
    async def test_delete_zone_used_by_conduit(self, yaml_client: AsyncClient):
        """Cannot delete a zone that's referenced by a conduit."""
        response = await yaml_client.delete("/api/zones/enterprise")
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_delete_zone_not_found(self, yaml_client: AsyncClient):
        response = await yaml_client.delete("/api/zones/nonexistent")
        assert response.status_code == 404


class TestConduitCRUD:
    """Tests for conduit CRUD operations (YAML mode)."""

    @pytest.mark.asyncio
    async def test_list_conduits(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/conduits")
        assert response.status_code == 200
        conduits = response.json()
        assert len(conduits) == 2

    @pytest.mark.asyncio
    async def test_get_conduit(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/conduits/ent_to_dmz")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "ent_to_dmz"
        assert data["from_zone"] == "enterprise"

    @pytest.mark.asyncio
    async def test_get_conduit_not_found(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/conduits/nonexistent")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_create_conduit(self, yaml_client: AsyncClient):
        response = await yaml_client.post(
            "/api/conduits",
            json={
                "id": "new_conduit",
                "from_zone": "enterprise",
                "to_zone": "cell_01",
                "flows": [{"protocol": "ssh", "port": 22}],
            },
        )
        assert response.status_code == 200
        assert response.json()["id"] == "new_conduit"

    @pytest.mark.asyncio
    async def test_create_duplicate_conduit(self, yaml_client: AsyncClient):
        response = await yaml_client.post(
            "/api/conduits",
            json={
                "id": "ent_to_dmz",
                "from_zone": "enterprise",
                "to_zone": "dmz",
                "flows": [],
            },
        )
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_create_conduit_bad_zone_ref(self, yaml_client: AsyncClient):
        response = await yaml_client.post(
            "/api/conduits",
            json={
                "id": "bad_ref",
                "from_zone": "nonexistent",
                "to_zone": "dmz",
                "flows": [],
            },
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_update_conduit(self, yaml_client: AsyncClient):
        response = await yaml_client.put(
            "/api/conduits/ent_to_dmz",
            json={
                "id": "ent_to_dmz",
                "from_zone": "enterprise",
                "to_zone": "dmz",
                "requires_inspection": False,
                "flows": [{"protocol": "https", "port": 443}],
            },
        )
        assert response.status_code == 200
        assert response.json()["requires_inspection"] is False

    @pytest.mark.asyncio
    async def test_update_conduit_not_found(self, yaml_client: AsyncClient):
        response = await yaml_client.put(
            "/api/conduits/nonexistent",
            json={
                "id": "nonexistent",
                "from_zone": "enterprise",
                "to_zone": "dmz",
                "flows": [],
            },
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_conduit(self, yaml_client: AsyncClient):
        response = await yaml_client.delete("/api/conduits/dmz_to_cell")
        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

    @pytest.mark.asyncio
    async def test_delete_conduit_not_found(self, yaml_client: AsyncClient):
        response = await yaml_client.delete("/api/conduits/nonexistent")
        assert response.status_code == 404


class TestSchemaEndpoint:
    """Tests for the JSON Schema endpoint."""

    @pytest.mark.asyncio
    async def test_get_schema_project(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/schema/project")
        assert response.status_code == 200
        schema = response.json()
        assert "properties" in schema

    @pytest.mark.asyncio
    async def test_get_schema_zone(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/schema/zone")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_schema_conduit(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/schema/conduit")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_schema_asset(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/schema/asset")
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_get_schema_unknown(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/schema/unknown")
        assert response.status_code == 400


class TestFileManagement:
    """Tests for file management endpoints (YAML mode)."""

    @pytest.mark.asyncio
    async def test_get_current_file(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/files/current")
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "path" in data

    @pytest.mark.asyncio
    async def test_list_files(self, yaml_client: AsyncClient):
        response = await yaml_client.get("/api/files")
        assert response.status_code == 200
        files = response.json()
        assert isinstance(files, list)
        assert len(files) >= 1

    @pytest.mark.asyncio
    async def test_create_new_file(self, yaml_client: AsyncClient):
        response = await yaml_client.post(
            "/api/files/new",
            json={"filename": "new_project.yaml"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "project" in data

    @pytest.mark.asyncio
    async def test_create_duplicate_file(self, yaml_client: AsyncClient):
        # Create it once
        await yaml_client.post("/api/files/new", json={"filename": "dup.yaml"})

        # Create again — should conflict
        response = await yaml_client.post(
            "/api/files/new",
            json={"filename": "dup.yaml"},
        )
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_save_project(self, yaml_client: AsyncClient):
        # Get current project
        resp = await yaml_client.get("/api/project")
        project = resp.json()["project"]

        # Save it
        response = await yaml_client.post("/api/project", json=project)
        assert response.status_code == 200
        assert response.json()["status"] == "saved"
