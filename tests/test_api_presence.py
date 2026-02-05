"""Tests for Presence tracking API endpoints."""

import pytest
from httpx import AsyncClient


@pytest.fixture(autouse=True)
def clear_presence_store():
    """Clear in-memory presence store between tests."""
    from induform.api.presence.routes import _presence_store

    _presence_store.clear()
    yield
    _presence_store.clear()


async def _create_project(client: AsyncClient, auth_headers: dict) -> str:
    """Helper to create a project and return its ID."""
    response = await client.post(
        "/api/projects/",
        headers=auth_headers,
        json={"name": "Presence Test Project"},
    )
    return response.json()["id"]


class TestPresenceHeartbeat:
    """Tests for the presence heartbeat endpoint."""

    @pytest.mark.asyncio
    async def test_heartbeat(self, client: AsyncClient, auth_headers: dict):
        """Test sending a heartbeat."""
        project_id = await _create_project(client, auth_headers)

        response = await client.post(
            "/api/presence/heartbeat",
            headers=auth_headers,
            json={"project_id": project_id},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    @pytest.mark.asyncio
    async def test_heartbeat_unauthorized(self, client: AsyncClient):
        """Test heartbeat without auth."""
        response = await client.post(
            "/api/presence/heartbeat",
            json={"project_id": "some-id"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_heartbeat_no_project_access(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test heartbeat for a project the user cannot access."""
        project_id = await _create_project(client, auth_headers)

        response = await client.post(
            "/api/presence/heartbeat",
            headers=second_user_headers,
            json={"project_id": project_id},
        )
        assert response.status_code == 404


class TestProjectPresence:
    """Tests for getting project presence."""

    @pytest.mark.asyncio
    async def test_get_presence_empty(self, client: AsyncClient, auth_headers: dict):
        """Test getting presence when no one else is viewing."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/presence/{project_id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["project_id"] == project_id
        assert data["viewers"] == []

    @pytest.mark.asyncio
    async def test_get_presence_excludes_self(self, client: AsyncClient, auth_headers: dict):
        """Test that the current user is excluded from the viewers list."""
        project_id = await _create_project(client, auth_headers)

        # Send heartbeat
        await client.post(
            "/api/presence/heartbeat",
            headers=auth_headers,
            json={"project_id": project_id},
        )

        # Get presence — should not see self
        response = await client.get(
            f"/api/presence/{project_id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["viewers"] == []

    @pytest.mark.asyncio
    async def test_get_presence_shows_other_users(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test that other users appear in the viewers list."""
        project_id = await _create_project(client, auth_headers)

        # Share with second user by giving them access
        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        await client.post(
            f"/api/projects/{project_id}/access",
            headers=auth_headers,
            json={"user_id": second_user_id, "permission": "editor"},
        )

        # First user sends heartbeat
        await client.post(
            "/api/presence/heartbeat",
            headers=auth_headers,
            json={"project_id": project_id},
        )

        # Second user sends heartbeat
        await client.post(
            "/api/presence/heartbeat",
            headers=second_user_headers,
            json={"project_id": project_id},
        )

        # First user gets presence — should see second user
        response = await client.get(
            f"/api/presence/{project_id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        viewers = response.json()["viewers"]
        assert len(viewers) == 1
        assert viewers[0]["username"] == "seconduser"

    @pytest.mark.asyncio
    async def test_get_presence_no_access(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test getting presence for a project without access."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/presence/{project_id}",
            headers=second_user_headers,
        )
        assert response.status_code == 404


class TestPresenceLeave:
    """Tests for leaving presence."""

    @pytest.mark.asyncio
    async def test_leave_project(self, client: AsyncClient, auth_headers: dict):
        """Test leaving a project removes presence."""
        project_id = await _create_project(client, auth_headers)

        # Send heartbeat
        await client.post(
            "/api/presence/heartbeat",
            headers=auth_headers,
            json={"project_id": project_id},
        )

        # Leave — DELETE with a JSON body
        response = await client.request(
            "DELETE",
            "/api/presence/leave",
            headers=auth_headers,
            json={"project_id": project_id},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    @pytest.mark.asyncio
    async def test_leave_project_not_present(self, client: AsyncClient, auth_headers: dict):
        """Test leaving when not present does not error."""
        response = await client.request(
            "DELETE",
            "/api/presence/leave",
            headers=auth_headers,
            json={"project_id": "nonexistent-project"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"
