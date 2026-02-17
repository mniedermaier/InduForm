"""Tests for vulnerability CRUD API endpoints."""

import os

os.environ["INDUFORM_RATE_LIMIT_ENABLED"] = "false"

import pytest
from httpx import AsyncClient


# Sample project data with a zone containing an asset
SAMPLE_PROJECT = {
    "version": "1.0",
    "project": {
        "name": "Vuln Test Project",
        "compliance_standards": ["IEC62443"],
    },
    "zones": [
        {
            "id": "test-zone",
            "name": "Test Zone",
            "type": "cell",
            "security_level_target": 3,
            "assets": [
                {
                    "id": "test-asset",
                    "name": "Test PLC",
                    "type": "plc",
                    "criticality": 4,
                    "vendor": "Siemens",
                    "model": "S7-1500",
                },
            ],
        },
    ],
    "conduits": [],
}


async def create_project_with_asset(
    client: AsyncClient, auth_headers: dict
) -> str:
    """Create a project with a zone and asset, return the project ID."""
    create_resp = await client.post(
        "/api/projects/",
        headers=auth_headers,
        json={"name": "Vuln Test Project"},
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["id"]

    save_resp = await client.put(
        f"/api/projects/{project_id}",
        headers=auth_headers,
        json=SAMPLE_PROJECT,
    )
    assert save_resp.status_code == 200
    return project_id


async def add_vulnerability(
    client: AsyncClient,
    auth_headers: dict,
    project_id: str,
    zone_id: str = "test-zone",
    asset_id: str = "test-asset",
    cve_id: str = "CVE-2024-12345",
    title: str = "Test Vulnerability",
    severity: str = "high",
    cvss_score: float = 7.5,
) -> dict:
    """Add a vulnerability to an asset and return the response data."""
    resp = await client.post(
        f"/api/projects/{project_id}/zones/{zone_id}/assets/{asset_id}/vulnerabilities",
        headers=auth_headers,
        json={
            "cve_id": cve_id,
            "title": title,
            "severity": severity,
            "cvss_score": cvss_score,
            "status": "open",
        },
    )
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
    return resp.json()


class TestVulnerabilityCRUD:
    """Tests for vulnerability CRUD operations."""

    @pytest.mark.asyncio
    async def test_list_vulnerabilities_empty(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET /api/projects/{id}/vulnerabilities returns empty list for new project."""
        project_id = await create_project_with_asset(client, auth_headers)

        resp = await client.get(
            f"/api/projects/{project_id}/vulnerabilities",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_add_vulnerability(
        self, client: AsyncClient, auth_headers: dict
    ):
        """POST vulnerability to an asset returns 201 with correct data."""
        project_id = await create_project_with_asset(client, auth_headers)
        vuln = await add_vulnerability(client, auth_headers, project_id)

        assert vuln["cve_id"] == "CVE-2024-12345"
        assert vuln["title"] == "Test Vulnerability"
        assert vuln["severity"] == "high"
        assert vuln["cvss_score"] == 7.5
        assert vuln["status"] == "open"
        assert vuln["asset_name"] == "Test PLC"
        assert vuln["zone_name"] == "Test Zone"
        assert "id" in vuln

    @pytest.mark.asyncio
    async def test_vulnerability_summary(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET /api/projects/{id}/vulnerability-summary returns correct counts."""
        project_id = await create_project_with_asset(client, auth_headers)

        # Add multiple vulnerabilities with different severities
        await add_vulnerability(
            client, auth_headers, project_id,
            cve_id="CVE-2024-00001", title="Critical Vuln", severity="critical",
        )
        await add_vulnerability(
            client, auth_headers, project_id,
            cve_id="CVE-2024-00002", title="High Vuln", severity="high",
        )
        await add_vulnerability(
            client, auth_headers, project_id,
            cve_id="CVE-2024-00003", title="Medium Vuln", severity="medium",
        )

        resp = await client.get(
            f"/api/projects/{project_id}/vulnerability-summary",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert data["by_severity"]["critical"] == 1
        assert data["by_severity"]["high"] == 1
        assert data["by_severity"]["medium"] == 1
        assert data["by_severity"]["low"] == 0
        assert data["by_status"]["open"] == 3
        assert len(data["top_affected_assets"]) == 1

    @pytest.mark.asyncio
    async def test_update_vulnerability(
        self, client: AsyncClient, auth_headers: dict
    ):
        """PATCH /api/projects/{id}/vulnerabilities/{id} updates status."""
        project_id = await create_project_with_asset(client, auth_headers)
        vuln = await add_vulnerability(client, auth_headers, project_id)
        vuln_id = vuln["id"]

        resp = await client.patch(
            f"/api/projects/{project_id}/vulnerabilities/{vuln_id}",
            headers=auth_headers,
            json={
                "status": "mitigated",
                "mitigation_notes": "Patched firmware to v2.1",
            },
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "mitigated"
        assert data["mitigation_notes"] == "Patched firmware to v2.1"

    @pytest.mark.asyncio
    async def test_delete_vulnerability(
        self, client: AsyncClient, auth_headers: dict
    ):
        """DELETE /api/projects/{id}/vulnerabilities/{id} removes it."""
        project_id = await create_project_with_asset(client, auth_headers)
        vuln = await add_vulnerability(client, auth_headers, project_id)
        vuln_id = vuln["id"]

        # Delete the vulnerability
        resp = await client.delete(
            f"/api/projects/{project_id}/vulnerabilities/{vuln_id}",
            headers=auth_headers,
        )
        assert resp.status_code == 204

        # Verify it's gone by listing
        list_resp = await client.get(
            f"/api/projects/{project_id}/vulnerabilities",
            headers=auth_headers,
        )
        assert list_resp.status_code == 200
        assert list_resp.json() == []

    @pytest.mark.asyncio
    async def test_vulnerability_requires_auth(self, client: AsyncClient, auth_headers: dict):
        """Requests without auth return 401."""
        # Create project with auth first so it exists
        project_id = await create_project_with_asset(client, auth_headers)

        # Try listing without auth
        resp = await client.get(
            f"/api/projects/{project_id}/vulnerabilities",
        )
        assert resp.status_code == 401

        # Try creating without auth
        resp = await client.post(
            f"/api/projects/{project_id}/zones/test-zone/assets/test-asset/vulnerabilities",
            json={
                "cve_id": "CVE-2024-99999",
                "title": "Unauth Vuln",
                "severity": "low",
            },
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_vulnerabilities_after_adding(
        self, client: AsyncClient, auth_headers: dict
    ):
        """GET vulnerabilities returns added vulns."""
        project_id = await create_project_with_asset(client, auth_headers)
        await add_vulnerability(
            client, auth_headers, project_id,
            cve_id="CVE-2024-11111", title="First Vuln", severity="high",
        )
        await add_vulnerability(
            client, auth_headers, project_id,
            cve_id="CVE-2024-22222", title="Second Vuln", severity="medium",
        )

        resp = await client.get(
            f"/api/projects/{project_id}/vulnerabilities",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        vulns = resp.json()
        assert len(vulns) == 2
        cve_ids = {v["cve_id"] for v in vulns}
        assert cve_ids == {"CVE-2024-11111", "CVE-2024-22222"}

    @pytest.mark.asyncio
    async def test_vulnerability_summary_empty(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Vulnerability summary for a project with no vulns returns zeros."""
        project_id = await create_project_with_asset(client, auth_headers)

        resp = await client.get(
            f"/api/projects/{project_id}/vulnerability-summary",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["by_severity"]["critical"] == 0
        assert data["by_status"]["open"] == 0
        assert data["top_affected_assets"] == []
