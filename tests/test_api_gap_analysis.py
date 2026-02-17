"""Tests for gap analysis, analytics, and attack path API endpoints."""

import os

os.environ["INDUFORM_RATE_LIMIT_ENABLED"] = "false"

import pytest
from httpx import AsyncClient


# Project with zones, assets, and conduits for meaningful gap analysis
SAMPLE_PROJECT = {
    "version": "1.0",
    "project": {
        "name": "Gap Analysis Test Project",
        "compliance_standards": ["IEC62443"],
    },
    "zones": [
        {
            "id": "zone-enterprise",
            "name": "Enterprise Network",
            "type": "enterprise",
            "security_level_target": 1,
            "assets": [
                {
                    "id": "asset-erp",
                    "name": "ERP Server",
                    "type": "server",
                    "criticality": 2,
                },
            ],
        },
        {
            "id": "zone-dmz",
            "name": "DMZ",
            "type": "dmz",
            "security_level_target": 2,
            "assets": [],
        },
        {
            "id": "zone-control",
            "name": "Control Network",
            "type": "cell",
            "security_level_target": 3,
            "assets": [
                {
                    "id": "asset-plc",
                    "name": "PLC Controller",
                    "type": "plc",
                    "criticality": 4,
                },
            ],
        },
    ],
    "conduits": [
        {
            "id": "conduit-1",
            "from_zone": "zone-enterprise",
            "to_zone": "zone-dmz",
            "requires_inspection": True,
            "flows": [
                {"protocol": "https", "port": 443},
            ],
        },
        {
            "id": "conduit-2",
            "from_zone": "zone-dmz",
            "to_zone": "zone-control",
            "requires_inspection": False,
            "flows": [
                {"protocol": "modbus_tcp", "port": 502},
            ],
        },
    ],
}


async def create_test_project(
    client: AsyncClient, auth_headers: dict, project_data: dict | None = None
) -> str:
    """Create a project with optional data, return the project ID."""
    create_resp = await client.post(
        "/api/projects/",
        headers=auth_headers,
        json={"name": "Gap Analysis Test"},
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["id"]

    if project_data is not None:
        save_resp = await client.put(
            f"/api/projects/{project_id}",
            headers=auth_headers,
            json=project_data,
        )
        assert save_resp.status_code == 200

    return project_id


class TestGapAnalysis:
    """Tests for the gap analysis endpoint."""

    @pytest.mark.asyncio
    async def test_gap_analysis(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET /api/projects/{id}/gap-analysis returns a valid report."""
        project_id = await create_test_project(
            client, auth_headers, SAMPLE_PROJECT
        )

        resp = await client.get(
            f"/api/projects/{project_id}/gap-analysis",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert "project_name" in data
        assert "analysis_date" in data
        assert "overall_compliance" in data
        assert "zones" in data
        assert "summary" in data
        assert "priority_remediations" in data
        assert isinstance(data["overall_compliance"], (int, float))
        assert isinstance(data["zones"], list)
        # Should have analysis for each zone
        assert len(data["zones"]) == 3

    @pytest.mark.asyncio
    async def test_gap_analysis_empty_project(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Gap analysis on a project with no zones returns valid empty report."""
        empty_project = {
            "version": "1.0",
            "project": {
                "name": "Empty Project",
                "compliance_standards": ["IEC62443"],
            },
            "zones": [],
            "conduits": [],
        }
        project_id = await create_test_project(
            client, auth_headers, empty_project
        )

        resp = await client.get(
            f"/api/projects/{project_id}/gap-analysis",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["zones"] == []

    @pytest.mark.asyncio
    async def test_gap_analysis_requires_auth(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET gap-analysis without auth returns 401."""
        project_id = await create_test_project(
            client, auth_headers, SAMPLE_PROJECT
        )

        resp = await client.get(
            f"/api/projects/{project_id}/gap-analysis",
        )

        assert resp.status_code == 401


class TestAnalytics:
    """Tests for analytics endpoints."""

    @pytest.mark.asyncio
    async def test_analytics_empty(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET /api/projects/{id}/analytics returns empty list for new project."""
        project_id = await create_test_project(client, auth_headers)

        resp = await client.get(
            f"/api/projects/{project_id}/analytics",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 0

    @pytest.mark.asyncio
    async def test_analytics_summary(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET /api/projects/{id}/analytics/summary returns valid summary."""
        project_id = await create_test_project(client, auth_headers)

        resp = await client.get(
            f"/api/projects/{project_id}/analytics/summary",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        # When there are no snapshots, should return empty summary
        assert data["snapshot_count"] == 0
        assert data["current"] is None
        assert data["compliance_trend"] is None
        assert data["risk_trend"] is None

    @pytest.mark.asyncio
    async def test_analytics_requires_auth(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Analytics endpoints without auth return 401."""
        project_id = await create_test_project(client, auth_headers)

        resp = await client.get(
            f"/api/projects/{project_id}/analytics",
        )
        assert resp.status_code == 401

        resp = await client.get(
            f"/api/projects/{project_id}/analytics/summary",
        )
        assert resp.status_code == 401


class TestAttackPaths:
    """Tests for the attack path analysis endpoint."""

    @pytest.mark.asyncio
    async def test_attack_paths(
        self, client: AsyncClient, auth_headers: dict
    ):
        """POST /api/projects/{id}/attack-paths returns analysis."""
        project_id = await create_test_project(
            client, auth_headers, SAMPLE_PROJECT
        )

        resp = await client.post(
            f"/api/projects/{project_id}/attack-paths",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert "paths" in data
        assert "entry_points" in data
        assert "high_value_targets" in data
        assert "summary" in data
        assert "counts" in data
        assert isinstance(data["paths"], list)
        assert isinstance(data["entry_points"], list)
        # Our sample project has enterprise and DMZ as entry points
        assert len(data["entry_points"]) > 0

    @pytest.mark.asyncio
    async def test_attack_paths_empty_project(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Attack path analysis on empty project returns empty results."""
        empty_project = {
            "version": "1.0",
            "project": {
                "name": "Empty Project",
                "compliance_standards": [],
            },
            "zones": [],
            "conduits": [],
        }
        project_id = await create_test_project(
            client, auth_headers, empty_project
        )

        resp = await client.post(
            f"/api/projects/{project_id}/attack-paths",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["paths"] == []
        assert data["entry_points"] == []
        assert data["high_value_targets"] == []

    @pytest.mark.asyncio
    async def test_attack_paths_requires_auth(
        self, client: AsyncClient, auth_headers: dict
    ):
        """POST attack-paths without auth returns 401."""
        project_id = await create_test_project(
            client, auth_headers, SAMPLE_PROJECT
        )

        resp = await client.post(
            f"/api/projects/{project_id}/attack-paths",
        )

        assert resp.status_code == 401
