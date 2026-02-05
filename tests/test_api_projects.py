"""Tests for projects API endpoints."""

import pytest
from httpx import AsyncClient


class TestProjectCRUD:
    """Tests for project CRUD operations."""

    @pytest.mark.asyncio
    async def test_create_project(self, client: AsyncClient, auth_headers: dict):
        """Test creating a new project."""
        response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={
                "name": "Test Project",
                "description": "A test project",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Project"
        assert data["description"] == "A test project"
        assert data["permission"] == "owner"
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_project_unauthorized(self, client: AsyncClient):
        """Test creating a project without auth."""
        response = await client.post(
            "/api/projects/",
            json={"name": "Test Project"},
        )

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_list_projects(self, client: AsyncClient, auth_headers: dict):
        """Test listing projects."""
        # Create a project first
        await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Project 1"},
        )
        await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Project 2"},
        )

        # List projects
        response = await client.get("/api/projects/", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert any(p["name"] == "Project 1" for p in data)
        assert any(p["name"] == "Project 2" for p in data)

    @pytest.mark.asyncio
    async def test_get_project(self, client: AsyncClient, auth_headers: dict):
        """Test getting a specific project."""
        # Create a project
        create_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Get Test", "description": "Test description"},
        )
        project_id = create_response.json()["id"]

        # Get the project
        response = await client.get(
            f"/api/projects/{project_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Get Test"
        assert data["description"] == "Test description"
        assert "project" in data  # Should include full project data

    @pytest.mark.asyncio
    async def test_get_project_not_found(self, client: AsyncClient, auth_headers: dict):
        """Test getting a non-existent project."""
        response = await client.get(
            "/api/projects/non-existent-id",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_project(self, client: AsyncClient, auth_headers: dict):
        """Test updating a project."""
        # Create a project
        create_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Original Name"},
        )
        project_id = create_response.json()["id"]

        # Update the project
        response = await client.patch(
            f"/api/projects/{project_id}",
            headers=auth_headers,
            json={"name": "Updated Name", "description": "New description"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "New description"

    @pytest.mark.asyncio
    async def test_delete_project(self, client: AsyncClient, auth_headers: dict):
        """Test deleting a project."""
        # Create a project
        create_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "To Delete"},
        )
        project_id = create_response.json()["id"]

        # Delete the project
        response = await client.delete(
            f"/api/projects/{project_id}",
            headers=auth_headers,
        )

        assert response.status_code == 204

        # Verify it's gone
        get_response = await client.get(
            f"/api/projects/{project_id}",
            headers=auth_headers,
        )
        assert get_response.status_code == 404


class TestProjectArchiving:
    """Tests for project archiving functionality."""

    @pytest.mark.asyncio
    async def test_archive_project(self, client: AsyncClient, auth_headers: dict):
        """Test archiving a project."""
        # Create a project
        create_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "To Archive"},
        )
        project_id = create_response.json()["id"]

        # Archive the project
        response = await client.post(
            f"/api/projects/{project_id}/archive",
            headers=auth_headers,
        )

        assert response.status_code == 200

        # Verify it's archived
        list_response = await client.get(
            "/api/projects/?include_archived=true",
            headers=auth_headers,
        )
        projects = list_response.json()
        archived = [p for p in projects if p["id"] == project_id]
        assert len(archived) == 1
        assert archived[0]["is_archived"] is True

    @pytest.mark.asyncio
    async def test_restore_project(self, client: AsyncClient, auth_headers: dict):
        """Test restoring an archived project."""
        # Create and archive a project
        create_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "To Restore"},
        )
        project_id = create_response.json()["id"]

        await client.post(
            f"/api/projects/{project_id}/archive",
            headers=auth_headers,
        )

        # Restore the project
        response = await client.post(
            f"/api/projects/{project_id}/restore",
            headers=auth_headers,
        )

        assert response.status_code == 200

        # Verify it's no longer archived
        list_response = await client.get(
            "/api/projects/?include_archived=true",
            headers=auth_headers,
        )
        projects = list_response.json()
        restored = [p for p in projects if p["id"] == project_id]
        assert len(restored) == 1
        assert restored[0]["is_archived"] is False

    @pytest.mark.asyncio
    async def test_archived_projects_excluded_by_default(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test that archived projects are excluded from default listing."""
        # Create two projects
        await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Active Project"},
        )
        archive_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Archived Project"},
        )
        project_id = archive_response.json()["id"]

        # Archive one
        await client.post(
            f"/api/projects/{project_id}/archive",
            headers=auth_headers,
        )

        # List without include_archived
        response = await client.get(
            "/api/projects/?include_archived=false",
            headers=auth_headers,
        )

        projects = response.json()
        assert len(projects) == 1
        assert projects[0]["name"] == "Active Project"


class TestProjectSharing:
    """Tests for project sharing functionality."""

    @pytest.mark.asyncio
    async def test_share_project_with_user(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test sharing a project with another user."""
        # Create a project
        create_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Shared Project"},
        )
        project_id = create_response.json()["id"]

        # Get second user's ID
        me_response = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_response.json()["id"]

        # Share the project
        response = await client.post(
            f"/api/projects/{project_id}/access",
            headers=auth_headers,
            json={"user_id": second_user_id, "permission": "viewer"},
        )

        assert response.status_code in [200, 201]  # Could be 200 or 201

        # Verify second user can access
        get_response = await client.get(
            f"/api/projects/{project_id}",
            headers=second_user_headers,
        )
        assert get_response.status_code == 200

    @pytest.mark.asyncio
    async def test_unshared_project_not_visible(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test that unshared projects are not visible to other users."""
        # Create a project as first user
        create_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Private Project"},
        )
        project_id = create_response.json()["id"]

        # Second user tries to access
        response = await client.get(
            f"/api/projects/{project_id}",
            headers=second_user_headers,
        )

        assert response.status_code == 404


class TestProjectExport:
    """Tests for project export functionality."""

    @pytest.mark.asyncio
    async def test_export_yaml(self, client: AsyncClient, auth_headers: dict):
        """Test exporting project as YAML."""
        # Create a project
        create_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Export Test"},
        )
        project_id = create_response.json()["id"]

        # Export as YAML
        response = await client.post(
            f"/api/projects/{project_id}/export/yaml",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "yaml" in data
        assert "filename" in data
        assert data["filename"].endswith(".yaml")

    @pytest.mark.asyncio
    async def test_export_json(self, client: AsyncClient, auth_headers: dict):
        """Test exporting project as JSON."""
        # Create a project
        create_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "JSON Export Test"},
        )
        project_id = create_response.json()["id"]

        # Export as JSON
        response = await client.post(
            f"/api/projects/{project_id}/export/json",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "json" in data
        assert "filename" in data

    @pytest.mark.asyncio
    async def test_export_excel(self, client: AsyncClient, auth_headers: dict):
        """Test exporting project as Excel."""
        # Create a project
        create_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Excel Export Test"},
        )
        project_id = create_response.json()["id"]

        # Export as Excel
        response = await client.post(
            f"/api/projects/{project_id}/export/excel",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "excel_base64" in data
        assert "filename" in data
        assert data["filename"].endswith(".xlsx")

    @pytest.mark.asyncio
    async def test_export_pdf(self, client: AsyncClient, auth_headers: dict):
        """Test exporting project as PDF report."""
        # Create a project
        create_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "PDF Export Test"},
        )
        project_id = create_response.json()["id"]

        # Export as PDF
        response = await client.post(
            f"/api/projects/{project_id}/export/pdf",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "pdf_base64" in data
        assert "filename" in data
        assert data["filename"].endswith(".pdf")


class TestProjectComparison:
    """Tests for project comparison functionality."""

    @pytest.mark.asyncio
    async def test_compare_projects(self, client: AsyncClient, auth_headers: dict):
        """Test comparing two projects."""
        # Create two projects
        project1 = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Project A"},
        )
        project2 = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Project B"},
        )

        project1_id = project1.json()["id"]
        project2_id = project2.json()["id"]

        # Compare
        response = await client.post(
            "/api/projects/compare",
            headers=auth_headers,
            json={
                "project_a_id": project1_id,
                "project_b_id": project2_id,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "zones" in data
        assert "assets" in data
        assert "conduits" in data
        assert "summary" in data
