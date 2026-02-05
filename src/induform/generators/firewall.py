"""Generic firewall rule generator."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from induform.models.conduit import ConduitDirection
from induform.models.project import Project


class FirewallAction(str, Enum):
    """Firewall rule action."""

    ALLOW = "allow"
    DENY = "deny"
    DROP = "drop"
    LOG = "log"


class FirewallRule(BaseModel):
    """A generic firewall rule."""

    id: str
    name: str | None = None
    source_zone: str
    destination_zone: str
    source_addresses: list[str] = Field(default_factory=list)
    destination_addresses: list[str] = Field(default_factory=list)
    protocol: str
    port: int | None = None
    action: FirewallAction = FirewallAction.ALLOW
    log: bool = False
    comment: str | None = None
    order: int = 100


class FirewallRuleset(BaseModel):
    """A complete firewall ruleset."""

    name: str
    description: str | None = None
    default_action: FirewallAction = FirewallAction.DENY
    rules: list[FirewallRule] = Field(default_factory=list)


def generate_firewall_rules(
    project: Project,
    include_deny_rules: bool = True,
    log_allowed: bool = False,
    log_denied: bool = True,
) -> FirewallRuleset:
    """Generate firewall rules from a project configuration.

    Implements IEC 62443 "default deny" policy by:
    1. Creating explicit allow rules for each conduit flow
    2. Adding implicit deny rule at the end

    Args:
        project: The project configuration
        include_deny_rules: Whether to include explicit deny rules
        log_allowed: Whether to log allowed traffic
        log_denied: Whether to log denied traffic

    Returns:
        FirewallRuleset with generated rules
    """
    rules = []
    rule_counter = 1

    # Build zone to IP mapping from assets
    zone_ips = _build_zone_ip_map(project)

    # Generate allow rules from conduits
    for conduit in project.conduits:
        from_zone = project.get_zone(conduit.from_zone)
        to_zone = project.get_zone(conduit.to_zone)

        if not from_zone or not to_zone:
            continue

        for flow in conduit.flows:
            # Generate rules based on direction
            if flow.direction in (ConduitDirection.OUTBOUND, ConduitDirection.BIDIRECTIONAL):
                rules.append(
                    FirewallRule(
                        id=f"rule-{rule_counter:04d}",
                        name=f"{conduit.id}-{flow.protocol}-out",
                        source_zone=conduit.from_zone,
                        destination_zone=conduit.to_zone,
                        source_addresses=zone_ips.get(conduit.from_zone, ["any"]),
                        destination_addresses=zone_ips.get(conduit.to_zone, ["any"]),
                        protocol=flow.protocol,
                        port=flow.port,
                        action=FirewallAction.ALLOW,
                        log=log_allowed,
                        comment=f"Allow {flow.protocol} from {from_zone.name} to {to_zone.name}",
                        order=rule_counter * 10,
                    )
                )
                rule_counter += 1

            if flow.direction in (ConduitDirection.INBOUND, ConduitDirection.BIDIRECTIONAL):
                rules.append(
                    FirewallRule(
                        id=f"rule-{rule_counter:04d}",
                        name=f"{conduit.id}-{flow.protocol}-in",
                        source_zone=conduit.to_zone,
                        destination_zone=conduit.from_zone,
                        source_addresses=zone_ips.get(conduit.to_zone, ["any"]),
                        destination_addresses=zone_ips.get(conduit.from_zone, ["any"]),
                        protocol=flow.protocol,
                        port=flow.port,
                        action=FirewallAction.ALLOW,
                        log=log_allowed,
                        comment=f"Allow {flow.protocol} from {to_zone.name} to {from_zone.name}",
                        order=rule_counter * 10,
                    )
                )
                rule_counter += 1

    # Add inter-zone deny rules
    if include_deny_rules:
        zone_ids = [z.id for z in project.zones]
        for from_zone_id in zone_ids:
            for to_zone_id in zone_ids:
                if from_zone_id != to_zone_id:
                    rules.append(
                        FirewallRule(
                            id=f"rule-{rule_counter:04d}",
                            name=f"deny-{from_zone_id}-to-{to_zone_id}",
                            source_zone=from_zone_id,
                            destination_zone=to_zone_id,
                            protocol="any",
                            action=FirewallAction.DENY,
                            log=log_denied,
                            comment=f"Default deny from {from_zone_id} to {to_zone_id}",
                            order=9000 + rule_counter,
                        )
                    )
                    rule_counter += 1

    return FirewallRuleset(
        name=f"{project.project.name} Firewall Rules",
        description=f"Auto-generated firewall rules for {project.project.name}",
        default_action=FirewallAction.DENY,
        rules=rules,
    )


def _build_zone_ip_map(project: Project) -> dict[str, list[str]]:
    """Build a mapping of zone IDs to IP addresses from assets."""
    zone_ips: dict[str, list[str]] = {}

    for zone in project.zones:
        ips = []
        for asset in zone.assets:
            if asset.ip_address:
                ips.append(asset.ip_address)
        if ips:
            zone_ips[zone.id] = ips

    return zone_ips


def export_rules_json(ruleset: FirewallRuleset) -> dict[str, Any]:
    """Export firewall rules to JSON format."""
    return ruleset.model_dump(mode="json")


def export_rules_iptables(ruleset: FirewallRuleset) -> str:
    """Export firewall rules to iptables format (simplified)."""
    lines = [
        "# Auto-generated iptables rules",
        f"# Ruleset: {ruleset.name}",
        "",
        "# Flush existing rules",
        "*filter",
        ":INPUT DROP [0:0]",
        ":FORWARD DROP [0:0]",
        ":OUTPUT ACCEPT [0:0]",
        "",
    ]

    for rule in sorted(ruleset.rules, key=lambda r: r.order):
        action = "ACCEPT" if rule.action == FirewallAction.ALLOW else "DROP"

        # Build iptables command
        cmd_parts = ["-A FORWARD"]

        if rule.source_addresses and rule.source_addresses != ["any"]:
            cmd_parts.append(f"-s {rule.source_addresses[0]}")

        if rule.destination_addresses and rule.destination_addresses != ["any"]:
            cmd_parts.append(f"-d {rule.destination_addresses[0]}")

        if rule.protocol != "any":
            # Map common protocols
            proto = rule.protocol.lower()
            if proto in ("modbus_tcp", "opcua", "https", "http", "ssh"):
                cmd_parts.append("-p tcp")
            elif proto in ("snmp", "ntp", "syslog"):
                cmd_parts.append("-p udp")
            elif proto == "icmp":
                cmd_parts.append("-p icmp")
            else:
                cmd_parts.append("-p tcp")  # Default to TCP

        if rule.port:
            cmd_parts.append(f"--dport {rule.port}")

        if rule.log:
            lines.append(f"{' '.join(cmd_parts)} -j LOG --log-prefix \"{rule.id}: \"")

        cmd_parts.append(f"-j {action}")

        if rule.comment:
            lines.append(f"# {rule.comment}")
        lines.append(" ".join(cmd_parts))
        lines.append("")

    lines.append("COMMIT")
    return "\n".join(lines)
