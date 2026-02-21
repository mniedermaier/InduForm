"""Risk scoring engine for IEC 62443 security zones."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, Field

from induform.models.project import Project


class RiskLevel(StrEnum):
    """Risk level classification."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    MINIMAL = "minimal"


class VulnInfo(BaseModel):
    """Vulnerability info used for risk scoring."""

    cve_id: str
    severity: str
    cvss_score: float | None = None
    status: str = "open"


class RiskFactors(BaseModel):
    """Breakdown of risk factors for a zone."""

    sl_base_risk: float = Field(
        ...,
        description="Base risk from Security Level Target (lower SL = higher risk)",
    )
    asset_criticality_risk: float = Field(
        ...,
        description="Risk from asset criticality values",
    )
    exposure_risk: float = Field(
        ...,
        description="Risk from number of connected conduits",
    )
    sl_gap_risk: float = Field(
        ...,
        description="Risk from SL differences with connected zones",
    )
    vulnerability_risk: float = Field(
        default=0.0,
        description="Risk from known vulnerabilities, mitigated by zone SL",
    )

    model_config = {"extra": "forbid"}


class ZoneRisk(BaseModel):
    """Risk assessment for a single zone."""

    score: float = Field(..., ge=0, le=100, description="Risk score (0-100)")
    level: RiskLevel = Field(..., description="Risk level classification")
    factors: RiskFactors = Field(..., description="Breakdown of risk factors")

    model_config = {"extra": "forbid"}


class RiskAssessment(BaseModel):
    """Complete risk assessment for a project."""

    zone_risks: dict[str, ZoneRisk] = Field(
        ...,
        description="Risk assessment for each zone, keyed by zone_id",
    )
    overall_score: float = Field(
        ...,
        ge=0,
        le=100,
        description="Weighted average risk score across all zones",
    )
    overall_level: RiskLevel = Field(
        ...,
        description="Overall risk level classification",
    )
    recommendations: list[str] = Field(
        default_factory=list,
        description="Risk mitigation recommendations",
    )

    model_config = {"extra": "forbid"}


# Risk weights for calculating overall score
RISK_FACTOR_WEIGHTS = {
    "sl_base": 0.25,
    "asset_criticality": 0.20,
    "exposure": 0.15,
    "sl_gap": 0.20,
    "vulnerability": 0.20,
}

# Base risk scores for Security Level Targets
SL_BASE_RISK = {
    1: 40,
    2: 30,
    3: 20,
    4: 10,
}

# Default asset criticality if not set
DEFAULT_ASSET_CRITICALITY = 5

# Maximum asset criticality value
MAX_ASSET_CRITICALITY = 10

# SL mitigation factor: higher SL zones mitigate vulnerability impact more
SL_MITIGATION_FACTOR = {1: 1.0, 2: 0.85, 3: 0.65, 4: 0.45}

# Status discount: how much each vulnerability status reduces its risk
VULN_STATUS_DISCOUNT = {
    "open": 1.0,
    "accepted": 0.75,
    "mitigated": 0.3,
    "false_positive": 0.0,
}

# Severity base score: used when cvss_score is not available
SEVERITY_BASE_SCORE = {
    "critical": 9.5,
    "high": 7.5,
    "medium": 5.0,
    "low": 2.5,
}


def classify_risk_level(score: float) -> RiskLevel:
    """Classify a risk score into a risk level.

    Args:
        score: Risk score from 0-100

    Returns:
        RiskLevel classification
    """
    if score >= 80:
        return RiskLevel.CRITICAL
    elif score >= 60:
        return RiskLevel.HIGH
    elif score >= 40:
        return RiskLevel.MEDIUM
    elif score >= 20:
        return RiskLevel.LOW
    else:
        return RiskLevel.MINIMAL


