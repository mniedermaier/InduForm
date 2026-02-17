"""Tests for admin API endpoints."""

import os

os.environ["INDUFORM_RATE_LIMIT_ENABLED"] = "false"

import pytest
from httpx import AsyncClient


async def make_admin(client: AsyncClient, auth_headers: dict) -> dict:
    """Promote the current user to admin via the make-first-admin endpoint.

    Returns the response JSON.
    """
    resp = await client.post(
        "/api/admin/make-first-admin",
        headers=auth_headers,
    )
    assert resp.status_code == 200, f"make-first-admin failed: {resp.text}"
    data = resp.json()
    assert data["is_admin"] is True
    return data


class TestAdminEndpoints:
    """Tests for admin-only endpoints."""

    @pytest.mark.asyncio
    async def test_admin_stats(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET /api/admin/stats returns stats object."""
        await make_admin(client, auth_headers)

        resp = await client.get(
            "/api/admin/stats",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert "total_users" in data
        assert "active_users" in data
        assert "total_projects" in data
        assert "total_zones" in data
        assert "total_assets" in data
        assert "total_conduits" in data
        # At minimum there's the admin user we just created
        assert data["total_users"] >= 1
        assert data["active_users"] >= 1

    @pytest.mark.asyncio
    async def test_admin_users_list(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET /api/admin/users returns user list."""
        await make_admin(client, auth_headers)

        resp = await client.get(
            "/api/admin/users",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        # Check user object structure
        user = data[0]
        assert "id" in user
        assert "email" in user
        assert "username" in user
        assert "is_active" in user
        assert "is_admin" in user
        assert "project_count" in user

    @pytest.mark.asyncio
    async def test_admin_health(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET /api/admin/health returns health info."""
        await make_admin(client, auth_headers)

        resp = await client.get(
            "/api/admin/health",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["db_status"] == "ok"
        assert "uptime_seconds" in data
        assert isinstance(data["uptime_seconds"], (int, float))
        assert "table_counts" in data
        assert isinstance(data["table_counts"], dict)
        assert "users" in data["table_counts"]
        assert "projects" in data["table_counts"]

    @pytest.mark.asyncio
    async def test_admin_requires_admin(
        self, client: AsyncClient, second_user_headers: dict
    ):
        """Non-admin user gets 403 on admin endpoints."""
        # second_user_headers is a regular (non-admin) user
        resp = await client.get(
            "/api/admin/stats",
            headers=second_user_headers,
        )
        assert resp.status_code == 403

        resp = await client.get(
            "/api/admin/users",
            headers=second_user_headers,
        )
        assert resp.status_code == 403

        resp = await client.get(
            "/api/admin/health",
            headers=second_user_headers,
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_requires_auth(self, client: AsyncClient):
        """Unauthenticated requests get 401 on admin endpoints."""
        resp = await client.get("/api/admin/stats")
        assert resp.status_code == 401

        resp = await client.get("/api/admin/users")
        assert resp.status_code == 401

        resp = await client.get("/api/admin/health")
        assert resp.status_code == 401


class TestMakeFirstAdmin:
    """Tests for the make-first-admin bootstrap endpoint."""

    @pytest.mark.asyncio
    async def test_make_first_admin(
        self, client: AsyncClient, auth_headers: dict
    ):
        """POST /api/admin/make-first-admin promotes user to admin."""
        resp = await client.post(
            "/api/admin/make-first-admin",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["is_admin"] is True
        assert "message" in data

    @pytest.mark.asyncio
    async def test_make_first_admin_fails_when_admin_exists(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """make-first-admin returns 400 if an admin already exists."""
        # First user becomes admin
        await make_admin(client, auth_headers)

        # Second user tries to become admin
        resp = await client.post(
            "/api/admin/make-first-admin",
            headers=second_user_headers,
        )

        assert resp.status_code == 400
        assert "already exist" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_make_first_admin_requires_auth(self, client: AsyncClient):
        """make-first-admin without auth returns 401."""
        resp = await client.post("/api/admin/make-first-admin")
        assert resp.status_code == 401


class TestAdminProjectManagement:
    """Tests for admin project management endpoints."""

    @pytest.mark.asyncio
    async def test_admin_list_projects(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET /api/admin/projects returns all projects."""
        await make_admin(client, auth_headers)

        # Create a project
        await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Admin Test Project"},
        )

        resp = await client.get(
            "/api/admin/projects",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        project = data[0]
        assert "id" in project
        assert "name" in project
        assert "owner_username" in project
        assert "zone_count" in project

    @pytest.mark.asyncio
    async def test_admin_sessions(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET /api/admin/sessions returns active user sessions."""
        await make_admin(client, auth_headers)

        resp = await client.get(
            "/api/admin/sessions",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # At least the admin user should be listed
        assert len(data) >= 1
        session = data[0]
        assert "user_id" in session
        assert "username" in session
        assert "is_active" in session
