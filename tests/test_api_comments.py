"""Tests for comments API endpoints."""

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


class TestListComments:
    """Tests for listing comments."""

    @pytest.mark.asyncio
    async def test_list_comments_empty(self, client: AsyncClient, auth_headers: dict):
        """Test listing comments on a project with no comments."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0

    @pytest.mark.asyncio
    async def test_list_comments_unauthorized(self, client: AsyncClient, auth_headers: dict):
        """Test listing comments without authentication."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(f"/api/projects/{project_id}/comments/")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_list_comments_nonexistent_project(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test listing comments on a project that does not exist."""
        response = await client.get(
            "/api/projects/nonexistent-id/comments/",
            headers=auth_headers,
        )

        assert response.status_code == 404


class TestCreateComment:
    """Tests for creating comments."""

    @pytest.mark.asyncio
    async def test_create_comment(self, client: AsyncClient, auth_headers: dict):
        """Test creating a comment on a project."""
        project_id = await _create_project(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "Test comment",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["text"] == "Test comment"
        assert data["entity_type"] == "zone"
        assert data["entity_id"] == "zone1"
        assert data["is_resolved"] is False
        assert data["resolved_by"] is None
        assert data["resolved_at"] is None
        assert "id" in data
        assert "author_id" in data
        assert "created_at" in data
        assert "updated_at" in data

    @pytest.mark.asyncio
    async def test_create_comment_invalid_entity_type(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test creating a comment with an invalid entity type."""
        project_id = await _create_project(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "invalid",
                "entity_id": "zone1",
                "text": "Test comment",
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_comment_empty_text(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test creating a comment with empty text."""
        project_id = await _create_project(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "",
            },
        )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_create_comment_on_conduit(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test creating a comment on a conduit entity."""
        project_id = await _create_project(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "conduit",
                "entity_id": "conduit1",
                "text": "Conduit comment",
            },
        )

        assert response.status_code == 201
        assert response.json()["entity_type"] == "conduit"

    @pytest.mark.asyncio
    async def test_create_comment_on_asset(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test creating a comment on an asset entity."""
        project_id = await _create_project(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "asset",
                "entity_id": "asset1",
                "text": "Asset comment",
            },
        )

        assert response.status_code == 201
        assert response.json()["entity_type"] == "asset"

    @pytest.mark.asyncio
    async def test_create_comment_unauthorized(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test creating a comment without authentication."""
        project_id = await _create_project(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/comments/",
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "Test comment",
            },
        )

        assert response.status_code == 401


class TestGetComment:
    """Tests for getting a specific comment."""

    @pytest.mark.asyncio
    async def test_get_comment(self, client: AsyncClient, auth_headers: dict):
        """Test getting a specific comment by ID."""
        project_id = await _create_project(client, auth_headers)

        # Create a comment
        create_response = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "Retrievable comment",
            },
        )
        comment_id = create_response.json()["id"]

        # Get the comment
        response = await client.get(
            f"/api/projects/{project_id}/comments/{comment_id}",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == comment_id
        assert data["text"] == "Retrievable comment"
        assert data["entity_type"] == "zone"
        assert data["entity_id"] == "zone1"

    @pytest.mark.asyncio
    async def test_get_comment_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test getting a comment that does not exist."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/comments/nonexistent-id",
            headers=auth_headers,
        )

        assert response.status_code == 404


class TestUpdateComment:
    """Tests for updating comments."""

    @pytest.mark.asyncio
    async def test_update_comment(self, client: AsyncClient, auth_headers: dict):
        """Test updating a comment's text."""
        project_id = await _create_project(client, auth_headers)

        # Create a comment
        create_response = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "Original text",
            },
        )
        comment_id = create_response.json()["id"]

        # Update the comment
        response = await client.put(
            f"/api/projects/{project_id}/comments/{comment_id}",
            headers=auth_headers,
            json={"text": "Updated text"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["text"] == "Updated text"

    @pytest.mark.asyncio
    async def test_update_comment_other_user_forbidden(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a second user cannot edit the first user's comment."""
        project_id = await _create_project(client, auth_headers)

        # Share project with second user
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id)

        # Create a comment as first user
        create_response = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "First user comment",
            },
        )
        comment_id = create_response.json()["id"]

        # Second user tries to update
        response = await client.put(
            f"/api/projects/{project_id}/comments/{comment_id}",
            headers=second_user_headers,
            json={"text": "Unauthorized edit"},
        )

        assert response.status_code == 403
        assert "own comments" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_update_comment_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test updating a comment that does not exist."""
        project_id = await _create_project(client, auth_headers)

        response = await client.put(
            f"/api/projects/{project_id}/comments/nonexistent-id",
            headers=auth_headers,
            json={"text": "Updated text"},
        )

        assert response.status_code == 404


class TestDeleteComment:
    """Tests for deleting comments."""

    @pytest.mark.asyncio
    async def test_delete_comment(self, client: AsyncClient, auth_headers: dict):
        """Test deleting a comment."""
        project_id = await _create_project(client, auth_headers)

        # Create a comment
        create_response = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "To be deleted",
            },
        )
        comment_id = create_response.json()["id"]

        # Delete the comment
        response = await client.delete(
            f"/api/projects/{project_id}/comments/{comment_id}",
            headers=auth_headers,
        )

        assert response.status_code == 204

        # Verify it's gone
        get_response = await client.get(
            f"/api/projects/{project_id}/comments/{comment_id}",
            headers=auth_headers,
        )
        assert get_response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_comment_other_user_forbidden(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a second user cannot delete the first user's comment."""
        project_id = await _create_project(client, auth_headers)

        # Share project with second user
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id)

        # Create a comment as first user
        create_response = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "Protected comment",
            },
        )
        comment_id = create_response.json()["id"]

        # Second user tries to delete
        response = await client.delete(
            f"/api/projects/{project_id}/comments/{comment_id}",
            headers=second_user_headers,
        )

        assert response.status_code == 403
        assert "own comments" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_delete_comment_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test deleting a comment that does not exist."""
        project_id = await _create_project(client, auth_headers)

        response = await client.delete(
            f"/api/projects/{project_id}/comments/nonexistent-id",
            headers=auth_headers,
        )

        assert response.status_code == 404


class TestResolveComment:
    """Tests for resolving and unresolving comments."""

    @pytest.mark.asyncio
    async def test_resolve_comment(self, client: AsyncClient, auth_headers: dict):
        """Test resolving a comment."""
        project_id = await _create_project(client, auth_headers)

        # Create a comment
        create_response = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "Needs resolution",
            },
        )
        comment_id = create_response.json()["id"]

        # Resolve the comment
        response = await client.post(
            f"/api/projects/{project_id}/comments/{comment_id}/resolve",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["is_resolved"] is True
        assert data["resolved_by"] is not None
        assert data["resolved_at"] is not None

    @pytest.mark.asyncio
    async def test_unresolve_comment(self, client: AsyncClient, auth_headers: dict):
        """Test unresolving a previously resolved comment."""
        project_id = await _create_project(client, auth_headers)

        # Create and resolve a comment
        create_response = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "Resolved then unresolved",
            },
        )
        comment_id = create_response.json()["id"]

        await client.post(
            f"/api/projects/{project_id}/comments/{comment_id}/resolve",
            headers=auth_headers,
        )

        # Unresolve the comment
        response = await client.post(
            f"/api/projects/{project_id}/comments/{comment_id}/unresolve",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["is_resolved"] is False
        assert data["resolved_by"] is None
        assert data["resolved_at"] is None

    @pytest.mark.asyncio
    async def test_editor_can_resolve_comment(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that an editor can resolve another user's comment."""
        project_id = await _create_project(client, auth_headers)

        # Share with second user as editor
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id, "editor")

        # Create a comment as second user
        create_response = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=second_user_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "Comment from second user",
            },
        )
        comment_id = create_response.json()["id"]

        # First user (owner/editor) resolves the comment
        response = await client.post(
            f"/api/projects/{project_id}/comments/{comment_id}/resolve",
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["is_resolved"] is True

    @pytest.mark.asyncio
    async def test_resolve_nonexistent_comment(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test resolving a comment that does not exist."""
        project_id = await _create_project(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/comments/nonexistent-id/resolve",
            headers=auth_headers,
        )

        assert response.status_code == 404


class TestCommentCount:
    """Tests for the comment count endpoint."""

    @pytest.mark.asyncio
    async def test_comment_count_empty(self, client: AsyncClient, auth_headers: dict):
        """Test comment count when there are no comments."""
        project_id = await _create_project(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/comments/count",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["unresolved"] == 0

    @pytest.mark.asyncio
    async def test_comment_count_with_resolved(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test comment count correctly separates resolved and unresolved."""
        project_id = await _create_project(client, auth_headers)

        # Create two comments
        comment1_resp = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "Comment 1",
            },
        )
        await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone2",
                "text": "Comment 2",
            },
        )

        # Resolve the first comment
        comment1_id = comment1_resp.json()["id"]
        await client.post(
            f"/api/projects/{project_id}/comments/{comment1_id}/resolve",
            headers=auth_headers,
        )

        # Check counts
        response = await client.get(
            f"/api/projects/{project_id}/comments/count",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert data["unresolved"] == 1


class TestCommentFiltering:
    """Tests for comment filtering by entity."""

    @pytest.mark.asyncio
    async def test_filter_comments_by_entity(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test filtering comments by entity type and entity ID."""
        project_id = await _create_project(client, auth_headers)

        # Create comments on different entities
        await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "Zone 1 comment",
            },
        )
        await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone2",
                "text": "Zone 2 comment",
            },
        )
        await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "conduit",
                "entity_id": "conduit1",
                "text": "Conduit comment",
            },
        )

        # Filter by entity
        response = await client.get(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            params={"entity_type": "zone", "entity_id": "zone1"},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["entity_id"] == "zone1"

    @pytest.mark.asyncio
    async def test_list_comments_exclude_resolved(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test listing comments with include_resolved=false."""
        project_id = await _create_project(client, auth_headers)

        # Create two comments, resolve one
        comment_resp = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "Resolved comment",
            },
        )
        await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "Unresolved comment",
            },
        )

        comment_id = comment_resp.json()["id"]
        await client.post(
            f"/api/projects/{project_id}/comments/{comment_id}/resolve",
            headers=auth_headers,
        )

        # List without resolved
        response = await client.get(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            params={"include_resolved": "false"},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["text"] == "Unresolved comment"
