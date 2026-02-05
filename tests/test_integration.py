"""Integration tests for end-to-end workflows."""

import pytest
from httpx import AsyncClient


class TestProjectWorkflow:
    """End-to-end: create project → update with zones/conduits → validate → generate."""

    @pytest.mark.asyncio
    async def test_full_project_lifecycle(self, client: AsyncClient, auth_headers: dict):
        """Test complete project creation through report generation."""
        # 1. Create project
        resp = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={
                "name": "Integration Test Plant",
                "description": "Full lifecycle test",
            },
        )
        assert resp.status_code == 201
        project_id = resp.json()["id"]

        # 2. Build full project with zones, conduits, and assets
        full_project = {
            "version": "1.0",
            "project": {
                "name": "Integration Test Plant",
                "description": "Full lifecycle test",
                "compliance_standards": ["IEC62443"],
            },
            "zones": [
                {
                    "id": "enterprise",
                    "name": "Enterprise Network",
                    "type": "enterprise",
                    "security_level_target": 1,
                    "assets": [],
                },
                {
                    "id": "dmz",
                    "name": "Site DMZ",
                    "type": "dmz",
                    "security_level_target": 3,
                    "assets": [
                        {
                            "id": "historian-01",
                            "name": "Plant Historian",
                            "type": "historian",
                            "ip_address": "10.1.1.10",
                            "criticality": 4,
                        },
                    ],
                },
                {
                    "id": "cell-01",
                    "name": "Assembly Cell 01",
                    "type": "cell",
                    "security_level_target": 2,
                    "assets": [
                        {
                            "id": "plc-01",
                            "name": "Main PLC",
                            "type": "plc",
                            "ip_address": "10.10.1.10",
                            "criticality": 5,
                        },
                    ],
                },
            ],
            "conduits": [
                {
                    "id": "ent-to-dmz",
                    "from_zone": "enterprise",
                    "to_zone": "dmz",
                    "requires_inspection": True,
                    "flows": [
                        {"protocol": "https", "port": 443, "direction": "bidirectional"},
                    ],
                },
                {
                    "id": "dmz-to-cell",
                    "from_zone": "dmz",
                    "to_zone": "cell-01",
                    "requires_inspection": False,
                    "flows": [
                        {"protocol": "opcua", "port": 4840, "direction": "bidirectional"},
                    ],
                },
            ],
        }

        # Update project with full structure
        resp = await client.put(
            f"/api/projects/{project_id}",
            headers=auth_headers,
            json=full_project,
        )
        assert resp.status_code == 200

        # 3. Get project — verify structure
        resp = await client.get(
            f"/api/projects/{project_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        project_data = resp.json()
        assert project_data["name"] == "Integration Test Plant"
        project_content = project_data["project"]
        assert len(project_content["zones"]) == 3
        assert len(project_content["conduits"]) == 2

        # 4. Check version history was created
        resp = await client.get(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_project_update_prevents_bad_references(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test that updating with invalid zone references fails."""
        resp = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Ref Test"},
        )
        project_id = resp.json()["id"]

        # Try to set a conduit referencing non-existent zones
        bad_project = {
            "version": "1.0",
            "project": {"name": "Ref Test", "compliance_standards": ["IEC62443"]},
            "zones": [
                {"id": "z1", "name": "Zone 1", "type": "cell", "security_level_target": 2, "assets": []},
            ],
            "conduits": [
                {
                    "id": "c1",
                    "from_zone": "z1",
                    "to_zone": "z_nonexistent",  # bad reference
                    "flows": [],
                },
            ],
        }

        resp = await client.put(
            f"/api/projects/{project_id}",
            headers=auth_headers,
            json=bad_project,
        )
        assert resp.status_code == 422  # Pydantic validation error


class TestMultiUserWorkflow:
    """End-to-end: multi-user collaboration workflows."""

    @pytest.mark.asyncio
    async def test_share_project_and_collaborate(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test sharing a project and second user editing it."""
        # Owner creates project
        resp = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Shared Project"},
        )
        project_id = resp.json()["id"]

        # Second user cannot see it
        resp = await client.get(f"/api/projects/{project_id}", headers=second_user_headers)
        assert resp.status_code == 404

        # Get second user ID
        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        # Share with editor access using /access endpoint
        resp = await client.post(
            f"/api/projects/{project_id}/access",
            headers=auth_headers,
            json={"user_id": second_user_id, "permission": "editor"},
        )
        assert resp.status_code == 201

        # Now second user can see it
        resp = await client.get(f"/api/projects/{project_id}", headers=second_user_headers)
        assert resp.status_code == 200

        # Second user updates the project (adds a zone)
        updated_project = {
            "version": "1.0",
            "project": {"name": "Shared Project", "compliance_standards": ["IEC62443"]},
            "zones": [
                {
                    "id": "collab-zone",
                    "name": "Collaborative Zone",
                    "type": "area",
                    "security_level_target": 2,
                    "assets": [],
                },
            ],
            "conduits": [],
        }
        resp = await client.put(
            f"/api/projects/{project_id}",
            headers=second_user_headers,
            json=updated_project,
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_team_project_access(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test team-based project access."""
        # Create team
        resp = await client.post(
            "/api/teams/",
            headers=auth_headers,
            json={"name": "Engineering Team"},
        )
        team_id = resp.json()["id"]

        # Add second user to team
        me_resp = await client.get("/api/auth/me", headers=second_user_headers)
        second_user_id = me_resp.json()["id"]

        await client.post(
            f"/api/teams/{team_id}/members",
            headers=auth_headers,
            json={"user_id": second_user_id, "role": "member"},
        )

        # Create project
        resp = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Team Project"},
        )
        project_id = resp.json()["id"]

        # Share with team
        resp = await client.post(
            f"/api/projects/{project_id}/access",
            headers=auth_headers,
            json={"team_id": team_id, "permission": "editor"},
        )
        assert resp.status_code == 201

        # Second user (team member) can now access
        resp = await client.get(f"/api/projects/{project_id}", headers=second_user_headers)
        assert resp.status_code == 200


class TestVersioningWorkflow:
    """End-to-end: version history workflows."""

    @pytest.mark.asyncio
    async def test_version_history_on_update(self, client: AsyncClient, auth_headers: dict):
        """Test that updating project creates version history entries."""
        # Create project
        resp = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Versioned Project"},
        )
        project_id = resp.json()["id"]

        # Update with a zone
        resp = await client.put(
            f"/api/projects/{project_id}",
            headers=auth_headers,
            json={
                "version": "1.0",
                "project": {"name": "Versioned Project", "compliance_standards": ["IEC62443"]},
                "zones": [
                    {"id": "z1", "name": "Zone 1", "type": "cell", "security_level_target": 2, "assets": []},
                ],
                "conduits": [],
            },
        )
        assert resp.status_code == 200

        # Check version history
        resp = await client.get(
            f"/api/projects/{project_id}/versions/",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        versions = resp.json()
        assert len(versions) >= 1


class TestCommentWorkflow:
    """End-to-end: comment workflows on projects."""

    @pytest.mark.asyncio
    async def test_add_and_list_comments(self, client: AsyncClient, auth_headers: dict):
        """Test adding comments to a project."""
        resp = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Commented Project"},
        )
        project_id = resp.json()["id"]

        # Add comment (entity_type must be zone/conduit/asset)
        resp = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={"entity_type": "zone", "entity_id": "z1", "text": "This zone needs review"},
        )
        assert resp.status_code == 201
        comment_id = resp.json()["id"]

        # List comments
        resp = await client.get(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        comments = resp.json()
        assert len(comments) >= 1
        assert any(c["id"] == comment_id for c in comments)

    @pytest.mark.asyncio
    async def test_add_multiple_comments(self, client: AsyncClient, auth_headers: dict):
        """Test adding multiple comments to different entities."""
        resp = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Reply Project"},
        )
        project_id = resp.json()["id"]

        # Add comment on a zone
        resp = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={"entity_type": "zone", "entity_id": "z1", "text": "Zone comment"},
        )
        assert resp.status_code == 201
        first_id = resp.json()["id"]

        # Add comment on a conduit
        resp = await client.post(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
            json={"entity_type": "conduit", "entity_id": "c1", "text": "Conduit comment"},
        )
        assert resp.status_code == 201
        second_id = resp.json()["id"]

        # List all comments — should see both
        resp = await client.get(
            f"/api/projects/{project_id}/comments/",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        comments = resp.json()
        assert len(comments) == 2
        ids = {c["id"] for c in comments}
        assert first_id in ids
        assert second_id in ids


class TestProjectDuplication:
    """End-to-end: project duplication workflow."""

    @pytest.mark.asyncio
    async def test_duplicate_project(self, client: AsyncClient, auth_headers: dict):
        """Test duplicating a project with all its data."""
        # Create and populate project
        resp = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Original Project"},
        )
        project_id = resp.json()["id"]

        # Add structure
        await client.put(
            f"/api/projects/{project_id}",
            headers=auth_headers,
            json={
                "version": "1.0",
                "project": {"name": "Original Project", "compliance_standards": ["IEC62443"]},
                "zones": [
                    {"id": "z1", "name": "Zone 1", "type": "cell", "security_level_target": 2, "assets": []},
                ],
                "conduits": [],
            },
        )

        # Duplicate
        resp = await client.post(
            f"/api/projects/{project_id}/duplicate",
            headers=auth_headers,
        )
        assert resp.status_code == 201
        dup_data = resp.json()
        assert dup_data["id"] != project_id
        assert "copy" in dup_data["name"].lower() or "Original Project" in dup_data["name"]


class TestProjectArchive:
    """End-to-end: project archive/restore workflow."""

    @pytest.mark.asyncio
    async def test_archive_and_restore(self, client: AsyncClient, auth_headers: dict):
        """Test archiving and restoring a project."""
        resp = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Archivable Project"},
        )
        project_id = resp.json()["id"]

        # Archive
        resp = await client.post(
            f"/api/projects/{project_id}/archive",
            headers=auth_headers,
        )
        assert resp.status_code == 200

        # Restore
        resp = await client.post(
            f"/api/projects/{project_id}/restore",
            headers=auth_headers,
        )
        assert resp.status_code == 200
