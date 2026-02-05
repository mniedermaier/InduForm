"""Tests for notifications API endpoints."""

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


class TestListNotifications:
    """Tests for listing notifications."""

    @pytest.mark.asyncio
    async def test_list_notifications_empty(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test listing notifications when there are none."""
        response = await client.get(
            "/api/notifications/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "unread_count" in data
        assert data["total"] == 0
        assert data["unread_count"] == 0
        assert len(data["items"]) == 0

    @pytest.mark.asyncio
    async def test_list_notifications_unauthorized(self, client: AsyncClient):
        """Test listing notifications without authentication."""
        response = await client.get("/api/notifications/")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_notification_created_on_share(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a notification is created when a project is shared."""
        project_id = await _create_project(client, auth_headers)

        # Get second user's ID
        second_user_id = await _get_user_id(client, second_user_headers)

        # Share the project with second user
        await _share_project(client, project_id, auth_headers, second_user_id)

        # Second user checks notifications
        response = await client.get(
            "/api/notifications/",
            headers=second_user_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert data["unread_count"] >= 1

        # Find the share notification
        share_notifications = [
            n for n in data["items"] if n["type"] == "share"
        ]
        assert len(share_notifications) >= 1
        notif = share_notifications[0]
        assert notif["is_read"] is False
        assert "shared" in notif["title"].lower() or "shared" in (notif["message"] or "").lower()

    @pytest.mark.asyncio
    async def test_notification_created_on_comment(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a notification is created when someone comments on your project."""
        project_id = await _create_project(client, auth_headers)

        # Share project with second user as editor
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id, "editor")

        # Second user comments on the project (should notify owner)
        await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=second_user_headers,
            json={
                "entity_type": "zone",
                "entity_id": "zone1",
                "text": "A comment from the second user",
            },
        )

        # First user (owner) checks notifications
        response = await client.get(
            "/api/notifications/",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        # There should be at least one comment notification for the owner
        comment_notifications = [
            n for n in data["items"] if n["type"] == "comment"
        ]
        assert len(comment_notifications) >= 1

    @pytest.mark.asyncio
    async def test_list_unread_only(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test filtering notifications by unread_only."""
        project_id = await _create_project(client, auth_headers)

        # Trigger a notification for second user via sharing
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id)

        # Mark all as read
        await client.post(
            "/api/notifications/mark-read",
            headers=second_user_headers,
            json={"notification_ids": []},
        )

        # Filter by unread only
        response = await client.get(
            "/api/notifications/",
            headers=second_user_headers,
            params={"unread_only": "true"},
        )

        assert response.status_code == 200
        data = response.json()
        # All items should be unread (or empty since we marked all read)
        for item in data["items"]:
            assert item["is_read"] is False


class TestMarkNotificationsRead:
    """Tests for marking notifications as read."""

    @pytest.mark.asyncio
    async def test_mark_all_read(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test marking all notifications as read with empty notification_ids."""
        project_id = await _create_project(client, auth_headers)

        # Trigger notification for second user
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id)

        # Verify there are unread notifications
        list_response = await client.get(
            "/api/notifications/",
            headers=second_user_headers,
        )
        assert list_response.json()["unread_count"] >= 1

        # Mark all as read (empty list means mark all)
        response = await client.post(
            "/api/notifications/mark-read",
            headers=second_user_headers,
            json={"notification_ids": []},
        )

        assert response.status_code == 200

        # Verify all are now read
        list_response = await client.get(
            "/api/notifications/",
            headers=second_user_headers,
        )
        assert list_response.json()["unread_count"] == 0

    @pytest.mark.asyncio
    async def test_mark_specific_notification_read(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test marking a specific notification as read."""
        project_id = await _create_project(client, auth_headers)

        # Trigger notification for second user
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id)

        # Get the notification ID
        list_response = await client.get(
            "/api/notifications/",
            headers=second_user_headers,
        )
        notifications = list_response.json()["items"]
        assert len(notifications) >= 1
        notification_id = notifications[0]["id"]

        # Mark specific notification as read
        response = await client.post(
            "/api/notifications/mark-read",
            headers=second_user_headers,
            json={"notification_ids": [notification_id]},
        )

        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_mark_read_unauthorized(self, client: AsyncClient):
        """Test marking notifications as read without authentication."""
        response = await client.post(
            "/api/notifications/mark-read",
            json={"notification_ids": []},
        )

        assert response.status_code == 401


class TestDeleteNotification:
    """Tests for deleting notifications."""

    @pytest.mark.asyncio
    async def test_delete_nonexistent_notification(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test deleting a notification that does not exist."""
        response = await client.delete(
            "/api/notifications/nonexistent-id",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_notification(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test successfully deleting a notification."""
        project_id = await _create_project(client, auth_headers)

        # Trigger notification for second user
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id)

        # Get the notification
        list_response = await client.get(
            "/api/notifications/",
            headers=second_user_headers,
        )
        notifications = list_response.json()["items"]
        assert len(notifications) >= 1
        notification_id = notifications[0]["id"]

        # Delete the notification
        response = await client.delete(
            f"/api/notifications/{notification_id}",
            headers=second_user_headers,
        )

        assert response.status_code == 200

        # Verify it's deleted
        list_response = await client.get(
            "/api/notifications/",
            headers=second_user_headers,
        )
        remaining_ids = [n["id"] for n in list_response.json()["items"]]
        assert notification_id not in remaining_ids

    @pytest.mark.asyncio
    async def test_delete_other_users_notification(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that a user cannot delete another user's notification."""
        project_id = await _create_project(client, auth_headers)

        # Trigger notification for second user
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id)

        # Get the notification ID (it belongs to second user)
        list_response = await client.get(
            "/api/notifications/",
            headers=second_user_headers,
        )
        notifications = list_response.json()["items"]
        assert len(notifications) >= 1
        notification_id = notifications[0]["id"]

        # First user tries to delete second user's notification
        response = await client.delete(
            f"/api/notifications/{notification_id}",
            headers=auth_headers,
        )

        # Should fail because the notification does not belong to first user
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_notification_unauthorized(self, client: AsyncClient):
        """Test deleting a notification without authentication."""
        response = await client.delete("/api/notifications/some-id")

        assert response.status_code == 401


class TestNotificationContent:
    """Tests for notification content and metadata."""

    @pytest.mark.asyncio
    async def test_notification_fields(
        self,
        client: AsyncClient,
        auth_headers: dict,
        second_user_headers: dict,
    ):
        """Test that notification response contains all expected fields."""
        project_id = await _create_project(client, auth_headers)

        # Trigger notification
        second_user_id = await _get_user_id(client, second_user_headers)
        await _share_project(client, project_id, auth_headers, second_user_id)

        # Check notification structure
        response = await client.get(
            "/api/notifications/",
            headers=second_user_headers,
        )

        assert response.status_code == 200
        items = response.json()["items"]
        assert len(items) >= 1

        notif = items[0]
        assert "id" in notif
        assert "type" in notif
        assert "title" in notif
        assert "is_read" in notif
        assert "created_at" in notif
        # These may or may not be present depending on notification type
        assert "message" in notif
        assert "link" in notif
        assert "project_id" in notif
        assert "actor_id" in notif
        assert "actor_username" in notif
