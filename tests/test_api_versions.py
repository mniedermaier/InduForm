"""Tests for version history API endpoints."""

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


class TestListVersions:
    """Tests for listing versions."""

    @pytest.mark.asyncio
    async def test_list_versions_empty(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test listing versions on a newly created project (should be empty)."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0

    @pytest.mark.asyncio
    async def test_list_versions_unauthorized(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test listing versions without authentication."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/versions/",
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_list_versions_nonexistent_project(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test listing versions for a nonexistent project."""
        response = await client.get(
            "/api/projects/nonexistent-id/versions/",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_list_versions_no_access(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a user without access cannot list versions."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/versions/",
            headers=second_user_headers,
        )

        assert response.status_code == 404


class TestCreateVersion:
    """Tests for creating version snapshots."""

    @pytest.mark.asyncio
    async def test_create_version(self, client: AsyncClient, auth_headers: dict):
        """Test creating a manual version snapshot."""
        project_id = await _create_project(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Test snapshot"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["version_number"] == 1
        assert data["description"] == "Test snapshot"
        assert "id" in data
        assert "created_by" in data
        assert "created_at" in data
        assert data["created_by_username"] == "authuser"

    @pytest.mark.asyncio
    async def test_create_version_increments_number(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test that creating multiple versions increments the version number."""
        project_id = await _create_project(client, auth_headers)

        # Create first version
        response1 = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Version 1"},
        )
        assert response1.status_code == 201
        assert response1.json()["version_number"] == 1

        # Create second version
        response2 = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Version 2"},
        )
        assert response2.status_code == 201
        assert response2.json()["version_number"] == 2

    @pytest.mark.asyncio
    async def test_create_version_no_description(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test creating a version without a description."""
        project_id = await _create_project(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["description"] is None

    @pytest.mark.asyncio
    async def test_create_version_unauthorized(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test creating a version without authentication."""
        project_id = await _create_project(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/versions/",
            json={"description": "Test"},
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_viewer_cannot_create_version(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a viewer cannot create versions."""
        project_id = await _create_project(client, auth_headers)

        # Share with second user as viewer
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id, "viewer")

        # Second user (viewer) tries to create a version
        response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=second_user_headers,
            json={"description": "Unauthorized version"},
        )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_editor_can_create_version(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that an editor can create versions."""
        project_id = await _create_project(client, auth_headers)

        # Share with second user as editor
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id, "editor")

        # Second user (editor) creates a version
        response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=second_user_headers,
            json={"description": "Editor version"},
        )

        assert response.status_code == 201
        assert response.json()["description"] == "Editor version"


class TestVersionCount:
    """Tests for the version count endpoint."""

    @pytest.mark.asyncio
    async def test_version_count_empty(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test version count when there are no versions."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/versions/count",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0

    @pytest.mark.asyncio
    async def test_version_count_after_creation(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test version count after creating versions."""
        project_id = await _create_project(client, auth_headers)

        # Create two versions
        await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Version 1"},
        )
        await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Version 2"},
        )

        response = await client.get(
            f"/api/projects/{project_id}/versions/count",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 2

    @pytest.mark.asyncio
    async def test_version_count_nonexistent_project(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test version count for a nonexistent project."""
        response = await client.get(
            "/api/projects/nonexistent-id/versions/count",
            headers=auth_headers,
        )

        assert response.status_code == 404


class TestGetVersion:
    """Tests for getting a specific version."""

    @pytest.mark.asyncio
    async def test_get_version_with_snapshot(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test getting a specific version with its snapshot."""
        project_id = await _create_project(client, auth_headers)

        # Create a version
        create_response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Snapshot test"},
        )
        version_id = create_response.json()["id"]

        # Get the version
        response = await client.get(
            f"/api/projects/{project_id}/versions/{version_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == version_id
        assert data["version_number"] == 1
        assert data["description"] == "Snapshot test"
        assert "snapshot" in data
        assert isinstance(data["snapshot"], dict)
        assert data["created_by_username"] == "authuser"

    @pytest.mark.asyncio
    async def test_get_version_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test getting a version that does not exist."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/versions/nonexistent-id",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_version_wrong_project(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test getting a version using the wrong project ID."""
        project_id_1 = await _create_project(client, auth_headers)
        project_id_2 = await _create_project(client, auth_headers)

        # Create a version on project 1
        create_response = await client.post(
            f"/api/projects/{project_id_1}/versions/",
            headers=auth_headers,
            json={"description": "Version on project 1"},
        )
        version_id = create_response.json()["id"]

        # Try to get it from project 2
        response = await client.get(
            f"/api/projects/{project_id_2}/versions/{version_id}",
            headers=auth_headers,
        )

        assert response.status_code == 404


class TestRestoreVersion:
    """Tests for restoring a project to a previous version."""

    @pytest.mark.asyncio
    async def test_restore_version(self, client: AsyncClient, auth_headers: dict):
        """Test restoring a project to a previous version."""
        project_id = await _create_project(client, auth_headers)

        # Create a version
        create_response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Original version"},
        )
        version_id = create_response.json()["id"]

        # Restore to that version
        response = await client.post(
            f"/api/projects/{project_id}/versions/{version_id}/restore",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        # Restoring creates a backup version and a restored version
        # So the returned version should be version 3 (original=1, backup=2, restored=3)
        assert data["version_number"] == 3
        assert "Restored from version 1" in data["description"]

    @pytest.mark.asyncio
    async def test_restore_creates_backup(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test that restoring a version first creates a backup of the current state."""
        project_id = await _create_project(client, auth_headers)

        # Create a version
        create_response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Version to restore to"},
        )
        version_id = create_response.json()["id"]

        # Restore to that version
        await client.post(
            f"/api/projects/{project_id}/versions/{version_id}/restore",
            headers=auth_headers,
        )

        # Check that there are now 3 versions (original + backup + restored)
        count_response = await client.get(
            f"/api/projects/{project_id}/versions/count",
            headers=auth_headers,
        )
        assert count_response.json()["count"] == 3

        # List versions to verify the backup was created
        list_response = await client.get(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
        )
        versions = list_response.json()
        descriptions = [v["description"] for v in versions]
        assert any("Auto-backup" in (d or "") for d in descriptions)

    @pytest.mark.asyncio
    async def test_restore_nonexistent_version(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test restoring a version that does not exist."""
        project_id = await _create_project(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/versions/nonexistent-id/restore",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_viewer_cannot_restore_version(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a viewer cannot restore versions."""
        project_id = await _create_project(client, auth_headers)

        # Create a version
        create_response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Version"},
        )
        version_id = create_response.json()["id"]

        # Share with second user as viewer
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id, "viewer")

        # Viewer tries to restore
        response = await client.post(
            f"/api/projects/{project_id}/versions/{version_id}/restore",
            headers=second_user_headers,
        )

        assert response.status_code == 403


class TestCompareVersions:
    """Tests for comparing two versions."""

    @pytest.mark.asyncio
    async def test_compare_versions(self, client: AsyncClient, auth_headers: dict):
        """Test comparing two versions of a project."""
        project_id = await _create_project(client, auth_headers)

        # Create two versions
        version1_response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Version A"},
        )
        version1_id = version1_response.json()["id"]

        version2_response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Version B"},
        )
        version2_id = version2_response.json()["id"]

        # Compare versions
        response = await client.get(
            f"/api/projects/{project_id}/versions/{version1_id}/compare/{version2_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "zones" in data
        assert "assets" in data
        assert "conduits" in data
        assert "summary" in data

        # Verify zones structure
        assert "added" in data["zones"]
        assert "removed" in data["zones"]
        assert "modified" in data["zones"]

        # Verify summary structure
        assert "zones_added" in data["summary"]
        assert "zones_removed" in data["summary"]
        assert "zones_modified" in data["summary"]
        assert "assets_added" in data["summary"]
        assert "assets_removed" in data["summary"]
        assert "assets_modified" in data["summary"]
        assert "conduits_added" in data["summary"]
        assert "conduits_removed" in data["summary"]
        assert "conduits_modified" in data["summary"]

    @pytest.mark.asyncio
    async def test_compare_identical_versions(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test comparing two identical versions (no differences expected)."""
        project_id = await _create_project(client, auth_headers)

        # Create two versions of the same project state
        version1_response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Version A"},
        )
        version1_id = version1_response.json()["id"]

        version2_response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Version B"},
        )
        version2_id = version2_response.json()["id"]

        # Compare
        response = await client.get(
            f"/api/projects/{project_id}/versions/{version1_id}/compare/{version2_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        # Same project state, should have no differences
        summary = data["summary"]
        assert summary["zones_added"] == 0
        assert summary["zones_removed"] == 0
        assert summary["zones_modified"] == 0
        assert summary["assets_added"] == 0
        assert summary["assets_removed"] == 0
        assert summary["conduits_added"] == 0
        assert summary["conduits_removed"] == 0

    @pytest.mark.asyncio
    async def test_compare_nonexistent_version(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test comparing with a version that does not exist."""
        project_id = await _create_project(client, auth_headers)

        # Create one version
        version_response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Version A"},
        )
        version_id = version_response.json()["id"]

        # Compare with nonexistent version
        response = await client.get(
            f"/api/projects/{project_id}/versions/{version_id}/compare/nonexistent-id",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_compare_versions_no_access(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a user without access cannot compare versions."""
        project_id = await _create_project(client, auth_headers)

        # Create two versions
        v1 = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "V1"},
        )
        v2 = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "V2"},
        )

        v1_id = v1.json()["id"]
        v2_id = v2.json()["id"]

        # Second user without access tries to compare
        response = await client.get(
            f"/api/projects/{project_id}/versions/{v1_id}/compare/{v2_id}",
            headers=second_user_headers,
        )

        assert response.status_code == 404


class TestViewerVersionAccess:
    """Tests for viewer access to version endpoints."""

    @pytest.mark.asyncio
    async def test_viewer_can_list_versions(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a viewer can list versions."""
        project_id = await _create_project(client, auth_headers)

        # Create a version
        await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "A version"},
        )

        # Share with second user as viewer
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id, "viewer")

        # Viewer lists versions
        response = await client.get(
            f"/api/projects/{project_id}/versions/",
            headers=second_user_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

    @pytest.mark.asyncio
    async def test_viewer_can_get_version(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a viewer can get a specific version."""
        project_id = await _create_project(client, auth_headers)

        # Create a version
        create_response = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Viewer accessible"},
        )
        version_id = create_response.json()["id"]

        # Share with second user as viewer
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id, "viewer")

        # Viewer gets the version
        response = await client.get(
            f"/api/projects/{project_id}/versions/{version_id}",
            headers=second_user_headers,
        )

        assert response.status_code == 200
        assert response.json()["id"] == version_id

    @pytest.mark.asyncio
    async def test_viewer_can_get_version_count(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a viewer can get the version count."""
        project_id = await _create_project(client, auth_headers)

        # Create a version
        await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "Version"},
        )

        # Share with second user as viewer
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id, "viewer")

        # Viewer gets count
        response = await client.get(
            f"/api/projects/{project_id}/versions/count",
            headers=second_user_headers,
        )

        assert response.status_code == 200
        assert response.json()["count"] == 1

    @pytest.mark.asyncio
    async def test_viewer_can_compare_versions(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a viewer can compare versions."""
        project_id = await _create_project(client, auth_headers)

        # Create two versions
        v1 = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "V1"},
        )
        v2 = await client.post(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
            json={"description": "V2"},
        )

        v1_id = v1.json()["id"]
        v2_id = v2.json()["id"]

        # Share with second user as viewer
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id, "viewer")

        # Viewer compares versions
        response = await client.get(
            f"/api/projects/{project_id}/versions/{v1_id}/compare/{v2_id}",
            headers=second_user_headers,
        )

        assert response.status_code == 200
        assert "summary" in response.json()