def calculate_zone_risk(
    project: Project,
    zone_id: str,
    zone_vulns: list[VulnInfo] | None = None,
) -> ZoneRisk:
    """Calculate risk score for a single zone.

    Args:
        project: The project containing zones and conduits
        zone_id: ID of the zone to assess
        zone_vulns: Optional list of vulnerabilities associated with this zone

    Returns:
        ZoneRisk with score, level, and factors breakdown
    """
    zone = project.get_zone(zone_id)
    if not zone:
        raise ValueError(f"Zone not found: {zone_id}")

    # 1. SL Base Risk: lower SL = higher base risk
    sl_base_risk = float(SL_BASE_RISK.get(zone.security_level_target, 40))

    # 2. Asset Criticality Risk: sum of asset criticality values, normalized
    # Default criticality is 5 if not set (asset model uses 3, but spec says 5)
    # The asset model has criticality 1-5, we map to 0-10 scale (* 2)
    total_criticality = 0.0
    if zone.assets:
        for asset in zone.assets:
            # Asset criticality is 1-5, map to contribute to risk
            # Higher criticality = higher risk
            criticality_value = getattr(asset, "criticality", 3)
            total_criticality += criticality_value * 2  # Scale to 10
        # Normalize: average criticality * 10 to get 0-100 scale contribution
        # Then scale to reasonable range (0-40 points max contribution)
        avg_criticality = total_criticality / len(zone.assets)
        asset_criticality_risk = min(avg_criticality * 4, 40)
    else:
        # No assets = use default criticality
        asset_criticality_risk = DEFAULT_ASSET_CRITICALITY * 2  # 10 points

    # 3. Exposure Risk: number of conduits connected to the zone
    conduits = project.get_conduits_for_zone(zone_id)
    exposure_count = len(conduits)
    # More conduits = higher risk, capped at 40 points
    # 0 conduits = 0 risk, each conduit adds 8 points up to max of 40
    exposure_risk = min(exposure_count * 8.0, 40.0)

    # 4. SL Gap Risk: difference between zone's SL-T and connected zones' SL-T
    sl_gap_risk = 0.0
    if conduits:
        total_gap = 0
        for conduit in conduits:
            # Get the connected zone
            connected_zone_id = (
                conduit.to_zone if conduit.from_zone == zone_id else conduit.from_zone
            )
            connected_zone = project.get_zone(connected_zone_id)
            if connected_zone:
                gap = abs(zone.security_level_target - connected_zone.security_level_target)
                total_gap += gap

        # Average gap * 10 points per level of difference, capped at 40
        avg_gap = total_gap / len(conduits)
        sl_gap_risk = min(avg_gap * 10.0, 40.0)

    # 5. Vulnerability Risk: CVEs weighted by CVSS, mitigated by zone SL
    vulnerability_risk = 0.0
    if zone_vulns:
        sl_mitigation = SL_MITIGATION_FACTOR.get(zone.security_level_target, 1.0)
        effective_scores: list[float] = []
        for v in zone_vulns:
            cvss = (
                v.cvss_score
                if v.cvss_score is not None
                else SEVERITY_BASE_SCORE.get(v.severity, 5.0)
            )
            status_discount = VULN_STATUS_DISCOUNT.get(v.status, 1.0)
            effective_scores.append(cvss * sl_mitigation * status_discount)

        active = [s for s in effective_scores if s > 0]
        if active:
            avg_effective = sum(active) / len(active)
            # Scale avg (0-10) to 0-40 range
            vulnerability_risk = avg_effective * 4.0
            # Volume boost: +2 pts per extra vuln beyond the first, capped at 10
            volume_boost = min((len(active) - 1) * 2.0, 10.0)
            vulnerability_risk = min(vulnerability_risk + volume_boost, 40.0)

    # Calculate weighted total score
    weighted_score = (
        sl_base_risk * RISK_FACTOR_WEIGHTS["sl_base"]
        + asset_criticality_risk * RISK_FACTOR_WEIGHTS["asset_criticality"]
        + exposure_risk * RISK_FACTOR_WEIGHTS["exposure"]
        + sl_gap_risk * RISK_FACTOR_WEIGHTS["sl_gap"]
        + vulnerability_risk * RISK_FACTOR_WEIGHTS["vulnerability"]
    )

    # Ensure score is in valid range
    final_score = min(max(weighted_score, 0), 100)

    factors = RiskFactors(
        sl_base_risk=sl_base_risk,
        asset_criticality_risk=asset_criticality_risk,
        exposure_risk=exposure_risk,
        sl_gap_risk=sl_gap_risk,
        vulnerability_risk=vulnerability_risk,
    )

    return ZoneRisk(
        score=round(final_score, 2),
        level=classify_risk_level(final_score),
        factors=factors,
    )


