"""Tests for templates API endpoints."""

import pytest
from httpx import AsyncClient


class TestTemplatesListing:
    """Tests for template listing."""

    @pytest.mark.asyncio
    async def test_list_templates_includes_builtin(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test that built-in templates are included by default."""
        response = await client.get("/api/templates/", headers=auth_headers)

        assert response.status_code == 200
        templates = response.json()

        # Should have built-in templates
        builtin = [t for t in templates if t["is_builtin"]]
        assert len(builtin) > 0

        # Check for expected built-in templates
        template_ids = [t["id"] for t in builtin]
        assert any("purdue" in tid for tid in template_ids)

    @pytest.mark.asyncio
    async def test_list_templates_exclude_builtin(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test listing templates without built-in."""
        response = await client.get(
            "/api/templates/?include_builtin=false",
            headers=auth_headers,
        )

        assert response.status_code == 200
        templates = response.json()

        # Should not have built-in templates
        builtin = [t for t in templates if t["is_builtin"]]
        assert len(builtin) == 0

    @pytest.mark.asyncio
    async def test_list_templates_unauthorized(self, client: AsyncClient):
        """Test that listing templates requires auth."""
        response = await client.get("/api/templates/")

        assert response.status_code == 401


class TestTemplateDetails:
    """Tests for getting template details."""

    @pytest.mark.asyncio
    async def test_get_builtin_template(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test getting a built-in template."""
        response = await client.get(
            "/api/templates/builtin:purdue-model",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "builtin:purdue-model"
        assert data["is_builtin"] is True
        assert "project" in data  # Should include full project data

    @pytest.mark.asyncio
    async def test_get_nonexistent_template(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test getting a non-existent template."""
        response = await client.get(
            "/api/templates/nonexistent-template",
            headers=auth_headers,
        )

        assert response.status_code == 404


class TestTemplateCreation:
    """Tests for creating templates from projects."""

    @pytest.mark.asyncio
    async def test_create_template_from_project(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test creating a template from an existing project."""
        # First create a project
        project_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Template Source", "description": "Source project"},
        )
        project_id = project_response.json()["id"]

        # Create template from project
        response = await client.post(
            "/api/templates/",
            headers=auth_headers,
            json={
                "project_id": project_id,
                "name": "My Template",
                "description": "A custom template",
                "category": "custom",
                "is_public": False,
            },
        )

        assert response.status_code in [200, 201]
        data = response.json()
        assert data["name"] == "My Template"
        assert data["description"] == "A custom template"
        assert data["is_builtin"] is False
        assert data["is_public"] is False

    @pytest.mark.asyncio
    async def test_create_public_template(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test creating a public template."""
        # Create a project
        project_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Public Source"},
        )
        project_id = project_response.json()["id"]

        # Create public template
        response = await client.post(
            "/api/templates/",
            headers=auth_headers,
            json={
                "project_id": project_id,
                "name": "Public Template",
                "is_public": True,
            },
        )

        assert response.status_code in [200, 201]
        assert response.json()["is_public"] is True


class TestTemplateManagement:
    """Tests for template update and delete."""

    @pytest.mark.asyncio
    async def test_update_template(self, client: AsyncClient, auth_headers: dict):
        """Test updating a template."""
        # Create a project and template
        project_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Update Source"},
        )
        project_id = project_response.json()["id"]

        template_response = await client.post(
            "/api/templates/",
            headers=auth_headers,
            json={
                "project_id": project_id,
                "name": "Original Name",
            },
        )
        template_id = template_response.json()["id"]

        # Update the template
        response = await client.put(
            f"/api/templates/{template_id}",
            headers=auth_headers,
            json={
                "name": "Updated Name",
                "description": "Updated description",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Updated description"

    @pytest.mark.asyncio
    async def test_delete_template(self, client: AsyncClient, auth_headers: dict):
        """Test deleting a template."""
        # Create a project and template
        project_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Delete Source"},
        )
        project_id = project_response.json()["id"]

        template_response = await client.post(
            "/api/templates/",
            headers=auth_headers,
            json={
                "project_id": project_id,
                "name": "To Delete",
            },
        )
        template_id = template_response.json()["id"]

        # Delete the template
        response = await client.delete(
            f"/api/templates/{template_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200

        # Verify it's gone
        get_response = await client.get(
            f"/api/templates/{template_id}",
            headers=auth_headers,
        )
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_cannot_delete_builtin_template(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test that built-in templates cannot be deleted."""
        response = await client.delete(
            "/api/templates/builtin:purdue-model",
            headers=auth_headers,
        )

        # Should fail - can't delete built-in
        assert response.status_code in [403, 400]


class TestTemplateVisibility:
    """Tests for template visibility and sharing."""

    @pytest.mark.asyncio
    async def test_public_template_visible_to_others(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test that public templates are visible to other users."""
        # Create a public template as first user
        project_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Public Source"},
        )
        project_id = project_response.json()["id"]

        template_response = await client.post(
            "/api/templates/",
            headers=auth_headers,
            json={
                "project_id": project_id,
                "name": "Public Template",
                "is_public": True,
            },
        )
        template_id = template_response.json()["id"]

        # Second user should see the public template
        list_response = await client.get(
            "/api/templates/",
            headers=second_user_headers,
        )
        templates = list_response.json()
        template_ids = [t["id"] for t in templates]
        assert template_id in template_ids

    @pytest.mark.asyncio
    async def test_private_template_not_visible_to_others(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test that private templates are not visible to other users."""
        # Create a private template as first user
        project_response = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Private Source"},
        )
        project_id = project_response.json()["id"]

        template_response = await client.post(
            "/api/templates/",
            headers=auth_headers,
            json={
                "project_id": project_id,
                "name": "Private Template",
                "is_public": False,
            },
        )
        template_id = template_response.json()["id"]

        # Second user should not see the private template
        list_response = await client.get(
            "/api/templates/?include_builtin=false",
            headers=second_user_headers,
        )
        templates = list_response.json()
        template_ids = [t["id"] for t in templates]
        assert template_id not in template_ids
