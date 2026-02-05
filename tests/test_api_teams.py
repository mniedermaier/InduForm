"""Tests for Teams API endpoints."""

import pytest
from httpx import AsyncClient


class TestTeamCRUD:
    """Tests for team CRUD operations."""

    @pytest.mark.asyncio
    async def test_create_team(self, client: AsyncClient, auth_headers: dict):
        """Test creating a new team."""
        response = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Security Team", "description": "OT security team"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Security Team"
        assert data["description"] == "OT security team"
        assert data["member_count"] == 1
        assert data["your_role"] == "owner"
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_team_unauthorized(self, client: AsyncClient):
        """Test creating a team without auth."""
        response = await client.post(
            "/api/teams/",
            json={"name": "No Auth Team"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_create_team_no_name(self, client: AsyncClient, auth_headers: dict):
        """Test creating a team without a name."""
        response = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"description": "No name"},
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_list_teams(self, client: AsyncClient, auth_headers: dict):
        """Test listing teams the user belongs to."""
        # Create two teams
        await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Team Alpha"},
        )
        await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Team Beta"},
        )

        response = await client.get("/api/teams/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        names = {t["name"] for t in data}
        assert "Team Alpha" in names
        assert "Team Beta" in names

    @pytest.mark.asyncio
    async def test_list_teams_empty(self, client: AsyncClient, auth_headers: dict):
        """Test listing teams when user has none."""
        response = await client.get("/api/teams/", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_get_team(self, client: AsyncClient, auth_headers: dict):
        """Test getting a team by ID with members."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Detail Team", "description": "For detail view"},
        )
        team_id = create_resp.json()["id"]

        response = await client.get(f"/api/teams/{team_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Detail Team"
        assert data["description"] == "For detail view"
        assert len(data["members"]) == 1
        assert data["members"][0]["role"] == "owner"

    @pytest.mark.asyncio
    async def test_get_team_not_member(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test getting a team that the user is not a member of."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Private Team"},
        )
        team_id = create_resp.json()["id"]

        response = await client.get(f"/api/teams/{team_id}", headers=second_user_headers)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_team(self, client: AsyncClient, auth_headers: dict):
        """Test updating a team as owner."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Old Name"},
        )
        team_id = create_resp.json()["id"]

        response = await client.put(
            f"/api/teams/{team_id}",
            headers=auth_headers,
            json={"name": "New Name", "description": "Updated description"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Name"
        assert data["description"] == "Updated description"

    @pytest.mark.asyncio
    async def test_update_team_forbidden(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test that non-admin cannot update team."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Owner Team"},
        )
        team_id = create_resp.json()["id"]

        # Get second user's ID and add them as member
        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "member"},
        )

        # Second user tries to update
        response = await client.put(
            f"/api/teams/{team_id}",
            headers=second_user_headers,
            json={"name": "Hacked Name"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_delete_team(self, client: AsyncClient, auth_headers: dict):
        """Test deleting a team as owner."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "To Delete"},
        )
        team_id = create_resp.json()["id"]

        response = await client.delete(f"/api/teams/{team_id}", headers=auth_headers)
        assert response.status_code == 204

        # Verify it's gone
        response = await client.get(f"/api/teams/{team_id}", headers=auth_headers)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_team_non_owner(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test that non-owner cannot delete team."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Protected Team"},
        )
        team_id = create_resp.json()["id"]

        # Add second user as admin
        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "admin"},
        )

        # Admin tries to delete — should fail
        response = await client.delete(f"/api/teams/{team_id}", headers=second_user_headers)
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_delete_team_not_found(self, client: AsyncClient, auth_headers: dict):
        """Test deleting a non-existent team."""
        response = await client.delete("/api/teams/nonexistent", headers=auth_headers)
        assert response.status_code == 404


class TestTeamMembers:
    """Tests for team member management."""

    @pytest.mark.asyncio
    async def test_add_member(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test adding a member to a team."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Member Team"},
        )
        team_id = create_resp.json()["id"]

        # Get second user's ID
        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        response = await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "member"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["user_id"] == second_user_id
        assert data["role"] == "member"

    @pytest.mark.asyncio
    async def test_add_member_as_admin(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test that admin can add members."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Admin Test Team"},
        )
        team_id = create_resp.json()["id"]

        # Get second user ID, add as admin
        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "admin"},
        )

        # Create a third user
        await client.post(
            "/api/auth/register",
            json={
                "email": "third@example.com",
                "username": "thirduser",
                "password": "thirdpassword123",
            },
        )
        login_resp = await client.post(
            "/api/auth/login",
            json={"email_or_username": "thirduser", "password": "thirdpassword123"},
        )
        third_token = login_resp.json()["access_token"]
        third_headers = {"Authorization": f"Bearer {third_token}"}

        me3 = await client.get("/api/auth/me", headers=third_headers)
        third_user_id = me3.json()["id"]

        # Admin adds third user
        response = await client.post(
            f"/api/teams/{team_id}/members",
            headers=second_user_headers,
            json={"user_id": third_user_id, "role": "member"},
        )
        assert response.status_code == 201

    @pytest.mark.asyncio
    async def test_add_member_forbidden_for_member(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test that regular member cannot add members."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Restricted Team"},
        )
        team_id = create_resp.json()["id"]

        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        # Add as regular member
        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "member"},
        )

        # Create a third user
        await client.post(
            "/api/auth/register",
            json={
                "email": "third2@example.com",
                "username": "thirduser2",
                "password": "thirdpassword123",
            },
        )
        login_resp = await client.post(
            "/api/auth/login",
            json={"email_or_username": "thirduser2", "password": "thirdpassword123"},
        )
        third_token = login_resp.json()["access_token"]
        third_headers = {"Authorization": f"Bearer {third_token}"}
        me3 = await client.get("/api/auth/me", headers=third_headers)
        third_user_id = me3.json()["id"]

        # Member tries to add — should fail
        response = await client.post(
            f"/api/teams/{team_id}/members",
            headers=second_user_headers,
            json={"user_id": third_user_id, "role": "member"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_add_duplicate_member(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test adding a user who is already a member."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Dup Team"},
        )
        team_id = create_resp.json()["id"]

        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        # Add once
        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "member"},
        )

        # Add again
        response = await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "member"},
        )
        assert response.status_code == 409

    @pytest.mark.asyncio
    async def test_add_nonexistent_user(self, client: AsyncClient, auth_headers: dict):
        """Test adding a user that doesn't exist."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Ghost Team"},
        )
        team_id = create_resp.json()["id"]

        response = await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": "nonexistent-user-id", "role": "member"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_update_member_role(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test updating a member's role (owner only)."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Role Team"},
        )
        team_id = create_resp.json()["id"]

        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "member"},
        )

        # Promote to admin
        response = await client.put(
            f"/api/teams/{team_id}/members/{second_user_id}",
            headers=auth_headers,
            json={"role": "admin"},
        )
        assert response.status_code == 200
        assert response.json()["role"] == "admin"

        # Demote back to member
        response = await client.put(
            f"/api/teams/{team_id}/members/{second_user_id}",
            headers=auth_headers,
            json={"role": "member"},
        )
        assert response.status_code == 200
        assert response.json()["role"] == "member"

    @pytest.mark.asyncio
    async def test_update_own_role_forbidden(self, client: AsyncClient, auth_headers: dict):
        """Test that owner cannot change their own role."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Self Role Team"},
        )
        team_id = create_resp.json()["id"]

        me_resp = await client.get("/api/auth/me", headers=auth_headers)
        user_id = me_resp.json()["id"]

        response = await client.put(
            f"/api/teams/{team_id}/members/{user_id}",
            headers=auth_headers,
            json={"role": "member"},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_update_role_non_owner_forbidden(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test that non-owner cannot change roles."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Role Auth Team"},
        )
        team_id = create_resp.json()["id"]

        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "admin"},
        )

        # Admin tries to change their own role — should fail (not owner)
        me1_resp = await client.get("/api/auth/me", headers=auth_headers)
        owner_id = me1_resp.json()["id"]

        response = await client.put(
            f"/api/teams/{team_id}/members/{owner_id}",
            headers=second_user_headers,
            json={"role": "member"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_remove_member(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test removing a member from a team."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Remove Team"},
        )
        team_id = create_resp.json()["id"]

        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "member"},
        )

        # Owner removes member
        response = await client.delete(
            f"/api/teams/{team_id}/members/{second_user_id}",
            headers=auth_headers,
        )
        assert response.status_code == 204

        # Verify removed user can no longer see team
        response = await client.get(f"/api/teams/{team_id}", headers=second_user_headers)
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_member_leave_team(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test a member leaving a team (removing self)."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Leave Team"},
        )
        team_id = create_resp.json()["id"]

        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "member"},
        )

        # Member removes self
        response = await client.delete(
            f"/api/teams/{team_id}/members/{second_user_id}",
            headers=second_user_headers,
        )
        assert response.status_code == 204

    @pytest.mark.asyncio
    async def test_owner_cannot_leave(self, client: AsyncClient, auth_headers: dict):
        """Test that owner cannot leave/be removed from the team."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Owner Leave Team"},
        )
        team_id = create_resp.json()["id"]

        me_resp = await client.get("/api/auth/me", headers=auth_headers)
        owner_id = me_resp.json()["id"]

        response = await client.delete(
            f"/api/teams/{team_id}/members/{owner_id}",
            headers=auth_headers,
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_member_cannot_remove_others(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test that a regular member cannot remove other members."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "No Remove Team"},
        )
        team_id = create_resp.json()["id"]

        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "member"},
        )

        # Create third user
        await client.post(
            "/api/auth/register",
            json={
                "email": "third3@example.com",
                "username": "thirduser3",
                "password": "thirdpassword123",
            },
        )
        login_resp = await client.post(
            "/api/auth/login",
            json={"email_or_username": "thirduser3", "password": "thirdpassword123"},
        )
        third_token = login_resp.json()["access_token"]
        third_headers = {"Authorization": f"Bearer {third_token}"}
        me3 = await client.get("/api/auth/me", headers=third_headers)
        third_user_id = me3.json()["id"]

        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": third_user_id, "role": "member"},
        )

        # Second user (member) tries to remove third user
        response = await client.delete(
            f"/api/teams/{team_id}/members/{third_user_id}",
            headers=second_user_headers,
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_cannot_remove_owner(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test that admin cannot remove the owner."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Owner Protect Team"},
        )
        team_id = create_resp.json()["id"]

        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "admin"},
        )

        me1_resp = await client.get("/api/auth/me", headers=auth_headers)
        owner_id = me1_resp.json()["id"]

        # Admin tries to remove owner
        response = await client.delete(
            f"/api/teams/{team_id}/members/{owner_id}",
            headers=second_user_headers,
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_cannot_remove_admin(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test that admin cannot remove another admin."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Admin Protect Team"},
        )
        team_id = create_resp.json()["id"]

        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        # Add second user as admin
        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "admin"},
        )

        # Create third user and add as admin
        await client.post(
            "/api/auth/register",
            json={
                "email": "third4@example.com",
                "username": "thirduser4",
                "password": "thirdpassword123",
            },
        )
        login_resp = await client.post(
            "/api/auth/login",
            json={"email_or_username": "thirduser4", "password": "thirdpassword123"},
        )
        third_token = login_resp.json()["access_token"]
        third_headers = {"Authorization": f"Bearer {third_token}"}
        me3 = await client.get("/api/auth/me", headers=third_headers)
        third_user_id = me3.json()["id"]

        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": third_user_id, "role": "admin"},
        )

        # Second admin tries to remove third admin
        response = await client.delete(
            f"/api/teams/{team_id}/members/{third_user_id}",
            headers=second_user_headers,
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_update_team_as_admin(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test that admin can update team details."""
        create_resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Admin Update Team"},
        )
        team_id = create_resp.json()["id"]

        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "admin"},
        )

        # Admin updates team
        response = await client.put(
            f"/api/teams/{team_id}",
            headers=second_user_headers,
            json={"name": "Admin Updated Name"},
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Admin Updated Name"
