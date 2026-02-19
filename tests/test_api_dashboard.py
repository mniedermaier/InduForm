"""Tests for dashboard rollup API endpoint."""

import os

os.environ["INDUFORM_RATE_LIMIT_ENABLED"] = "false"

from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from induform.db.models import MetricsSnapshot, ProjectDB


async def create_project(
    client: AsyncClient,
    auth_headers: dict,
    name: str = "Test Project",
    description: str = "A test project",
) -> dict:
    """Helper: create a project and return its JSON."""
    resp = await client.post(
        "/api/projects/",
        json={"name": name, "description": description},
        headers=auth_headers,
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


class TestDashboardRollup:
    """Tests for GET /api/dashboard/rollup."""

    @pytest.mark.asyncio
    async def test_rollup_empty(self, client: AsyncClient, auth_headers: dict):
        """Rollup with no projects returns zeros."""
        resp = await client.get("/api/dashboard/rollup", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_projects"] == 0
        assert data["total_zones"] == 0
        assert data["total_assets"] == 0
        assert data["total_conduits"] == 0
        assert data["avg_compliance"] is None
        assert data["avg_risk"] is None
        assert data["projects"] == []
        assert data["trends"] == []

    @pytest.mark.asyncio
    async def test_rollup_with_project(
        self, client: AsyncClient, auth_headers: dict, test_session: AsyncSession
    ):
        """Rollup with a project returns correct aggregates."""
        project = await create_project(client, auth_headers, name="Dashboard Test")
        project_id = project["id"]

        # Insert a metrics snapshot
        snap = MetricsSnapshot(
            project_id=project_id,
            zone_count=3,
            asset_count=10,
            conduit_count=5,
            compliance_score=85.0,
            risk_score=35.0,
            error_count=1,
            warning_count=2,
            recorded_at=datetime.utcnow(),
        )
        test_session.add(snap)
        await test_session.commit()

        resp = await client.get("/api/dashboard/rollup", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()

        assert data["total_projects"] == 1
        assert data["avg_compliance"] == 85.0
        assert data["avg_risk"] == 35.0
        assert len(data["projects"]) == 1

        proj_item = data["projects"][0]
        assert proj_item["id"] == project_id
        assert proj_item["name"] == "Dashboard Test"
        assert proj_item["compliance_score"] == 85.0
        assert proj_item["risk_score"] == 35.0

    @pytest.mark.asyncio
    async def test_rollup_response_shape(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Rollup response has all required fields."""
        resp = await client.get("/api/dashboard/rollup", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()

        # Top-level fields
        for field in [
            "total_projects",
            "total_zones",
            "total_assets",
            "total_conduits",
            "avg_compliance",
            "avg_risk",
            "compliance_distribution",
            "risk_distribution",
            "worst_compliance",
            "worst_risk",
            "trends",
            "projects",
        ]:
            assert field in data, f"Missing field: {field}"

        # Distribution shapes
        comp_dist = data["compliance_distribution"]
        for key in ["high", "medium", "low", "unknown"]:
            assert key in comp_dist

        risk_dist = data["risk_distribution"]
        for key in ["critical", "high", "medium", "low", "minimal", "unknown"]:
            assert key in risk_dist

    @pytest.mark.asyncio
    async def test_rollup_days_param_validation(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Days param must be 7-90."""
        # Too small
        resp = await client.get(
            "/api/dashboard/rollup?days=3", headers=auth_headers
        )
        assert resp.status_code == 422

        # Too large
        resp = await client.get(
            "/api/dashboard/rollup?days=200", headers=auth_headers
        )
        assert resp.status_code == 422

        # Valid
        resp = await client.get(
            "/api/dashboard/rollup?days=7", headers=auth_headers
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_rollup_requires_auth(self, client: AsyncClient):
        """Rollup requires authentication."""
        resp = await client.get("/api/dashboard/rollup")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_rollup_compliance_distribution(
        self, client: AsyncClient, auth_headers: dict, test_session: AsyncSession
    ):
        """Compliance distribution categorizes scores correctly."""
        # Create projects with different compliance scores
        p1 = await create_project(client, auth_headers, name="High Compliance")
        p2 = await create_project(client, auth_headers, name="Low Compliance")

        now = datetime.utcnow()
        test_session.add(
            MetricsSnapshot(
                project_id=p1["id"],
                compliance_score=95.0,
                risk_score=10.0,
                recorded_at=now,
            )
        )
        test_session.add(
            MetricsSnapshot(
                project_id=p2["id"],
                compliance_score=50.0,
                risk_score=70.0,
                recorded_at=now,
            )
        )
        await test_session.commit()

        resp = await client.get("/api/dashboard/rollup", headers=auth_headers)
        data = resp.json()

        assert data["compliance_distribution"]["high"] >= 1
        assert data["compliance_distribution"]["low"] >= 1
        assert data["risk_distribution"]["high"] >= 1
        assert data["risk_distribution"]["minimal"] >= 1
