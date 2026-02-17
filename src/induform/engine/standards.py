"""Compliance standard definitions and check/rule mappings."""

from enum import StrEnum


class ComplianceStandard(StrEnum):
    """Supported compliance frameworks."""

    IEC62443 = "IEC62443"
    PURDUE = "PURDUE"
    NIST_CSF = "NIST_CSF"
    NERC_CIP = "NERC_CIP"


STANDARD_INFO: dict[str, dict[str, str]] = {
    ComplianceStandard.IEC62443: {
        "name": "IEC 62443",
        "description": (
            "Industrial automation and control systems security"
            " standard. Defines security levels, zones,"
            " and conduits."
        ),
    },
    ComplianceStandard.PURDUE: {
        "name": "Purdue Model",
        "description": (
            "Reference architecture for industrial network"
            " segmentation with hierarchical levels"
            " from enterprise to safety."
        ),
    },
    ComplianceStandard.NIST_CSF: {
        "name": "NIST CSF",
        "description": (
            "NIST Cybersecurity Framework for identifying,"
            " protecting, detecting, responding, and"
            " recovering from cyber threats."
        ),
    },
    ComplianceStandard.NERC_CIP: {
        "name": "NERC CIP",
        "description": (
            "Critical Infrastructure Protection standards for bulk electric system cybersecurity."
        ),
    },
}

# Maps each validation check code to the set of standards it applies to.
VALIDATION_CHECK_STANDARDS: dict[str, set[str]] = {
    "ZONE_CIRCULAR_REF": {ComplianceStandard.IEC62443},
    "CONDUIT_SL_INSUFFICIENT": {ComplianceStandard.IEC62443},
    "CONDUIT_INSPECTION_RECOMMENDED": {ComplianceStandard.IEC62443},
    "DMZ_BYPASS": {ComplianceStandard.IEC62443, ComplianceStandard.PURDUE},
    "DMZ_MISSING": {ComplianceStandard.IEC62443, ComplianceStandard.PURDUE},
    "CELL_ISOLATION_VIOLATION": {ComplianceStandard.IEC62443, ComplianceStandard.PURDUE},
    "PROTOCOL_NOT_IN_ALLOWLIST": {ComplianceStandard.IEC62443},
    "CRITICAL_ASSET_LOW_SL": {
        ComplianceStandard.IEC62443,
        ComplianceStandard.NIST_CSF,
        ComplianceStandard.NERC_CIP,
    },
    "ZONE_NO_CONDUITS": {
        ComplianceStandard.IEC62443,
        ComplianceStandard.PURDUE,
        ComplianceStandard.NIST_CSF,
    },
    "CONDUIT_NO_FLOWS": {ComplianceStandard.IEC62443},
    "SAFETY_ZONE_NON_SAFETY_ASSET": {ComplianceStandard.IEC62443},
    "PURDUE_NON_ADJACENT": {ComplianceStandard.PURDUE},
    "NIST_ASSET_INVENTORY_GAP": {ComplianceStandard.NIST_CSF},
    "CIP_ESP_MISSING": {ComplianceStandard.NERC_CIP},
    "NIST_ACCESS_CONTROL": {ComplianceStandard.NIST_CSF},
    "NIST_DETECTION_GAP": {ComplianceStandard.NIST_CSF},
    "NIST_RECOVERY_PLAN": {ComplianceStandard.NIST_CSF},
    "CIP_ACCESS_POINT": {ComplianceStandard.NERC_CIP},
    "CIP_BES_CLASSIFICATION": {ComplianceStandard.NERC_CIP},
    "CIP_CHANGE_MGMT": {ComplianceStandard.NERC_CIP},
    "PURDUE_SAFETY_DIRECT": {ComplianceStandard.PURDUE},
}

# Maps each policy rule ID to the set of standards it applies to.
POLICY_RULE_STANDARDS: dict[str, set[str]] = {
    "POL-001": {ComplianceStandard.IEC62443},
    "POL-002": {ComplianceStandard.IEC62443},
    "POL-003": {ComplianceStandard.IEC62443},
    "POL-004": {ComplianceStandard.IEC62443, ComplianceStandard.PURDUE},
    "POL-005": {ComplianceStandard.IEC62443, ComplianceStandard.PURDUE},
    "POL-006": {ComplianceStandard.IEC62443},
    "POL-007": {ComplianceStandard.PURDUE},
    "NIST-001": {ComplianceStandard.NIST_CSF},
    "NIST-002": {ComplianceStandard.NIST_CSF},
    "CIP-001": {ComplianceStandard.NERC_CIP},
    "CIP-002": {ComplianceStandard.NERC_CIP},
    "CIP-003": {ComplianceStandard.NERC_CIP},
    "PURDUE-002": {ComplianceStandard.PURDUE},
}