def generate_recommendations(
    project: Project,
    zone_risks: dict[str, ZoneRisk],
    vulnerability_data: dict[str, list[VulnInfo]] | None = None,
) -> list[str]:
    """Generate risk mitigation recommendations based on assessment.

    Args:
        project: The project being assessed
        zone_risks: Risk assessment for each zone
        vulnerability_data: Optional vulnerability data keyed by zone_id

    Returns:
        List of recommendation strings
    """
    recommendations = []

    # Check for critical/high risk zones
    critical_zones = [
        zone_id for zone_id, risk in zone_risks.items() if risk.level == RiskLevel.CRITICAL
    ]
    high_zones = [zone_id for zone_id, risk in zone_risks.items() if risk.level == RiskLevel.HIGH]

    if critical_zones:
        recommendations.append(
            "URGENT: Zones with critical risk level require"
            f" immediate attention: {', '.join(critical_zones)}"
        )

    if high_zones:
        recommendations.append(
            "Zones with high risk level should be prioritized for"
            f" security improvements: {', '.join(high_zones)}"
        )

    # Check for SL-1 zones with high exposure
    for zone_id, risk in zone_risks.items():
        zone = project.get_zone(zone_id)
        if zone and zone.security_level_target == 1:
            conduits = project.get_conduits_for_zone(zone_id)
            if len(conduits) >= 3:
                recommendations.append(
                    f"Zone '{zone_id}' has SL-T=1 with {len(conduits)} connections. "
                    "Consider increasing the security level or reducing connectivity."
                )

    # Check for large SL gaps
    for conduit in project.conduits:
        from_zone = project.get_zone(conduit.from_zone)
        to_zone = project.get_zone(conduit.to_zone)
        if from_zone and to_zone:
            gap = abs(from_zone.security_level_target - to_zone.security_level_target)
            if gap >= 2:
                recommendations.append(
                    f"Conduit '{conduit.id}' connects zones with SL gap of {gap}. "
                    "Consider adding a DMZ or intermediate zone."
                )

    # Check for zones without capability meeting target
    for zone in project.zones:
        if zone.security_level_capability is None:
            recommendations.append(
                f"Zone '{zone.id}' has no SL-C defined. "
                "Assess and document the actual security capability."
            )

    # Vulnerability-aware recommendations
    if vulnerability_data:
        for zone_id, vulns in vulnerability_data.items():
            zone = project.get_zone(zone_id)
            if not zone:
                continue
            open_critical = [v for v in vulns if v.severity == "critical" and v.status == "open"]
            if open_critical and zone.security_level_target <= 2:
                zone_name = zone.name or zone_id
                recommendations.append(
                    f"URGENT: Zone '{zone_name}' (SL-{zone.security_level_target}) has"
                    f" {len(open_critical)} open critical CVE(s). Patch or mitigate immediately."
                )

        # Check for zones without any vulnerability data (unscanned)
        scanned_zones = set(vulnerability_data.keys())
        for zone in project.zones:
            if zone.id not in scanned_zones and zone.assets:
                recommendations.append(
                    f"Zone '{zone.name or zone.id}' has assets but no vulnerability data."
                    " Consider running a CVE scan."
                )

    # General recommendations based on overall risk
    overall_risk_avg = (
        sum(r.score for r in zone_risks.values()) / len(zone_risks) if zone_risks else 0
    )
    if overall_risk_avg >= 60:
        recommendations.append(
            "Consider implementing defense-in-depth strategies across all zones."
        )
        recommendations.append("Review and restrict conduit flows to essential protocols only.")

    return recommendations


def assess_risk(
    project: Project,
    vulnerability_data: dict[str, list[VulnInfo]] | None = None,
) -> RiskAssessment:
    """Perform complete risk assessment for a project.

    Args:
        project: The project to assess
        vulnerability_data: Optional vulnerability data keyed by zone_id

    Returns:
        RiskAssessment with zone risks, overall score, and recommendations
    """
    zone_risks: dict[str, ZoneRisk] = {}

    # Calculate risk for each zone
    for zone in project.zones:
        zone_vulns = (vulnerability_data or {}).get(zone.id)
        zone_risks[zone.id] = calculate_zone_risk(project, zone.id, zone_vulns=zone_vulns)

    # Calculate overall score (weighted average by zone criticality)
    if zone_risks:
        # Weight zones by their asset criticality for overall score
        total_weight = 0.0
        weighted_sum = 0.0

        for zone_id, risk in zone_risks.items():
            matched_zone = project.get_zone(zone_id)
            if matched_zone and matched_zone.assets:
                # Zone weight based on total asset criticality
                zone_weight = sum(getattr(asset, "criticality", 3) for asset in matched_zone.assets)
            else:
                zone_weight = 1.0  # Default weight for empty zones

            weighted_sum += risk.score * zone_weight
            total_weight += zone_weight

        overall_score = weighted_sum / total_weight if total_weight > 0 else 0.0
    else:
        overall_score = 0.0

    overall_score = round(min(max(overall_score, 0), 100), 2)
    overall_level = classify_risk_level(overall_score)

    # Generate recommendations
    recommendations = generate_recommendations(project, zone_risks, vulnerability_data)

    return RiskAssessment(
        zone_risks=zone_risks,
        overall_score=overall_score,
        overall_level=overall_level,
        recommendations=recommendations,
    )
