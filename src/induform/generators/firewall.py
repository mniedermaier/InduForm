"""Generic firewall rule generator."""

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

from induform.models.conduit import ConduitDirection
from induform.models.project import Project


class FirewallAction(StrEnum):
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


# Protocol to port mapping for vendor-specific formats
_PROTOCOL_PORT_MAP: dict[str, int] = {
    "http": 80,
    "https": 443,
    "ssh": 22,
    "modbus_tcp": 502,
    "modbus": 502,
    "opcua": 4840,
    "opc-ua": 4840,
    "dnp3": 20000,
    "s7comm": 102,
    "bacnet": 47808,
    "ethernet_ip": 44818,
    "ethernetip": 44818,
    "profinet": 34964,
    "mqtt": 1883,
    "snmp": 161,
    "syslog": 514,
    "ntp": 123,
    "ftp": 21,
    "tftp": 69,
    "rdp": 3389,
    "telnet": 23,
    "icmp": 0,
}

# Protocol to FortiGate service name mapping
_FORTINET_SERVICE_MAP: dict[str, str] = {
    "http": "HTTP",
    "https": "HTTPS",
    "ssh": "SSH",
    "modbus_tcp": "MODBUS",
    "modbus": "MODBUS",
    "opcua": "OPC-UA",
    "opc-ua": "OPC-UA",
    "dnp3": "DNP3",
    "s7comm": "S7COMM",
    "bacnet": "BACnet",
    "ethernet_ip": "EtherNet-IP",
    "ethernetip": "EtherNet-IP",
    "profinet": "PROFINET",
    "mqtt": "MQTT",
    "snmp": "SNMP",
    "syslog": "SYSLOG",
    "ntp": "NTP",
    "ftp": "FTP",
    "tftp": "TFTP",
    "rdp": "RDP",
    "telnet": "TELNET",
    "icmp": "PING",
    "any": "ALL",
}

# Protocol to PAN-OS application name mapping
_PALOALTO_APP_MAP: dict[str, str] = {
    "http": "web-browsing",
    "https": "ssl",
    "ssh": "ssh",
    "modbus_tcp": "modbus",
    "modbus": "modbus",
    "opcua": "opc-ua",
    "opc-ua": "opc-ua",
    "dnp3": "dnp3",
    "s7comm": "siemens-s7",
    "bacnet": "bacnet",
    "ethernet_ip": "ethernet-ip",
    "ethernetip": "ethernet-ip",
    "profinet": "profinet",
    "mqtt": "mqtt",
    "snmp": "snmp",
    "syslog": "syslog",
    "ntp": "ntp",
    "ftp": "ftp",
    "tftp": "tftp",
    "rdp": "ms-rdp",
    "telnet": "telnet",
    "icmp": "ping",
}

# Protocol to IP protocol type mapping (tcp/udp/icmp)
_PROTOCOL_TYPE_MAP: dict[str, str] = {
    "http": "tcp",
    "https": "tcp",
    "ssh": "tcp",
    "modbus_tcp": "tcp",
    "modbus": "tcp",
    "opcua": "tcp",
    "opc-ua": "tcp",
    "dnp3": "tcp",
    "s7comm": "tcp",
    "bacnet": "udp",
    "ethernet_ip": "tcp",
    "ethernetip": "tcp",
    "profinet": "udp",
    "mqtt": "tcp",
    "snmp": "udp",
    "syslog": "udp",
    "ntp": "udp",
    "ftp": "tcp",
    "tftp": "udp",
    "rdp": "tcp",
    "telnet": "tcp",
    "icmp": "icmp",
}


def _get_ip_protocol(protocol: str) -> str:
    """Get the IP protocol type (tcp/udp/icmp) for a given protocol name."""
    return _PROTOCOL_TYPE_MAP.get(protocol.lower(), "tcp")


def _get_port(rule: FirewallRule) -> int | None:
    """Get the port number for a rule, using the protocol map as fallback."""
    if rule.port:
        return rule.port
    return _PROTOCOL_PORT_MAP.get(rule.protocol.lower())


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
            lines.append(f'{" ".join(cmd_parts)} -j LOG --log-prefix "{rule.id}: "')

        cmd_parts.append(f"-j {action}")

        if rule.comment:
            lines.append(f"# {rule.comment}")
        lines.append(" ".join(cmd_parts))
        lines.append("")

    lines.append("COMMIT")
    return "\n".join(lines)


