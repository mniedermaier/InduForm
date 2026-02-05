"""IEC 62443 Security Level definitions."""

from enum import IntEnum


class SecurityLevel(IntEnum):
    """IEC 62443 Security Levels (SL)."""

    SL1 = 1  # Protection against casual or coincidental violation
    SL2 = 2  # Protection against intentional violation using simple means
    SL3 = 3  # Protection against sophisticated attacks with moderate resources
    SL4 = 4  # Protection against state-sponsored attacks with extensive resources


SECURITY_LEVEL_DESCRIPTIONS: dict[int, dict[str, str]] = {
    1: {
        "name": "SL 1 - Basic",
        "threat": "Casual or coincidental violation",
        "attacker": "No intentional attack, accidental misconfiguration",
        "resources": "None specific",
        "description": (
            "Protection against casual or coincidental violation. "
            "Covers basic security hygiene and protection against unintentional errors."
        ),
    },
    2: {
        "name": "SL 2 - Enhanced",
        "threat": "Intentional violation using simple means",
        "attacker": "Low motivation, general skills, low resources",
        "resources": "Generic tools, public exploits",
        "description": (
            "Protection against intentional violation using simple means and low resources. "
            "Defends against opportunistic attackers with basic tools."
        ),
    },
    3: {
        "name": "SL 3 - Critical",
        "threat": "Sophisticated attack with moderate resources",
        "attacker": "Moderate motivation, IACS-specific skills, moderate resources",
        "resources": "IACS-specific tools, possible insider knowledge",
        "description": (
            "Protection against sophisticated attack using moderate resources, "
            "IACS-specific skills, and moderate motivation. Covers organized cybercrime."
        ),
    },
    4: {
        "name": "SL 4 - State-Critical",
        "threat": "State-sponsored or highly sophisticated attack",
        "attacker": "High motivation, nation-state level skills, extensive resources",
        "resources": "Zero-days, custom tools, insider access, unlimited time",
        "description": (
            "Protection against state-sponsored attack using extensive resources, "
            "IACS-specific skills, and high motivation. Maximum security posture."
        ),
    },
}


def get_security_level_description(level: int) -> dict[str, str]:
    """Get the description for a security level."""
    if level not in SECURITY_LEVEL_DESCRIPTIONS:
        raise ValueError(f"Invalid security level: {level}. Must be 1-4.")
    return SECURITY_LEVEL_DESCRIPTIONS[level]


def calculate_conduit_security_level(from_sl: int, to_sl: int) -> int:
    """Calculate the required security level for a conduit between two zones.

    Per IEC 62443, the conduit must support the higher of the two zones' SL-T.
    """
    return max(from_sl, to_sl)


def requires_inspection(from_sl: int, to_sl: int) -> bool:
    """Determine if a conduit requires deep packet inspection.

    When the security level difference is >= 2, inspection/proxy is required.
    """
    return abs(from_sl - to_sl) >= 2
