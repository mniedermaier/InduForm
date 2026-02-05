"""Tests for Nmap API endpoints."""

import pytest
from unittest.mock import patch, MagicMock
from httpx import AsyncClient


# Minimal valid Nmap XML that the parser can handle
SAMPLE_NMAP_XML = """<?xml version="1.0" encoding="UTF-8"?>
<nmaprun scanner="nmap" args="nmap -sV 10.0.0.0/24" start="1700000000" version="7.94">
<host starttime="1700000000" endtime="1700000010">
<status state="up" reason="syn-ack"/>
<address addr="10.0.0.1" addrtype="ipv4"/>
<hostnames><hostname name="plc-01.local" type="PTR"/></hostnames>
<ports>
<port protocol="tcp" portid="502">
<state state="open" reason="syn-ack"/>
<service name="modbus" product="Schneider Electric" method="probed"/>
</port>
</ports>
</host>
<host starttime="1700000000" endtime="1700000010">
<status state="up" reason="syn-ack"/>
<address addr="10.0.0.2" addrtype="ipv4"/>
<hostnames><hostname name="hmi-01.local" type="PTR"/></hostnames>
<ports>
<port protocol="tcp" portid="5900">
<state state="open" reason="syn-ack"/>
<service name="vnc" method="probed"/>
</port>
</ports>
</host>
</nmaprun>"""


async def _create_project_with_zone(
    client: AsyncClient, auth_headers: dict
) -> tuple[str, str]:
    """Create a project with a zone and return (project_id, zone_id)."""
    response = await client.post(
        "/api/projects/",
        headers=auth_headers,
        json={"name": "Nmap Test Project"},
    )
    project_id = response.json()["id"]

    # Update project with a zone using the full project PUT endpoint
    response = await client.put(
        f"/api/projects/{project_id}",
        headers=auth_headers,
        json={
            "version": "1.0",
            "project": {"name": "Nmap Test Project", "compliance_standards": ["IEC62443"]},
            "zones": [
                {
                    "id": "cell-1",
                    "name": "Cell Zone 1",
                    "type": "cell",
                    "security_level_target": 2,
                    "assets": [],
                },
            ],
            "conduits": [],
        },
    )

    return project_id, "cell-1"


class TestNmapUpload:
    """Tests for Nmap scan upload."""

    @pytest.mark.asyncio
    async def test_upload_scan(self, client: AsyncClient, auth_headers: dict):
        """Test uploading a valid Nmap XML scan."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/nmap/upload",
            headers=auth_headers,
            json={
                "xml_content": SAMPLE_NMAP_XML,
                "filename": "test_scan.xml",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["project_id"] == project_id
        assert data["filename"] == "test_scan.xml"
        assert data["host_count"] == 2
        assert "id" in data

    @pytest.mark.asyncio
    async def test_upload_scan_unauthorized(self, client: AsyncClient):
        """Test uploading without authentication."""
        response = await client.post(
            "/api/projects/some-id/nmap/upload",
            json={"xml_content": SAMPLE_NMAP_XML, "filename": "scan.xml"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_upload_scan_no_access(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test uploading to a project without editor access."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/nmap/upload",
            headers=second_user_headers,
            json={"xml_content": SAMPLE_NMAP_XML, "filename": "scan.xml"},
        )
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_upload_invalid_xml(self, client: AsyncClient, auth_headers: dict):
        """Test uploading invalid XML."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/nmap/upload",
            headers=auth_headers,
            json={"xml_content": "not valid xml", "filename": "bad.xml"},
        )
        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_upload_xxe_rejected(self, client: AsyncClient, auth_headers: dict):
        """Test that XML with DOCTYPE/ENTITY declarations is rejected."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        xxe_xml = '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>'
        response = await client.post(
            f"/api/projects/{project_id}/nmap/upload",
            headers=auth_headers,
            json={"xml_content": xxe_xml, "filename": "xxe.xml"},
        )
        assert response.status_code == 400
        assert "DOCTYPE" in response.json()["detail"] or "ENTITY" in response.json()["detail"]


class TestNmapListScans:
    """Tests for listing Nmap scans."""

    @pytest.mark.asyncio
    async def test_list_scans_empty(self, client: AsyncClient, auth_headers: dict):
        """Test listing scans for a project with no scans."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/nmap/scans",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    async def test_list_scans(self, client: AsyncClient, auth_headers: dict):
        """Test listing scans after uploading."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        # Upload a scan
        await client.post(
            f"/api/projects/{project_id}/nmap/upload",
            headers=auth_headers,
            json={"xml_content": SAMPLE_NMAP_XML, "filename": "scan1.xml"},
        )

        response = await client.get(
            f"/api/projects/{project_id}/nmap/scans",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["filename"] == "scan1.xml"

    @pytest.mark.asyncio
    async def test_list_scans_no_access(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test listing scans without project access."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/nmap/scans",
            headers=second_user_headers,
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_list_scans_pagination(self, client: AsyncClient, auth_headers: dict):
        """Test scan list pagination."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/nmap/scans",
            headers=auth_headers,
            params={"page": 1, "page_size": 5},
        )
        assert response.status_code == 200