def export_rules_fortinet(ruleset: FirewallRuleset) -> str:
    """Export firewall rules to Fortinet FortiGate FortiOS CLI format.

    Generates a complete FortiOS CLI configuration block with:
    - ``config firewall policy`` wrapper
    - Per-rule ``edit <id>`` blocks with source/destination interfaces,
      addresses, service mapping, action, logging, and comments
    - Proper ``next`` / ``end`` termination

    Protocol names are mapped to FortiGate service names (e.g. HTTP, HTTPS,
    OPC-UA, MODBUS). Unknown protocols fall back to a custom TCP/UDP service
    specification with port number.
    """
    lines = [
        "# Auto-generated FortiGate firewall policy",
        f"# Ruleset: {ruleset.name}",
        "",
        "config firewall policy",
    ]

    for idx, rule in enumerate(sorted(ruleset.rules, key=lambda r: r.order), start=1):
        action = "accept" if rule.action == FirewallAction.ALLOW else "deny"
        log_traffic = "all" if rule.log else "disable"

        # Map protocol to FortiGate service name
        service = _FORTINET_SERVICE_MAP.get(rule.protocol.lower(), "ALL")
        # If unknown protocol but we have a port, create a custom service ref
        if service == "ALL" and rule.protocol.lower() != "any":
            port = _get_port(rule)
            if port:
                ip_proto = _get_ip_protocol(rule.protocol).upper()
                service = f"custom-{rule.protocol}-{ip_proto}/{port}"

        # Source/dest addresses
        src_addr = " ".join(rule.source_addresses) if rule.source_addresses else "all"
        dst_addr = " ".join(rule.destination_addresses) if rule.destination_addresses else "all"

        lines.append(f"    edit {idx}")
        lines.append(f'        set name "{rule.name or rule.id}"')
        lines.append(f'        set srcintf "{rule.source_zone}"')
        lines.append(f'        set dstintf "{rule.destination_zone}"')
        lines.append(f'        set srcaddr "{src_addr}"')
        lines.append(f'        set dstaddr "{dst_addr}"')
        lines.append(f'        set service "{service}"')
        lines.append(f"        set action {action}")
        lines.append(f"        set logtraffic {log_traffic}")
        lines.append("        set status enable")
        if rule.comment:
            lines.append(f'        set comments "{rule.comment}"')
        lines.append("    next")

    lines.append("end")
    return "\n".join(lines)


def export_rules_paloalto(ruleset: FirewallRuleset) -> str:
    """Export firewall rules to Palo Alto PAN-OS set-command format.

    Generates PAN-OS ``set rulebase security rules`` CLI commands with:
    - Source/destination zones and addresses
    - Application-aware service mapping (e.g. ``web-browsing``, ``opc-ua``,
      ``modbus``)
    - Action (allow/deny) and end-of-session logging

    Unknown protocols fall back to ``application-default`` with the port
    number when available.
    """
    lines = [
        "# Auto-generated Palo Alto PAN-OS security rules",
        f"# Ruleset: {ruleset.name}",
        "",
    ]

    for rule in sorted(ruleset.rules, key=lambda r: r.order):
        action = "allow" if rule.action == FirewallAction.ALLOW else "deny"
        rule_name = (rule.name or rule.id).replace(" ", "_")

        # Map protocol to PAN-OS application name
        app = _PALOALTO_APP_MAP.get(rule.protocol.lower())
        port = _get_port(rule)

        # Source/dest addresses
        src_addrs = rule.source_addresses if rule.source_addresses else ["any"]
        dst_addrs = rule.destination_addresses if rule.destination_addresses else ["any"]

        if rule.comment:
            lines.append(f"# {rule.comment}")

        base = f'set rulebase security rules "{rule_name}"'
        lines.append(f'{base} from "{rule.source_zone}"')
        lines.append(f'{base} to "{rule.destination_zone}"')

        for addr in src_addrs:
            lines.append(f'{base} source "{addr}"')
        for addr in dst_addrs:
            lines.append(f'{base} destination "{addr}"')

        if app:
            lines.append(f'{base} application "{app}"')
            lines.append(f"{base} service application-default")
        elif rule.protocol.lower() == "any":
            lines.append(f'{base} application "any"')
            lines.append(f"{base} service any")
        else:
            # Unknown protocol: use port-based service
            ip_proto = _get_ip_protocol(rule.protocol)
            if port:
                lines.append(f'{base} application "any"')
                lines.append(f'{base} service "custom-{rule.protocol}-{ip_proto}-{port}"')
            else:
                lines.append(f'{base} application "any"')
                lines.append(f"{base} service any")

        lines.append(f"{base} action {action}")
        lines.append(f"{base} log-end yes")
        lines.append("")

    return "\n".join(lines)


