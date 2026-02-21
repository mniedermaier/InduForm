"""CVE lookup utilities for OT asset vulnerability tracking.

Queries the NIST NVD API v2.0 for CVE details and vulnerability suggestions.
Supports optional API key via INDUFORM_NVD_API_KEY env var for higher rate limits.
"""

import asyncio
import logging
import os
import re
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Rate limiting: NVD allows ~5 req/30s without key, ~50 req/30s with key.
# We enforce per-request delays to stay well within limits.
_rate_lock = asyncio.Lock()
_last_request_time: float = 0.0
_NVD_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0"
_REQUEST_TIMEOUT = 30.0


def _rate_delay() -> float:
    """Return minimum seconds between NVD API requests."""
    if os.environ.get("INDUFORM_NVD_API_KEY"):
        return 0.7
    return 6.5


def _get_headers() -> dict[str, str]:
    """Build request headers, including API key if configured."""
    headers: dict[str, str] = {}
    api_key = os.environ.get("INDUFORM_NVD_API_KEY")
    if api_key:
        headers["apiKey"] = api_key
    return headers


async def _throttled_get(url: str, params: dict[str, str]) -> httpx.Response | None:
    """Make a rate-throttled GET request to the NVD API."""
    global _last_request_time

    async with _rate_lock:
        now = time.monotonic()
        delay = _rate_delay()
        elapsed = now - _last_request_time
        if elapsed < delay:
            await asyncio.sleep(delay - elapsed)
        _last_request_time = time.monotonic()

    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            response = await client.get(url, params=params, headers=_get_headers())
            if response.status_code != 200:
                logger.warning("NVD API returned status %d for %s", response.status_code, url)
                return None
            return response
    except (httpx.HTTPError, OSError) as exc:
        logger.warning("NVD API request failed: %s", exc)
        return None


async def lookup_cve(cve_id: str) -> dict[str, Any] | None:
    """Look up a CVE by its ID using the NVD API v2.0.

    Args:
        cve_id: CVE identifier, e.g. "CVE-2024-12345"

    Returns:
        Dict with cve_id, title, description, severity, cvss_score,
        published_date, and references — or None on error/not found.
    """
    if not re.match(r"^CVE-\d{4}-\d{4,}$", cve_id):
        return None

    response = await _throttled_get(_NVD_BASE, {"cveId": cve_id})
    if response is None:
        return None

    try:
        data = response.json()
    except Exception:
        logger.warning("NVD API returned malformed JSON for %s", cve_id)
        return None

    vulnerabilities = data.get("vulnerabilities", [])
    if not vulnerabilities:
        return None

    cve_data = vulnerabilities[0].get("cve", {})

    # Description (prefer English)
    description = ""
    for desc in cve_data.get("descriptions", []):
        if desc.get("lang") == "en":
            description = desc.get("value", "")
            break

    # CVSS v3.1 score, falling back to v3.0
    cvss_score: float | None = None
    severity = "unknown"
    metrics = cve_data.get("metrics", {})
    for version_key in ("cvssMetricV31", "cvssMetricV30"):
        metric_list = metrics.get(version_key, [])
        if metric_list:
            cvss_data = metric_list[0].get("cvssData", {})
            cvss_score = cvss_data.get("baseScore")
            severity = cvss_data.get("baseSeverity", "unknown").lower()
            break

    # References
    references = [ref.get("url") for ref in cve_data.get("references", []) if ref.get("url")]

    # Published date
    published = cve_data.get("published", "")

    # Title: first sentence of description, capped at 120 chars
    title = description.split(". ")[0][:120] if description else cve_id

    return {
        "cve_id": cve_id,
        "title": title,
        "description": description,
        "severity": severity,
        "cvss_score": cvss_score,
        "published_date": published,
        "references": references,
    }


async def suggest_vulnerabilities(
    vendor: str,
    model: str,
    firmware: str,
) -> list[str]:
    """Suggest CVE IDs for an OT device by searching NVD with keyword matching.

    Args:
        vendor: Device vendor/manufacturer name
        model: Device model number
        firmware: Firmware version string

    Returns:
        List of CVE IDs matching the vendor+model search, or empty list on error.
    """
    vendor_clean = vendor.strip()
    model_clean = model.strip()
    if not vendor_clean:
        return []

    keyword = f"{vendor_clean} {model_clean}".strip()

    response = await _throttled_get(_NVD_BASE, {"keywordSearch": keyword, "resultsPerPage": "20"})
    if response is None:
        return []

    try:
        data = response.json()
    except Exception:
        logger.warning("NVD API returned malformed JSON for keyword search: %s", keyword)
        return []

    cve_ids: list[str] = []
    for vuln in data.get("vulnerabilities", []):
        cve_id = vuln.get("cve", {}).get("id")
        if cve_id:
            cve_ids.append(cve_id)

    return cve_ids


async def scan_asset_cves(
    vendor: str,
    model: str,
    firmware: str,
) -> list[dict[str, Any]]:
    """Scan for CVEs affecting a specific asset.

    Calls suggest_vulnerabilities() to find candidate CVE IDs, then
    looks up each one for full details.

    Args:
        vendor: Device vendor/manufacturer name
        model: Device model number
        firmware: Firmware version string

    Returns:
        List of enriched CVE dicts from lookup_cve().
    """
    cve_ids = await suggest_vulnerabilities(vendor, model, firmware)
    results: list[dict[str, Any]] = []
    for cve_id in cve_ids:
        detail = await lookup_cve(cve_id)
        if detail:
            results.append(detail)
    return results