class TestNmapGetScan:
    """Tests for getting scan details."""

    @pytest.mark.asyncio
    async def test_get_scan_detail(self, client: AsyncClient, auth_headers: dict):
        """Test getting scan details with hosts."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        # Upload
        upload_resp = await client.post(
            f"/api/projects/{project_id}/nmap/upload",
            headers=auth_headers,
            json={"xml_content": SAMPLE_NMAP_XML, "filename": "detail_scan.xml"},
        )
        scan_id = upload_resp.json()["id"]

        # Get detail
        response = await client.get(
            f"/api/projects/{project_id}/nmap/scans/{scan_id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == scan_id
        assert len(data["hosts"]) == 2

        # Check host structure
        host = data["hosts"][0]
        assert "ip_address" in host
        assert "open_ports" in host
        assert "suggested_asset_type" in host
        assert "suggested_asset_name" in host

    @pytest.mark.asyncio
    async def test_get_scan_not_found(self, client: AsyncClient, auth_headers: dict):
        """Test getting a non-existent scan."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        response = await client.get(
            f"/api/projects/{project_id}/nmap/scans/nonexistent",
            headers=auth_headers,
        )
        assert response.status_code == 404


class TestNmapDeleteScan:
    """Tests for deleting scans."""

    @pytest.mark.asyncio
    async def test_delete_scan(self, client: AsyncClient, auth_headers: dict):
        """Test deleting a scan."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        upload_resp = await client.post(
            f"/api/projects/{project_id}/nmap/upload",
            headers=auth_headers,
            json={"xml_content": SAMPLE_NMAP_XML, "filename": "to_delete.xml"},
        )
        scan_id = upload_resp.json()["id"]

        response = await client.delete(
            f"/api/projects/{project_id}/nmap/scans/{scan_id}",
            headers=auth_headers,
        )
        assert response.status_code == 204

        # Verify it's gone
        response = await client.get(
            f"/api/projects/{project_id}/nmap/scans/{scan_id}",
            headers=auth_headers,
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_scan_not_found(self, client: AsyncClient, auth_headers: dict):
        """Test deleting a non-existent scan."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        response = await client.delete(
            f"/api/projects/{project_id}/nmap/scans/nonexistent",
            headers=auth_headers,
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_scan_no_access(
        self, client: AsyncClient, auth_headers: dict, second_user_headers: dict
    ):
        """Test deleting a scan without editor access."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        upload_resp = await client.post(
            f"/api/projects/{project_id}/nmap/upload",
            headers=auth_headers,
            json={"xml_content": SAMPLE_NMAP_XML, "filename": "protected.xml"},
        )
        scan_id = upload_resp.json()["id"]

        response = await client.delete(
            f"/api/projects/{project_id}/nmap/scans/{scan_id}",
            headers=second_user_headers,
        )
        assert response.status_code == 403


class TestNmapImportHosts:
    """Tests for importing Nmap hosts as assets."""

    @pytest.mark.asyncio
    async def test_import_host(self, client: AsyncClient, auth_headers: dict):
        """Test importing a host as an asset."""
        project_id, zone_id = await _create_project_with_zone(client, auth_headers)

        upload_resp = await client.post(
            f"/api/projects/{project_id}/nmap/upload",
            headers=auth_headers,
            json={"xml_content": SAMPLE_NMAP_XML, "filename": "import_scan.xml"},
        )
        scan_id = upload_resp.json()["id"]

        # Get hosts
        detail_resp = await client.get(
            f"/api/projects/{project_id}/nmap/scans/{scan_id}",
            headers=auth_headers,
        )
        host_id = detail_resp.json()["hosts"][0]["id"]

        # Import
        response = await client.post(
            f"/api/projects/{project_id}/nmap/scans/{scan_id}/import",
            headers=auth_headers,
            json={
                "imports": [
                    {
                        "host_id": host_id,
                        "zone_id": zone_id,
                        "asset_id": "imported-plc-1",
                        "asset_name": "Imported PLC",
                        "asset_type": "plc",
                    }
                ]
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["imported"] == 1
        assert data["errors"] == 0

    @pytest.mark.asyncio
    async def test_import_host_invalid_zone(self, client: AsyncClient, auth_headers: dict):
        """Test importing with an invalid zone ID."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        upload_resp = await client.post(
            f"/api/projects/{project_id}/nmap/upload",
            headers=auth_headers,
            json={"xml_content": SAMPLE_NMAP_XML, "filename": "import_scan2.xml"},
        )
        scan_id = upload_resp.json()["id"]

        detail_resp = await client.get(
            f"/api/projects/{project_id}/nmap/scans/{scan_id}",
            headers=auth_headers,
        )
        host_id = detail_resp.json()["hosts"][0]["id"]

        response = await client.post(
            f"/api/projects/{project_id}/nmap/scans/{scan_id}/import",
            headers=auth_headers,
            json={
                "imports": [
                    {
                        "host_id": host_id,
                        "zone_id": "nonexistent-zone",
                        "asset_id": "asset-1",
                        "asset_name": "Asset",
                        "asset_type": "plc",
                    }
                ]
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["imported"] == 0
        assert data["errors"] == 1

    @pytest.mark.asyncio
    async def test_import_scan_not_found(self, client: AsyncClient, auth_headers: dict):
        """Test importing from a non-existent scan."""
        project_id, _ = await _create_project_with_zone(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/nmap/scans/nonexistent/import",
            headers=auth_headers,
            json={
                "imports": [
                    {
                        "host_id": "h1",
                        "zone_id": "cell-1",
                        "asset_id": "a1",
                        "asset_name": "A",
                        "asset_type": "plc",
                    }
                ]
            },
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_import_duplicate_host(self, client: AsyncClient, auth_headers: dict):
        """Test importing the same host twice."""
        project_id, zone_id = await _create_project_with_zone(client, auth_headers)

        upload_resp = await client.post(
            f"/api/projects/{project_id}/nmap/upload",
            headers=auth_headers,
            json={"xml_content": SAMPLE_NMAP_XML, "filename": "dup_scan.xml"},
        )
        scan_id = upload_resp.json()["id"]

        detail_resp = await client.get(
            f"/api/projects/{project_id}/nmap/scans/{scan_id}",
            headers=auth_headers,
        )
        host_id = detail_resp.json()["hosts"][0]["id"]

        import_data = {
            "imports": [
                {
                    "host_id": host_id,
                    "zone_id": zone_id,
                    "asset_id": "dup-asset-1",
                    "asset_name": "Dup Asset",
                    "asset_type": "plc",
                }
            ]
        }

        # First import
        await client.post(
            f"/api/projects/{project_id}/nmap/scans/{scan_id}/import",
            headers=auth_headers,
            json=import_data,
        )

        # Second import — same host
        import_data["imports"][0]["asset_id"] = "dup-asset-2"
        response = await client.post(
            f"/api/projects/{project_id}/nmap/scans/{scan_id}/import",
            headers=auth_headers,
            json=import_data,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["imported"] == 0
        assert data["errors"] == 1


class TestNmapParser:
    """Tests for the Nmap XML parser utility functions."""

    def test_suggest_asset_type_plc(self):
        from induform.api.nmap.parser import suggest_asset_type, ParsedHost

        host = ParsedHost(
            ip_address="10.0.0.1",
            open_ports=[{"port": 502, "service": "modbus"}],
        )
        assert suggest_asset_type(host) == "plc"

    def test_suggest_asset_type_hmi(self):
        from induform.api.nmap.parser import suggest_asset_type, ParsedHost

        host = ParsedHost(
            ip_address="10.0.0.2",
            open_ports=[{"port": 5900, "service": "vnc"}],
        )
        assert suggest_asset_type(host) == "hmi"

    def test_suggest_asset_type_server_from_os(self):
        from induform.api.nmap.parser import suggest_asset_type, ParsedHost

        host = ParsedHost(
            ip_address="10.0.0.3",
            os_detection="Windows Server 2019",
            open_ports=[],
        )
        assert suggest_asset_type(host) == "server"

    def test_suggest_asset_type_router_from_os(self):
        from induform.api.nmap.parser import suggest_asset_type, ParsedHost

        host = ParsedHost(
            ip_address="10.0.0.4",
            os_detection="Cisco IOS 15.2",
            open_ports=[],
        )
        assert suggest_asset_type(host) == "router"

    def test_suggest_asset_type_firewall_from_os(self):
        from induform.api.nmap.parser import suggest_asset_type, ParsedHost

        host = ParsedHost(
            ip_address="10.0.0.5",
            os_detection="Fortinet FortiGate",
            open_ports=[],
        )
        assert suggest_asset_type(host) == "firewall"

    def test_suggest_asset_type_default(self):
        from induform.api.nmap.parser import suggest_asset_type, ParsedHost

        host = ParsedHost(ip_address="10.0.0.99", open_ports=[])
        assert suggest_asset_type(host) == "other"

    def test_suggest_asset_name_with_hostname(self):
        from induform.api.nmap.parser import suggest_asset_name, ParsedHost

        host = ParsedHost(ip_address="10.0.0.1", hostname="plc-01.local")
        assert suggest_asset_name(host) == "plc-01.local"

    def test_suggest_asset_name_without_hostname(self):
        from induform.api.nmap.parser import suggest_asset_name, ParsedHost

        host = ParsedHost(ip_address="10.0.0.1")
        assert suggest_asset_name(host) == "Host-10-0-0-1"

    def test_parse_rejects_oversized_xml(self):
        from induform.api.nmap.parser import parse_nmap_xml

        big = "x" * (10 * 1024 * 1024 + 1)
        with pytest.raises(ValueError, match="maximum size"):
            parse_nmap_xml(big)
