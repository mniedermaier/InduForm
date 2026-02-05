"""Tests for activity log API endpoints."""

import pytest
from httpx import AsyncClient


async def _create_project(client: AsyncClient, auth_headers: dict) -> str:
    """Helper to create a project and return its ID."""
    response = await client.post(
        "/api/projects/",
        headers=auth_headers,
        json={"name": "Test Project", "standard": "IEC62443"},
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _get_user_id(client: AsyncClient, headers: dict) -> str:
    """Helper to get the current user's ID."""
    response = await client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200
    return response.json()["id"]


async def _share_project(
    client: AsyncClient,
    project_id: str,
    auth_headers: dict,
    target_user_id: str,
    permission: str = "editor",
) -> None:
    """Helper to share a project with another user."""
    response = await client.post(
        f"/api/projects/{project_id}/access",
        headers=auth_headers,
        json={"user_id": target_user_id, "permission": permission},
    )
    assert response.status_code == 201


class TestGetActivityLog:
    """Tests for getting activity logs."""

    @pytest.mark.asyncio
    async def test_get_activity_log(self, client: AsyncClient, auth_headers: dict):
        """Test getting activity log for a project."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/activity/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert isinstance(data["items"], list)

    @pytest.mark.asyncio
    async def test_activity_log_has_creation_entry(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test that a project creation generates an activity log entry."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/activity/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        # Project creation should auto-generate an activity entry
        assert data["total"] >= 1
        actions = [item["action"] for item in data["items"]]
        assert "created" in actions

    @pytest.mark.asyncio
    async def test_activity_log_unauthorized(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test getting activity log without authentication."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/activity/",
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_activity_log_nonexistent_project(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test getting activity log for a project that does not exist."""
        response = await client.get(
            "/api/projects/nonexistent-id/activity/",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_activity_log_no_access(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a user cannot access activity log for a project they do not have access to."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/activity/",
            headers=second_user_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_activity_log_pagination(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test activity log pagination parameters."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/activity/",
            headers=auth_headers,
            params={"page": 1, "page_size": 10},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["page_size"] == 10

    @pytest.mark.asyncio
    async def test_activity_log_entry_fields(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test that activity log entries contain all expected fields."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/activity/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        items = response.json()["items"]
        assert len(items) >= 1

        entry = items[0]
        assert "id" in entry
        assert "project_id" in entry
        assert "user_id" in entry
        assert "username" in entry
        assert "action" in entry
        assert "created_at" in entry
        assert entry["project_id"] == project_id

    @pytest.mark.asyncio
    async def test_activity_log_tracks_sharing(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that sharing a project creates an activity log entry."""
        project_id = await _create_project(client, auth_headers)

        # Share project with second user
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id)

        # Check activity log
        response = await client.get(
            f"/api/projects/{project_id}/activity/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        actions = [item["action"] for item in response.json()["items"]]
        assert "shared" in actions

    @pytest.mark.asyncio
    async def test_activity_log_tracks_metadata_update(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test that updating project metadata creates an activity log entry."""
        project_id = await _create_project(client, auth_headers)

        # Update the project metadata
        await client.patch(
            f"/api/projects/{project_id}",
            headers=auth_headers,
            json={"name": "Updated Name"},
        )

        # Check activity log
        response = await client.get(
            f"/api/projects/{project_id}/activity/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        actions = [item["action"] for item in response.json()["items"]]
        assert "updated" in actions

    @pytest.mark.asyncio
    async def test_shared_user_can_view_activity(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a user with viewer access can see the activity log."""
        project_id = await _create_project(client, auth_headers)

        # Share project with second user as viewer
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id, "viewer")

        # Second user should be able to see activity
        response = await client.get(
            f"/api/projects/{project_id}/activity/",
            headers=second_user_headers,
        )

        assert response.status_code == 200


class TestExportActivityCSV:
    """Tests for exporting activity log as CSV."""

    @pytest.mark.asyncio
    async def test_export_csv(self, client: AsyncClient, auth_headers: dict):
        """Test exporting activity log as CSV."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/activity/export",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/csv")

        # Verify Content-Disposition header
        content_disposition = response.headers.get("content-disposition", "")
        assert "attachment" in content_disposition
        assert "activity_" in content_disposition

    @pytest.mark.asyncio
    async def test_export_csv_headers(self, client: AsyncClient, auth_headers: dict):
        """Test that CSV export has proper column headers."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/activity/export",
            headers=auth_headers,
        )

        assert response.status_code == 200
        csv_content = response.text
        lines = csv_content.strip().split("\n")

        # Check header row
        assert len(lines) >= 1
        header = lines[0]
        assert "Timestamp" in header
        assert "User" in header
        assert "Action" in header
        assert "Entity Type" in header
        assert "Entity ID" in header
        assert "Entity Name" in header
        assert "Details" in header

    @pytest.mark.asyncio
    async def test_export_csv_has_data_rows(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test that CSV export includes data rows for activity entries."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/activity/export",
            headers=auth_headers,
        )

        assert response.status_code == 200
        csv_content = response.text
        lines = csv_content.strip().split("\n")

        # Should have header + at least one data row (from project creation)
        assert len(lines) >= 2

    @pytest.mark.asyncio
    async def test_export_csv_unauthorized(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test exporting CSV without authentication."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/activity/export",
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_export_csv_nonexistent_project(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test exporting CSV for a project that does not exist."""
        response = await client.get(
            "/api/projects/nonexistent-id/activity/export",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_export_csv_no_access(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a user cannot export CSV for a project they do not have access to."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/activity/export",
            headers=second_user_headers,
        )

        assert response.status_code == 404
