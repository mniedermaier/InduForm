"""Tests for PDF export endpoint."""

import base64
import io

import pytest
from httpx import AsyncClient
from pypdf import PdfReader


# Minimal project data with zones and conduits for testing PDF generation
SAMPLE_PROJECT = {
    "version": "1.0",
    "project": {
        "name": "Test Security Project",
        "description": "A test project for PDF export",
        "compliance_standards": ["IEC62443"],
    },
    "zones": [
        {
            "id": "zone-enterprise",
            "name": "Enterprise Network",
            "type": "enterprise",
            "security_level_target": 1,
            "assets": [
                {
                    "id": "asset-1",
                    "name": "ERP Server",
                    "type": "server",
                    "criticality": 2,
                },
            ],
        },
        {
            "id": "zone-dmz",
            "name": "DMZ",
            "type": "dmz",
            "security_level_target": 2,
            "assets": [],
        },
        {
            "id": "zone-control",
            "name": "Control Network",
            "type": "cell",
            "security_level_target": 3,
            "assets": [
                {
                    "id": "asset-2",
                    "name": "PLC Controller",
                    "type": "plc",
                    "criticality": 4,
                },
            ],
        },
    ],
    "conduits": [
        {
            "id": "conduit-1",
            "from_zone": "zone-enterprise",
            "to_zone": "zone-dmz",
            "requires_inspection": True,
            "flows": [
                {"protocol": "https", "port": 443},
            ],
        },
        {
            "id": "conduit-2",
            "from_zone": "zone-dmz",
            "to_zone": "zone-control",
            "requires_inspection": False,
            "flows": [
                {"protocol": "modbus_tcp", "port": 502},
            ],
        },
    ],
}


async def _create_project_with_data(
    client: AsyncClient, auth_headers: dict
) -> str:
    """Create a project and populate it with zone/conduit data."""
    create_resp = await client.post(
        "/api/projects/",
        headers=auth_headers,
        json={"name": "PDF Export Test"},
    )
    assert create_resp.status_code == 201
    project_id = create_resp.json()["id"]

    # Save full project data
    save_resp = await client.put(
        f"/api/projects/{project_id}",
        headers=auth_headers,
        json=SAMPLE_PROJECT,
    )
    assert save_resp.status_code == 200
    return project_id


def _extract_pdf_text(pdf_base64: str) -> str:
    """Extract all text from a base64-encoded PDF."""
    pdf_bytes = base64.b64decode(pdf_base64)
    reader = PdfReader(io.BytesIO(pdf_bytes))
    text_parts = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            text_parts.append(text)
    return "\n".join(text_parts)


class TestPdfExport:
    """Tests for the PDF export endpoint."""

    @pytest.mark.asyncio
    async def test_pdf_generation_succeeds(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test PDF generation returns 200 with expected keys."""
        project_id = await _create_project_with_data(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/export/pdf",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "pdf_base64" in data
        assert "filename" in data
        assert data["filename"].endswith(".pdf")

        # Verify it's valid base64 that decodes to a PDF
        pdf_bytes = base64.b64decode(data["pdf_base64"])
        assert pdf_bytes[:5] == b"%PDF-"

    @pytest.mark.asyncio
    async def test_pdf_contains_compliance_score(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test PDF contains compliance score in executive summary."""
        project_id = await _create_project_with_data(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/export/pdf",
            headers=auth_headers,
        )

        assert response.status_code == 200
        pdf_text = _extract_pdf_text(response.json()["pdf_base64"])
        assert "Compliance Score" in pdf_text

    @pytest.mark.asyncio
    async def test_pdf_contains_risk_matrix(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test PDF contains risk matrix section."""
        project_id = await _create_project_with_data(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/export/pdf",
            headers=auth_headers,
        )

        assert response.status_code == 200
        pdf_text = _extract_pdf_text(response.json()["pdf_base64"])
        assert "Risk Matrix" in pdf_text

    @pytest.mark.asyncio
    async def test_pdf_contains_topology(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test PDF contains network topology section."""
        project_id = await _create_project_with_data(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/export/pdf",
            headers=auth_headers,
        )

        assert response.status_code == 200
        pdf_text = _extract_pdf_text(response.json()["pdf_base64"])
        assert "Network Topology" in pdf_text

    @pytest.mark.asyncio
    async def test_pdf_contains_attack_path_analysis(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test PDF contains attack path analysis section."""
        project_id = await _create_project_with_data(client, auth_headers)

        response = await client.post(
            f"/api/projects/{project_id}/export/pdf",
            headers=auth_headers,
        )

        assert response.status_code == 200
        pdf_text = _extract_pdf_text(response.json()["pdf_base64"])
        assert "Attack Path Analysis" in pdf_text

    @pytest.mark.asyncio
    async def test_pdf_404_for_nonexistent_project(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test PDF export returns 404 for nonexistent project."""
        response = await client.post(
            "/api/projects/nonexistent-id/export/pdf",
            headers=auth_headers,
        )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_pdf_empty_project(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test PDF generation works for a project with no zones."""
        create_resp = await client.post(
            "/api/projects/",
            headers=auth_headers,
            json={"name": "Empty Project"},
        )
        project_id = create_resp.json()["id"]

        response = await client.post(
            f"/api/projects/{project_id}/export/pdf",
            headers=auth_headers,
        )

        assert response.status_code == 200
        data = response.json()
        assert "pdf_base64" in data
        pdf_bytes = base64.b64decode(data["pdf_base64"])
        assert pdf_bytes[:5] == b"%PDF-"
