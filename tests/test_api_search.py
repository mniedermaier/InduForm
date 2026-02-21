"""Tests for search API endpoint."""

import os

os.environ["INDUFORM_RATE_LIMIT_ENABLED"] = "false"

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from induform.db.models import AssetDB, ConduitDB, ProjectDB, ZoneDB


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


async def add_zone_and_asset(
    test_session: AsyncSession,
    project_id: str,
    zone_name: str = "Control Zone",
    zone_id: str = "zone-1",
    asset_name: str = "PLC-01",
    asset_id: str = "asset-1",
    ip_address: str = "192.168.1.10",
    vendor: str = "Siemens",
) -> tuple[ZoneDB, AssetDB]:
    """Helper: add a zone with an asset directly in the DB."""
    zone = ZoneDB(
        zone_id=zone_id,
        name=zone_name,
        project_id=project_id,
        description=f"Description for {zone_name}",
        security_level_target=2,
        type="control",
        x_position=0.0,
        y_position=0.0,
    )
    test_session.add(zone)
    await test_session.flush()

    asset = AssetDB(
        asset_id=asset_id,
        name=asset_name,
        zone_db_id=zone.id,
        ip_address=ip_address,
        vendor=vendor,
        type="plc",
    )
    test_session.add(asset)
    await test_session.commit()
    return zone, asset


async def add_conduit(
    test_session: AsyncSession,
    project_id: str,
    conduit_id: str = "conduit-1",
    name: str = "DMZ Link",
) -> ConduitDB:
    """Helper: add a conduit with two zones directly in the DB."""
    zone_a = ZoneDB(
        zone_id="cond-zone-a",
        name="Zone A",
        project_id=project_id,
        type="control",
        security_level_target=2,
    )
    zone_b = ZoneDB(
        zone_id="cond-zone-b",
        name="Zone B",
        project_id=project_id,
        type="enterprise",
        security_level_target=1,
    )
    test_session.add_all([zone_a, zone_b])
    await test_session.flush()

    conduit = ConduitDB(
        conduit_id=conduit_id,
        name=name,
        project_id=project_id,
        from_zone_db_id=zone_a.id,
        to_zone_db_id=zone_b.id,
    )
    test_session.add(conduit)
    await test_session.commit()
    return conduit


