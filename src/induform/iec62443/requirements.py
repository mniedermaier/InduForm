"""IEC 62443-3-3 Security Requirements (SR) mapping."""

from pydantic import BaseModel, Field


class SecurityRequirement(BaseModel):
    """A security requirement from IEC 62443-3-3."""

    id: str = Field(..., description="Requirement ID (e.g., SR 1.1)")
    name: str = Field(..., description="Requirement name")
    description: str = Field(..., description="Requirement description")
    foundational_requirement: str = Field(..., description="Parent FR category")
    minimum_sl: int = Field(
        ...,
        ge=1,
        le=4,
        description="Minimum SL where this requirement applies",
    )
    sl_levels: dict[int, str] = Field(
        default_factory=dict,
        description="SL-specific requirement details",
    )


# Core Security Requirements from IEC 62443-3-3
# Organized by Foundational Requirement (FR)

SECURITY_REQUIREMENTS: dict[str, SecurityRequirement] = {
    # FR 1: Identification and Authentication Control (IAC)
    "SR 1.1": SecurityRequirement(
        id="SR 1.1",
        name="Human user identification and authentication",
        description=(
            "The control system shall provide the capability to identify and authenticate "
            "all human users."
        ),
        foundational_requirement="FR 1 - Identification and Authentication Control",
        minimum_sl=1,
        sl_levels={
            1: "Unique identification for all users",
            2: "Strong authentication (multi-factor for critical functions)",
            3: "Multi-factor authentication required",
            4: "Hardware-based authentication tokens",
        },
    ),
    "SR 1.2": SecurityRequirement(
        id="SR 1.2",
        name="Software process and device identification and authentication",
        description=(
            "The control system shall provide the capability to identify and authenticate "
            "all software processes and devices."
        ),
        foundational_requirement="FR 1 - Identification and Authentication Control",
        minimum_sl=1,
        sl_levels={
            1: "Device identification",
            2: "Device authentication with credentials",
            3: "Certificate-based device authentication",
            4: "Hardware security module (HSM) based authentication",
        },
    ),
    "SR 1.3": SecurityRequirement(
        id="SR 1.3",
        name="Account management",
        description="The control system shall provide the capability to manage user accounts.",
        foundational_requirement="FR 1 - Identification and Authentication Control",
        minimum_sl=1,
        sl_levels={
            1: "Basic account management",
            2: "Role-based access with account lifecycle management",
            3: "Automated account provisioning/deprovisioning",
            4: "Privileged access management (PAM) integration",
        },
    ),
    # FR 2: Use Control (UC)
    "SR 2.1": SecurityRequirement(
        id="SR 2.1",
        name="Authorization enforcement",
        description=(
            "The control system shall provide the capability to enforce authorizations "
            "assigned to all human users."
        ),
        foundational_requirement="FR 2 - Use Control",
        minimum_sl=1,
        sl_levels={
            1: "Basic permission enforcement",
            2: "Role-based access control (RBAC)",
            3: "Attribute-based access control (ABAC)",
            4: "Real-time authorization with context awareness",
        },
    ),
    "SR 2.2": SecurityRequirement(
        id="SR 2.2",
        name="Wireless use control",
        description=(
            "The control system shall provide the capability to identify and authenticate "
            "all users accessing via wireless."
        ),
        foundational_requirement="FR 2 - Use Control",
        minimum_sl=2,
        sl_levels={
            2: "WPA2/WPA3 with RADIUS authentication",
            3: "Wireless IDS/IPS, rogue AP detection",
            4: "Isolated wireless networks with continuous monitoring",
        },
    ),
    # FR 3: System Integrity (SI)
    "SR 3.1": SecurityRequirement(
        id="SR 3.1",
        name="Communication integrity",
        description=(
            "The control system shall provide the capability to protect the integrity "
            "of transmitted information."
        ),
        foundational_requirement="FR 3 - System Integrity",
        minimum_sl=1,
        sl_levels={
            1: "Basic integrity checks (checksums)",
            2: "Cryptographic integrity (HMAC)",
            3: "Full encryption with integrity (TLS 1.3)",
            4: "Quantum-resistant cryptographic protocols",
        },
    ),
    "SR 3.2": SecurityRequirement(
        id="SR 3.2",
        name="Malicious code protection",
        description=(
            "The control system shall provide the capability to protect against "
            "malicious code."
        ),
        foundational_requirement="FR 3 - System Integrity",
        minimum_sl=1,
        sl_levels={
            1: "Antivirus on applicable systems",
            2: "Application whitelisting",
            3: "Behavioral analysis and EDR",
            4: "Air-gapped update verification, memory protection",
        },
    ),
    # FR 4: Data Confidentiality (DC)
    "SR 4.1": SecurityRequirement(
        id="SR 4.1",
        name="Information confidentiality",
        description=(
            "The control system shall provide the capability to protect the "
            "confidentiality of information."
        ),
        foundational_requirement="FR 4 - Data Confidentiality",
        minimum_sl=1,
        sl_levels={
            1: "Access controls on sensitive data",
            2: "Encryption at rest for sensitive data",
            3: "Full disk encryption, encrypted backups",
            4: "Hardware-encrypted storage, key management HSM",
        },
    ),
    # FR 5: Restricted Data Flow (RDF)
    "SR 5.1": SecurityRequirement(
        id="SR 5.1",
        name="Network segmentation",
        description=(
            "The control system shall provide the capability to logically segment "
            "networks."
        ),
        foundational_requirement="FR 5 - Restricted Data Flow",
        minimum_sl=1,
        sl_levels={
            1: "VLAN segmentation",
            2: "Firewall-enforced segmentation",
            3: "Microsegmentation with zone-based policies",
            4: "Physical network separation for critical zones",
        },
    ),
    "SR 5.2": SecurityRequirement(
        id="SR 5.2",
        name="Zone boundary protection",
        description=(
            "The control system shall provide the capability to monitor and control "
            "communications at zone boundaries."
        ),
        foundational_requirement="FR 5 - Restricted Data Flow",
        minimum_sl=1,
        sl_levels={
            1: "Stateful firewalls at boundaries",
            2: "Application-layer firewalls",
            3: "Deep packet inspection for industrial protocols",
            4: "Protocol-aware proxies with full traffic analysis",
        },
    ),
    "SR 5.3": SecurityRequirement(
        id="SR 5.3",
        name="General purpose person-to-person communication restrictions",
        description=(
            "The control system shall provide the capability to restrict "
            "person-to-person communication."
        ),
        foundational_requirement="FR 5 - Restricted Data Flow",
        minimum_sl=2,
        sl_levels={
            2: "Email/web filtering at boundaries",
            3: "Blocked or proxied communications",
            4: "No direct person-to-person communication allowed",
        },
    ),
    # FR 6: Timely Response to Events (TRE)
    "SR 6.1": SecurityRequirement(
        id="SR 6.1",
        name="Audit log accessibility",
        description=(
            "The control system shall provide the capability to access audit logs "
            "for authorized personnel."
        ),
        foundational_requirement="FR 6 - Timely Response to Events",
        minimum_sl=1,
        sl_levels={
            1: "Local audit log storage",
            2: "Centralized log management (SIEM)",
            3: "Real-time alerting and correlation",
            4: "Immutable audit logs with forensic capabilities",
        },
    ),
    "SR 6.2": SecurityRequirement(
        id="SR 6.2",
        name="Continuous monitoring",
        description=(
            "The control system shall provide the capability for continuous "
            "monitoring of security-relevant events."
        ),
        foundational_requirement="FR 6 - Timely Response to Events",
        minimum_sl=2,
        sl_levels={
            2: "Periodic security monitoring",
            3: "24/7 security monitoring with SOC",
            4: "Automated response with human oversight",
        },
    ),
    # FR 7: Resource Availability (RA)
    "SR 7.1": SecurityRequirement(
        id="SR 7.1",
        name="Denial of service protection",
        description=(
            "The control system shall provide the capability to protect against "
            "denial of service attacks."
        ),
        foundational_requirement="FR 7 - Resource Availability",
        minimum_sl=1,
        sl_levels={
            1: "Basic rate limiting",
            2: "Network-level DoS protection",
            3: "Application-aware DoS protection",
            4: "Redundant systems with automatic failover",
        },
    ),
    "SR 7.2": SecurityRequirement(
        id="SR 7.2",
        name="Resource management",
        description=(
            "The control system shall provide the capability to manage resources "
            "to support essential functions."
        ),
        foundational_requirement="FR 7 - Resource Availability",
        minimum_sl=1,
        sl_levels={
            1: "Resource monitoring",
            2: "Resource quotas and limits",
            3: "Automatic resource scaling",
            4: "Isolated resource pools for critical functions",
        },
    ),
}


def get_requirements_for_level(sl: int) -> list[SecurityRequirement]:
    """Get all security requirements applicable at a given security level."""
    return [req for req in SECURITY_REQUIREMENTS.values() if req.minimum_sl <= sl]


def get_requirement(requirement_id: str) -> SecurityRequirement | None:
    """Get a specific security requirement by ID."""
    return SECURITY_REQUIREMENTS.get(requirement_id)


def get_requirements_by_fr(foundational_requirement: str) -> list[SecurityRequirement]:
    """Get all security requirements for a foundational requirement category."""
    return [
        req
        for req in SECURITY_REQUIREMENTS.values()
        if foundational_requirement in req.foundational_requirement
    ]
