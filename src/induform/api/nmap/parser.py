"""Nmap XML parser using python-libnmap."""

from datetime import datetime
from typing import Any

from libnmap.objects import NmapReport
from libnmap.parser import NmapParser


class ParsedHost:
    """Parsed host information from Nmap scan."""

    def __init__(
        self,
        ip_address: str,
        mac_address: str | None = None,
        hostname: str | None = None,
        os_detection: str | None = None,
        status: str = "up",
        open_ports: list[dict[str, Any]] | None = None,
    ):
        self.ip_address = ip_address
        self.mac_address = mac_address
        self.hostname = hostname
        self.os_detection = os_detection
        self.status = status
        self.open_ports = open_ports or []

    def to_dict(self) -> dict[str, Any]:
        return {
            "ip_address": self.ip_address,
            "mac_address": self.mac_address,
            "hostname": self.hostname,
            "os_detection": self.os_detection,
            "status": self.status,
            "open_ports": self.open_ports,
        }


class ParsedScan:
    """Parsed Nmap scan result."""

    def __init__(
        self,
        scan_date: datetime | None = None,
        hosts: list[ParsedHost] | None = None,
        command_line: str | None = None,
        scan_type: str | None = None,
    ):
        self.scan_date = scan_date
        self.hosts = hosts or []
        self.command_line = command_line
        self.scan_type = scan_type

    @property
    def host_count(self) -> int:
        return len(self.hosts)


_MAX_XML_SIZE = 10 * 1024 * 1024  # 10 MB


def parse_nmap_xml(xml_content: str) -> ParsedScan:
    """Parse Nmap XML output and extract host information.

    Args:
        xml_content: The Nmap XML output as a string.

    Returns:
        ParsedScan object containing all discovered hosts.

    Raises:
        ValueError: If the XML cannot be parsed or is malicious.
    """
    if len(xml_content) > _MAX_XML_SIZE:
        raise ValueError(f"XML content exceeds maximum size of {_MAX_XML_SIZE} bytes")

    # Reject XML with entity declarations (XML bomb / XXE protection)
    if "<!ENTITY" in xml_content or "<!DOCTYPE" in xml_content.upper():
        raise ValueError("XML contains DOCTYPE or ENTITY declarations which are not allowed")

    try:
        report: NmapReport = NmapParser.parse_fromstring(xml_content)
    except Exception as e:
        raise ValueError(f"Failed to parse Nmap XML: {e}")

    # Extract scan metadata
    scan_date = None
    if report.started:
        scan_date = datetime.fromtimestamp(report.started)

    hosts: list[ParsedHost] = []

    for host in report.hosts:
        # Skip hosts that are down
        if host.status != "up":
            continue

        # Get IP address
        ip_address = host.address
        if not ip_address:
            continue

        # Get MAC address
        mac_address = None
        if hasattr(host, "mac") and host.mac:
            mac_address = host.mac

        # Get hostname
        hostname = None
        if host.hostnames:
            hostname = host.hostnames[0]

        # Get OS detection
        os_detection = None
        if host.os_fingerprinted and host.os_match_results():
            top_match = host.os_match_results()[0]
            os_detection = top_match.name if hasattr(top_match, "name") else str(top_match)

        # Get open ports
        open_ports = []
        for service in host.services:
            if service.state == "open":
                port_info = {
                    "port": service.port,
                    "protocol": service.protocol,
                    "service": service.service,
                    "product": service.service_dict.get("product"),
                    "version": service.service_dict.get("version"),
                }
                open_ports.append(port_info)

        hosts.append(
            ParsedHost(
                ip_address=ip_address,
                mac_address=mac_address,
                hostname=hostname,
                os_detection=os_detection,
                status="up",
                open_ports=open_ports,
            )
        )

    return ParsedScan(
        scan_date=scan_date,
        hosts=hosts,
        command_line=report.commandline if hasattr(report, "commandline") else None,
        scan_type=report.scan_type if hasattr(report, "scan_type") else None,
    )


def suggest_asset_type(host: ParsedHost) -> str:
    """Suggest an asset type based on host characteristics.

    Args:
        host: Parsed host information.

    Returns:
        Suggested asset type string.
    """
    # Check OS detection
    if host.os_detection:
        os_lower = host.os_detection.lower()
        if "cisco" in os_lower or "juniper" in os_lower:
            return "router"
        if "switch" in os_lower:
            return "switch"
        if "firewall" in os_lower or "fortinet" in os_lower or "palo alto" in os_lower:
            return "firewall"
        if "windows server" in os_lower:
            return "server"
        if "windows" in os_lower:
            return "engineering_workstation"
        if "linux" in os_lower or "unix" in os_lower:
            return "server"

    # Check open ports for common services
    for port_info in host.open_ports:
        port = port_info.get("port")
        service = port_info.get("service", "").lower()

        # Modbus/TCP - likely PLC
        if port == 502 or "modbus" in service:
            return "plc"

        # EtherNet/IP - likely PLC
        if port == 44818 or "enip" in service:
            return "plc"

        # DNP3 - likely RTU
        if port == 20000 or "dnp3" in service:
            return "rtu"

        # VNC - likely HMI
        if port in (5900, 5901, 5902) or "vnc" in service:
            return "hmi"

        # Historian ports
        if port in (1433, 3306, 5432) and any(p.get("port") == 80 for p in host.open_ports):
            return "historian"

        # HTTP/HTTPS with SSH - likely server
        if port in (80, 443) or "http" in service:
            if any(p.get("port") == 22 for p in host.open_ports):
                return "server"

    # Default
    return "other"


def suggest_asset_name(host: ParsedHost) -> str:
    """Suggest an asset name based on host characteristics.

    Args:
        host: Parsed host information.

    Returns:
        Suggested asset name.
    """
    if host.hostname:
        return host.hostname

    # Use IP-based name
    return f"Host-{host.ip_address.replace('.', '-')}"