class TestSearch:
    """Tests for GET /api/search."""

    @pytest.mark.asyncio
    async def test_search_requires_auth(self, client: AsyncClient):
        """Search requires authentication."""
        resp = await client.get("/api/search?q=test")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_search_requires_query(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Search requires a non-empty query parameter."""
        resp = await client.get("/api/search", headers=auth_headers)
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_search_empty_results(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Search with no matching data returns empty results."""
        resp = await client.get(
            "/api/search?q=nonexistent", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["query"] == "nonexistent"
        assert data["total"] == 0
        assert data["results"] == []

    @pytest.mark.asyncio
    async def test_search_finds_project_by_name(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Search finds projects by name."""
        await create_project(
            client, auth_headers, name="Nuclear Plant Alpha"
        )

        resp = await client.get(
            "/api/search?q=Nuclear", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        result = data["results"][0]
        assert result["type"] == "project"
        assert "Nuclear" in result["name"]

    @pytest.mark.asyncio
    async def test_search_finds_project_by_description(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Search finds projects by description."""
        await create_project(
            client,
            auth_headers,
            name="Proj X",
            description="Water treatment facility in Berlin",
        )

        resp = await client.get(
            "/api/search?q=treatment", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert any(r["type"] == "project" for r in data["results"])

    @pytest.mark.asyncio
    async def test_search_finds_zone(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_session: AsyncSession,
    ):
        """Search finds zones by name."""
        project = await create_project(client, auth_headers, name="ZoneProj")
        await add_zone_and_asset(
            test_session,
            project["id"],
            zone_name="SCADA Control Room",
            zone_id="scada-zone",
        )

        resp = await client.get(
            "/api/search?q=SCADA&type=zone", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        result = data["results"][0]
        assert result["type"] == "zone"
        assert "SCADA" in result["name"]
        assert result["project_id"] == project["id"]

    @pytest.mark.asyncio
    async def test_search_finds_asset_by_name(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_session: AsyncSession,
    ):
        """Search finds assets by name."""
        project = await create_project(
            client, auth_headers, name="AssetProj"
        )
        await add_zone_and_asset(
            test_session,
            project["id"],
            asset_name="Turbine-Controller-7",
            asset_id="tc7",
        )

        resp = await client.get(
            "/api/search?q=Turbine&type=asset", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        result = data["results"][0]
        assert result["type"] == "asset"
        assert "Turbine" in result["name"]

    @pytest.mark.asyncio
    async def test_search_finds_asset_by_ip(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_session: AsyncSession,
    ):
        """Search finds assets by IP address."""
        project = await create_project(client, auth_headers, name="IPProj")
        await add_zone_and_asset(
            test_session,
            project["id"],
            ip_address="10.0.50.99",
            asset_id="ip-asset",
            zone_id="ip-zone",
        )

        resp = await client.get(
            "/api/search?q=10.0.50&type=asset", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert any(r["type"] == "asset" for r in data["results"])

    @pytest.mark.asyncio
    async def test_search_finds_asset_by_vendor(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_session: AsyncSession,
    ):
        """Search finds assets by vendor."""
        project = await create_project(
            client, auth_headers, name="VendorProj"
        )
        await add_zone_and_asset(
            test_session,
            project["id"],
            vendor="Honeywell",
            asset_id="hw-asset",
            zone_id="hw-zone",
        )

        resp = await client.get(
            "/api/search?q=Honeywell&type=asset", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_search_finds_conduit(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_session: AsyncSession,
    ):
        """Search finds conduits by name."""
        project = await create_project(
            client, auth_headers, name="ConduitProj"
        )
        await add_conduit(
            test_session,
            project["id"],
            conduit_id="dmz-link-1",
            name="DMZ Firewall Link",
        )

        resp = await client.get(
            "/api/search?q=DMZ&type=conduit", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        result = data["results"][0]
        assert result["type"] == "conduit"

    @pytest.mark.asyncio
    async def test_search_type_filter(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Search respects the type filter."""
        await create_project(
            client, auth_headers, name="FilterTest Project"
        )

        # Search for zones only — should not return the project
        resp = await client.get(
            "/api/search?q=FilterTest&type=zone", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert all(r["type"] == "zone" for r in data["results"])

    @pytest.mark.asyncio
    async def test_search_limit_param(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Search respects the limit parameter."""
        # Create several projects
        for i in range(5):
            await create_project(
                client, auth_headers, name=f"LimitTest-{i}"
            )

        resp = await client.get(
            "/api/search?q=LimitTest&limit=2", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["results"]) <= 2

    @pytest.mark.asyncio
    async def test_search_case_insensitive(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Search is case-insensitive."""
        await create_project(
            client, auth_headers, name="PowerGrid Facility"
        )

        resp = await client.get(
            "/api/search?q=powergrid", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    @pytest.mark.asyncio
    async def test_search_response_shape(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Search response has correct shape."""
        await create_project(client, auth_headers, name="ShapeTest")

        resp = await client.get(
            "/api/search?q=ShapeTest", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()

        assert "query" in data
        assert "total" in data
        assert "results" in data
        assert isinstance(data["results"], list)

        if data["results"]:
            result = data["results"][0]
            for field in [
                "type", "id", "name", "project_id", "project_name",
            ]:
                assert field in result

    @pytest.mark.asyncio
    async def test_search_highlight(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Search results include highlight snippets."""
        await create_project(
            client,
            auth_headers,
            name="HighlightProj",
            description="This facility handles chemical processing for industrial use",
        )

        resp = await client.get(
            "/api/search?q=chemical", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        result = data["results"][0]
        assert result["highlight"] is not None
        assert "chemical" in result["highlight"].lower()

    @pytest.mark.asyncio
    async def test_search_permission_isolation(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Users can only search their own accessible projects."""
        await create_project(
            client, auth_headers, name="SecretProject-Alpha"
        )

        # Second user should not find the first user's project
        resp = await client.get(
            "/api/search?q=SecretProject", headers=second_user_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_search_limit_validation(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Limit param must be 1-100."""
        resp = await client.get(
            "/api/search?q=test&limit=0", headers=auth_headers
        )
        assert resp.status_code == 422

        resp = await client.get(
            "/api/search?q=test&limit=200", headers=auth_headers
        )
        assert resp.status_code == 422