def export_rules_cisco_asa(ruleset: FirewallRuleset) -> str:
    """Export firewall rules to Cisco ASA ACL format.

    Generates a complete Cisco ASA configuration with:
    - Object-group network definitions for zone IP addresses
    - Extended access-list entries with permit/deny, protocol, source,
      destination, and port
    - ``access-group`` statements binding the ACL to interfaces

    Rules without explicit IP addresses use the ``any`` keyword.
    """
    lines = [
        "! Auto-generated Cisco ASA firewall rules",
        f"! Ruleset: {ruleset.name}",
        "!",
    ]

    # Collect all zones that have addresses, for object-group definitions
    zone_addresses: dict[str, set[str]] = {}
    for rule in ruleset.rules:
        if rule.source_addresses and rule.source_addresses != ["any"]:
            zone_addresses.setdefault(rule.source_zone, set()).update(rule.source_addresses)
        if rule.destination_addresses and rule.destination_addresses != ["any"]:
            zone_addresses.setdefault(rule.destination_zone, set()).update(
                rule.destination_addresses
            )

    # Generate object-group definitions
    if zone_addresses:
        lines.append("! --- Object Groups ---")
        lines.append("!")
        for zone_id, addresses in sorted(zone_addresses.items()):
            group_name = f"zone-{zone_id}".replace(" ", "_")
            lines.append(f"object-group network {group_name}")
            for addr in sorted(addresses):
                # Determine if it's a host IP or network
                if "/" in addr:
                    # CIDR notation - convert to subnet mask
                    ip_part, prefix_len = addr.split("/")
                    mask = _cidr_to_netmask(int(prefix_len))
                    lines.append(f" network-object {ip_part} {mask}")
                else:
                    lines.append(f" network-object host {addr}")
            lines.append("!")

    # Collect unique interface pairs for access-group statements
    acl_name = f"ACL-{ruleset.name}".replace(" ", "-")
    interface_zones: set[str] = set()

    lines.append("! --- Access Control Entries ---")
    lines.append("!")

    for rule in sorted(ruleset.rules, key=lambda r: r.order):
        action = "permit" if rule.action == FirewallAction.ALLOW else "deny"
        ip_proto = _get_ip_protocol(rule.protocol)
        port = _get_port(rule)

        # Determine source spec
        if rule.source_addresses and rule.source_addresses != ["any"]:
            group_name = f"zone-{rule.source_zone}".replace(" ", "_")
            src_spec = f"object-group {group_name}"
        else:
            src_spec = "any"

        # Determine destination spec
        if rule.destination_addresses and rule.destination_addresses != ["any"]:
            group_name = f"zone-{rule.destination_zone}".replace(" ", "_")
            dst_spec = f"object-group {group_name}"
        else:
            dst_spec = "any"

        if rule.comment:
            lines.append(f"! {rule.comment}")

        if rule.protocol.lower() == "any" or ip_proto == "icmp":
            proto = "ip" if rule.protocol.lower() == "any" else "icmp"
            lines.append(f"access-list {acl_name} extended {action} {proto} {src_spec} {dst_spec}")
        elif port:
            lines.append(
                f"access-list {acl_name} extended {action} {ip_proto} "
                f"{src_spec} {dst_spec} eq {port}"
            )
        else:
            lines.append(
                f"access-list {acl_name} extended {action} {ip_proto} {src_spec} {dst_spec}"
            )

        if rule.log:
            # Append log keyword by rewriting last line
            lines[-1] += " log"

        interface_zones.add(rule.source_zone)

    lines.append("")
    lines.append("! --- Access Group Bindings ---")
    lines.append("!")
    for zone in sorted(interface_zones):
        iface_name = zone.replace(" ", "_")
        lines.append(f"access-group {acl_name} in interface {iface_name}")

    return "\n".join(lines)


def _cidr_to_netmask(prefix_len: int) -> str:
    """Convert a CIDR prefix length to a dotted-decimal subnet mask."""
    if prefix_len < 0 or prefix_len > 32:
        prefix_len = max(0, min(32, prefix_len))
    mask = (0xFFFFFFFF << (32 - prefix_len)) & 0xFFFFFFFF
    return f"{(mask >> 24) & 0xFF}.{(mask >> 16) & 0xFF}.{(mask >> 8) & 0xFF}.{mask & 0xFF}"
