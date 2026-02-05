"""Output generators for InduForm."""

from induform.generators.firewall import generate_firewall_rules
from induform.generators.vlan import generate_vlan_mapping
from induform.generators.compliance import generate_compliance_report

__all__ = [
    "generate_firewall_rules",
    "generate_vlan_mapping",
    "generate_compliance_report",
]
