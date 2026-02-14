"""Pre-built project templates for common OT architectures.

This module provides ready-to-use templates based on IEC 62443 for common
industrial control system architectures.
"""

from induform.models.asset import Asset, AssetType
from induform.models.conduit import Conduit, ConduitDirection, ProtocolFlow
from induform.models.project import Project, ProjectMetadata
from induform.models.zone import Zone, ZoneType


def _create_purdue_model() -> Project:
    """Create a Purdue Model template with classic 5-level industrial architecture.

    The Purdue Enterprise Reference Architecture (PERA) defines a hierarchical
    model for industrial control systems with distinct security levels.
    """
    zones = [
        Zone(
            id="level5-enterprise",
            name="Level 5 - Enterprise Network",
            type=ZoneType.ENTERPRISE,
            security_level_target=1,
            description="Corporate enterprise network with ERP, email, and business systems",
            assets=[
                Asset(
                    id="erp-server",
                    name="ERP Server",
                    type=AssetType.SERVER,
                    description="Enterprise Resource Planning system",
                    criticality=2,
                ),
                Asset(
                    id="email-server",
                    name="Email Server",
                    type=AssetType.SERVER,
                    description="Corporate email system",
                    criticality=2,
                ),
            ],
        ),
        Zone(
            id="level4-site-business",
            name="Level 4 - Site Business",
            type=ZoneType.SITE,
            security_level_target=2,
            description="Site-level business planning and logistics",
            assets=[
                Asset(
                    id="site-historian",
                    name="Site Historian",
                    type=AssetType.HISTORIAN,
                    description="Site-wide data historian for business analytics",
                    criticality=3,
                ),
                Asset(
                    id="mes-server",
                    name="MES Server",
                    type=AssetType.SERVER,
                    description="Manufacturing Execution System",
                    criticality=3,
                ),
            ],
        ),
        Zone(
            id="level35-dmz",
            name="Level 3.5 - DMZ",
            type=ZoneType.DMZ,
            security_level_target=3,
            description="Industrial demilitarized zone separating IT and OT networks",
            assets=[
                Asset(
                    id="dmz-firewall-north",
                    name="DMZ Firewall (North)",
                    type=AssetType.FIREWALL,
                    description="Firewall facing enterprise network",
                    criticality=5,
                ),
                Asset(
                    id="dmz-firewall-south",
                    name="DMZ Firewall (South)",
                    type=AssetType.FIREWALL,
                    description="Firewall facing operations network",
                    criticality=5,
                ),
                Asset(
                    id="jump-host",
                    name="Jump Host",
                    type=AssetType.JUMP_HOST,
                    description="Secure remote access jump server",
                    criticality=4,
                ),
                Asset(
                    id="patch-server",
                    name="Patch Server",
                    type=AssetType.SERVER,
                    description="Windows/application patch distribution server",
                    criticality=4,
                ),
            ],
        ),
        Zone(
            id="level3-operations",
            name="Level 3 - Site Operations",
            type=ZoneType.SITE,
            security_level_target=2,
            description="Site-wide operations management and monitoring",
            assets=[
                Asset(
                    id="ops-historian",
                    name="Operations Historian",
                    type=AssetType.HISTORIAN,
                    description="Operations data historian",
                    criticality=4,
                ),
                Asset(
                    id="scada-server",
                    name="SCADA Server",
                    type=AssetType.SCADA,
                    description="Central SCADA server",
                    criticality=5,
                ),
                Asset(
                    id="engineering-ws",
                    name="Engineering Workstation",
                    type=AssetType.ENGINEERING_WORKSTATION,
                    description="PLC/DCS programming workstation",
                    criticality=4,
                ),
            ],
        ),
        Zone(
            id="level2-area",
            name="Level 2 - Area Supervisory",
            type=ZoneType.AREA,
            security_level_target=2,
            description="Area supervisory control and HMI systems",
            assets=[
                Asset(
                    id="area-hmi-1",
                    name="Area HMI 1",
                    type=AssetType.HMI,
                    description="Operator HMI station",
                    criticality=4,
                ),
                Asset(
                    id="area-hmi-2",
                    name="Area HMI 2",
                    type=AssetType.HMI,
                    description="Operator HMI station",
                    criticality=4,
                ),
                Asset(
                    id="data-concentrator",
                    name="Data Concentrator",
                    type=AssetType.RTU,
                    description="Area data concentrator/RTU",
                    criticality=4,
                ),
            ],
        ),
        Zone(
            id="level1-control",
            name="Level 1 - Basic Control",
            type=ZoneType.CELL,
            security_level_target=3,
            description="Basic control systems including PLCs and DCS controllers",
            assets=[
                Asset(
                    id="plc-main",
                    name="Main PLC",
                    type=AssetType.PLC,
                    description="Primary process controller",
                    criticality=5,
                ),
                Asset(
                    id="plc-backup",
                    name="Backup PLC",
                    type=AssetType.PLC,
                    description="Redundant process controller",
                    criticality=5,
                ),
                Asset(
                    id="safety-plc",
                    name="Safety PLC",
                    type=AssetType.PLC,
                    description="Safety instrumented system controller",
                    criticality=5,
                ),
            ],
        ),
        Zone(
            id="level0-process",
            name="Level 0 - Process",
            type=ZoneType.CELL,
            security_level_target=4,
            description="Field devices, sensors, and actuators",
            assets=[
                Asset(
                    id="field-io-1",
                    name="Field I/O Module 1",
                    type=AssetType.OTHER,
                    description="Remote I/O module",
                    criticality=4,
                ),
                Asset(
                    id="field-io-2",
                    name="Field I/O Module 2",
                    type=AssetType.OTHER,
                    description="Remote I/O module",
                    criticality=4,
                ),
            ],
        ),
    ]

    conduits = [
        Conduit(
            id="c-l5-l4",
            name="Enterprise to Site Business",
            from_zone="level5-enterprise",
            to_zone="level4-site-business",
            description="Business data exchange between enterprise and site",
            flows=[
                ProtocolFlow(protocol="https", port=443, direction=ConduitDirection.BIDIRECTIONAL),
                ProtocolFlow(protocol="sql", port=1433, direction=ConduitDirection.OUTBOUND),
            ],
        ),
        Conduit(
            id="c-l4-dmz",
            name="Site Business to DMZ",
            from_zone="level4-site-business",
            to_zone="level35-dmz",
            description="Controlled access through DMZ",
            requires_inspection=True,
            flows=[
                ProtocolFlow(protocol="https", port=443, direction=ConduitDirection.BIDIRECTIONAL),
            ],
        ),
        Conduit(
            id="c-dmz-l3",
            name="DMZ to Operations",
            from_zone="level35-dmz",
            to_zone="level3-operations",
            description="Controlled access from DMZ to operations",
            requires_inspection=True,
            flows=[
                ProtocolFlow(protocol="rdp", port=3389, direction=ConduitDirection.OUTBOUND),
                ProtocolFlow(protocol="ssh", port=22, direction=ConduitDirection.OUTBOUND),
            ],
        ),
        Conduit(
            id="c-l3-l2",
            name="Operations to Area Supervisory",
            from_zone="level3-operations",
            to_zone="level2-area",
            description="SCADA and HMI communication",
            flows=[
                ProtocolFlow(protocol="opcua", port=4840, direction=ConduitDirection.BIDIRECTIONAL),
                ProtocolFlow(
                    protocol="modbus_tcp", port=502, direction=ConduitDirection.BIDIRECTIONAL
                ),
            ],
        ),
        Conduit(
            id="c-l2-l1",
            name="Area Supervisory to Basic Control",
            from_zone="level2-area",
            to_zone="level1-control",
            description="HMI to PLC communication",
            flows=[
                ProtocolFlow(
                    protocol="modbus_tcp", port=502, direction=ConduitDirection.BIDIRECTIONAL
                ),
                ProtocolFlow(
                    protocol="ethernet_ip", port=44818, direction=ConduitDirection.BIDIRECTIONAL
                ),
            ],
        ),
        Conduit(
            id="c-l1-l0",
            name="Basic Control to Process",
            from_zone="level1-control",
            to_zone="level0-process",
            description="PLC to field device communication",
            flows=[
                ProtocolFlow(
                    protocol="profinet", port=34964, direction=ConduitDirection.BIDIRECTIONAL
                ),
            ],
        ),
    ]

    return Project(
        version="1.0",
        project=ProjectMetadata(
            name="Purdue Model Reference Architecture",
            description="Classic 5-level Purdue Enterprise Reference Architecture (PERA) "
            "for industrial control systems based on IEC 62443 security zones and conduits.",
            standard="IEC62443",
            version="1.0",
            author="InduForm Templates",
        ),
        zones=zones,
        conduits=conduits,
    )


def _create_manufacturing_plant() -> Project:
    """Create a Manufacturing Plant template with simplified manufacturing setup."""
    zones = [
        Zone(
            id="enterprise",
            name="Enterprise Network",
            type=ZoneType.ENTERPRISE,
            security_level_target=1,
            description="Corporate IT network with business systems",
            assets=[
                Asset(
                    id="corp-erp",
                    name="Corporate ERP",
                    type=AssetType.SERVER,
                    description="Enterprise resource planning system",
                    criticality=2,
                ),
            ],
        ),
        Zone(
            id="dmz",
            name="Industrial DMZ",
            type=ZoneType.DMZ,
            security_level_target=3,
            description="Demilitarized zone between IT and OT",
            assets=[
                Asset(
                    id="dmz-fw",
                    name="DMZ Firewall",
                    type=AssetType.FIREWALL,
                    description="Industrial firewall",
                    criticality=5,
                ),
                Asset(
                    id="historian",
                    name="Plant Historian",
                    type=AssetType.HISTORIAN,
                    description="Plant-wide data historian",
                    criticality=4,
                ),
                Asset(
                    id="remote-access",
                    name="Remote Access Server",
                    type=AssetType.JUMP_HOST,
                    description="Secure remote access gateway",
                    criticality=4,
                ),
            ],
        ),
        Zone(
            id="scada",
            name="SCADA Network",
            type=ZoneType.SITE,
            security_level_target=2,
            description="Central SCADA and operations network",
            assets=[
                Asset(
                    id="scada-server",
                    name="SCADA Server",
                    type=AssetType.SCADA,
                    description="Central SCADA system",
                    criticality=5,
                ),
                Asset(
                    id="eng-workstation",
                    name="Engineering Workstation",
                    type=AssetType.ENGINEERING_WORKSTATION,
                    description="PLC programming workstation",
                    criticality=4,
                ),
                Asset(
                    id="main-hmi",
                    name="Main HMI",
                    type=AssetType.HMI,
                    description="Central operator HMI",
                    criticality=4,
                ),
            ],
        ),
        Zone(
            id="cell1",
            name="Production Cell 1",
            type=ZoneType.CELL,
            security_level_target=3,
            description="Production cell for primary manufacturing line",
            assets=[
                Asset(
                    id="cell1-plc",
                    name="Cell 1 PLC",
                    type=AssetType.PLC,
                    description="Production line 1 controller",
                    criticality=5,
                ),
                Asset(
                    id="cell1-hmi",
                    name="Cell 1 HMI",
                    type=AssetType.HMI,
                    description="Local operator interface",
                    criticality=4,
                ),
                Asset(
                    id="cell1-vfd",
                    name="Cell 1 VFD",
                    type=AssetType.OTHER,
                    description="Variable frequency drive",
                    criticality=4,
                ),
            ],
        ),
        Zone(
            id="cell2",
            name="Production Cell 2",
            type=ZoneType.CELL,
            security_level_target=3,
            description="Production cell for secondary manufacturing line",
            assets=[
                Asset(
                    id="cell2-plc",
                    name="Cell 2 PLC",
                    type=AssetType.PLC,
                    description="Production line 2 controller",
                    criticality=5,
                ),
                Asset(
                    id="cell2-hmi",
                    name="Cell 2 HMI",
                    type=AssetType.HMI,
                    description="Local operator interface",
                    criticality=4,
                ),
                Asset(
                    id="cell2-robot",
                    name="Cell 2 Robot Controller",
                    type=AssetType.PLC,
                    description="Industrial robot controller",
                    criticality=5,
                ),
            ],
        ),
    ]

    conduits = [
        Conduit(
            id="c-ent-dmz",
            name="Enterprise to DMZ",
            from_zone="enterprise",
            to_zone="dmz",
            description="Controlled access from IT to DMZ",
            requires_inspection=True,
            flows=[
                ProtocolFlow(protocol="https", port=443, direction=ConduitDirection.BIDIRECTIONAL),
                ProtocolFlow(protocol="sql", port=1433, direction=ConduitDirection.INBOUND),
            ],
        ),
        Conduit(
            id="c-dmz-scada",
            name="DMZ to SCADA",
            from_zone="dmz",
            to_zone="scada",
            description="Controlled access from DMZ to SCADA network",
            requires_inspection=True,
            flows=[
                ProtocolFlow(protocol="opcua", port=4840, direction=ConduitDirection.BIDIRECTIONAL),
                ProtocolFlow(protocol="rdp", port=3389, direction=ConduitDirection.OUTBOUND),
            ],
        ),
        Conduit(
            id="c-scada-cell1",
            name="SCADA to Cell 1",
            from_zone="scada",
            to_zone="cell1",
            description="SCADA communication to production cell 1",
            flows=[
                ProtocolFlow(
                    protocol="ethernet_ip", port=44818, direction=ConduitDirection.BIDIRECTIONAL
                ),
                ProtocolFlow(
                    protocol="modbus_tcp", port=502, direction=ConduitDirection.BIDIRECTIONAL
                ),
            ],
        ),
        Conduit(
            id="c-scada-cell2",
            name="SCADA to Cell 2",
            from_zone="scada",
            to_zone="cell2",
            description="SCADA communication to production cell 2",
            flows=[
                ProtocolFlow(
                    protocol="ethernet_ip", port=44818, direction=ConduitDirection.BIDIRECTIONAL
                ),
                ProtocolFlow(
                    protocol="modbus_tcp", port=502, direction=ConduitDirection.BIDIRECTIONAL
                ),
            ],
        ),
    ]

    return Project(
        version="1.0",
        project=ProjectMetadata(
            name="Manufacturing Plant",
            description="Simplified manufacturing facility with central SCADA, "
            "two production cells, and an industrial DMZ for IT/OT separation.",
            standard="IEC62443",
            version="1.0",
            author="InduForm Templates",
        ),
        zones=zones,
        conduits=conduits,
    )


def _create_water_treatment() -> Project:
    """Create a Water Treatment template for water/wastewater facility."""
    zones = [
        Zone(
            id="corporate",
            name="Corporate Network",
            type=ZoneType.ENTERPRISE,
            security_level_target=1,
            description="Utility corporate IT network",
            assets=[
                Asset(
                    id="billing-system",
                    name="Billing System",
                    type=AssetType.SERVER,
                    description="Customer billing and management",
                    criticality=2,
                ),
                Asset(
                    id="gis-server",
                    name="GIS Server",
                    type=AssetType.SERVER,
                    description="Geographic information system",
                    criticality=2,
                ),
            ],
        ),
        Zone(
            id="utility-dmz",
            name="Utility DMZ",
            type=ZoneType.DMZ,
            security_level_target=3,
            description="Security boundary between corporate and operations",
            assets=[
                Asset(
                    id="dmz-firewall",
                    name="DMZ Firewall",
                    type=AssetType.FIREWALL,
                    description="Industrial-grade firewall",
                    criticality=5,
                ),
                Asset(
                    id="historian",
                    name="Historian Server",
                    type=AssetType.HISTORIAN,
                    description="Operational data historian",
                    criticality=4,
                ),
                Asset(
                    id="reporting-server",
                    name="Reporting Server",
                    type=AssetType.SERVER,
                    description="Regulatory compliance reporting",
                    criticality=3,
                ),
            ],
        ),
        Zone(
            id="scada-network",
            name="SCADA Network",
            type=ZoneType.SITE,
            security_level_target=2,
            description="Central SCADA system for plant-wide monitoring",
            assets=[
                Asset(
                    id="scada-master",
                    name="SCADA Master",
                    type=AssetType.SCADA,
                    description="Central SCADA server",
                    criticality=5,
                ),
                Asset(
                    id="scada-backup",
                    name="SCADA Backup",
                    type=AssetType.SCADA,
                    description="Redundant SCADA server",
                    criticality=5,
                ),
                Asset(
                    id="control-room-hmi",
                    name="Control Room HMI",
                    type=AssetType.HMI,
                    description="Main control room operator station",
                    criticality=4,
                ),
                Asset(
                    id="eng-ws",
                    name="Engineering Workstation",
                    type=AssetType.ENGINEERING_WORKSTATION,
                    description="PLC/RTU programming station",
                    criticality=4,
                ),
            ],
        ),
        Zone(
            id="treatment-process",
            name="Treatment Process",
            type=ZoneType.CELL,
            security_level_target=3,
            description="Water treatment process control systems",
            assets=[
                Asset(
                    id="treatment-plc-1",
                    name="Treatment PLC 1",
                    type=AssetType.PLC,
                    description="Primary treatment controller",
                    criticality=5,
                ),
                Asset(
                    id="treatment-plc-2",
                    name="Treatment PLC 2",
                    type=AssetType.PLC,
                    description="Secondary treatment controller",
                    criticality=5,
                ),
                Asset(
                    id="chemical-plc",
                    name="Chemical Dosing PLC",
                    type=AssetType.PLC,
                    description="Chemical dosing controller",
                    criticality=5,
                ),
                Asset(
                    id="treatment-hmi",
                    name="Treatment HMI",
                    type=AssetType.HMI,
                    description="Local treatment operator panel",
                    criticality=4,
                ),
                Asset(
                    id="analyzer",
                    name="Water Quality Analyzer",
                    type=AssetType.OTHER,
                    description="Online water quality monitoring",
                    criticality=4,
                ),
            ],
        ),
        Zone(
            id="distribution",
            name="Distribution Network",
            type=ZoneType.AREA,
            security_level_target=3,
            description="Water distribution SCADA including remote sites",
            assets=[
                Asset(
                    id="dist-rtu-1",
                    name="Pump Station RTU 1",
                    type=AssetType.RTU,
                    description="Remote pump station controller",
                    criticality=4,
                ),
                Asset(
                    id="dist-rtu-2",
                    name="Pump Station RTU 2",
                    type=AssetType.RTU,
                    description="Remote pump station controller",
                    criticality=4,
                ),
                Asset(
                    id="dist-rtu-3",
                    name="Tank Level RTU",
                    type=AssetType.RTU,
                    description="Storage tank level monitoring",
                    criticality=4,
                ),
                Asset(
                    id="cellular-router",
                    name="Cellular Router",
                    type=AssetType.ROUTER,
                    description="Cellular communication for remote sites",
                    criticality=4,
                ),
            ],
        ),
    ]

    conduits = [
        Conduit(
            id="c-corp-dmz",
            name="Corporate to DMZ",
            from_zone="corporate",
            to_zone="utility-dmz",
            description="Controlled access from corporate IT",
            requires_inspection=True,
            flows=[
                ProtocolFlow(protocol="https", port=443, direction=ConduitDirection.BIDIRECTIONAL),
                ProtocolFlow(protocol="sql", port=1433, direction=ConduitDirection.INBOUND),
            ],
        ),
        Conduit(
            id="c-dmz-scada",
            name="DMZ to SCADA",
            from_zone="utility-dmz",
            to_zone="scada-network",
            description="Data transfer between DMZ and SCADA",
            requires_inspection=True,
            flows=[
                ProtocolFlow(protocol="opcua", port=4840, direction=ConduitDirection.BIDIRECTIONAL),
                ProtocolFlow(protocol="rdp", port=3389, direction=ConduitDirection.OUTBOUND),
            ],
        ),
        Conduit(
            id="c-scada-treatment",
            name="SCADA to Treatment",
            from_zone="scada-network",
            to_zone="treatment-process",
            description="SCADA communication to treatment PLCs",
            flows=[
                ProtocolFlow(
                    protocol="modbus_tcp", port=502, direction=ConduitDirection.BIDIRECTIONAL
                ),
                ProtocolFlow(
                    protocol="ethernet_ip", port=44818, direction=ConduitDirection.BIDIRECTIONAL
                ),
            ],
        ),
        Conduit(
            id="c-scada-dist",
            name="SCADA to Distribution",
            from_zone="scada-network",
            to_zone="distribution",
            description="SCADA communication to remote RTUs",
            flows=[
                ProtocolFlow(protocol="dnp3", port=20000, direction=ConduitDirection.BIDIRECTIONAL),
                ProtocolFlow(
                    protocol="modbus_tcp", port=502, direction=ConduitDirection.BIDIRECTIONAL
                ),
            ],
        ),
    ]

    return Project(
        version="1.0",
        project=ProjectMetadata(
            name="Water Treatment Facility",
            description="Water/wastewater treatment facility with central SCADA, "
            "treatment process control, and distributed remote sites for pump stations and tanks.",
            standard="IEC62443",
            version="1.0",
            author="InduForm Templates",
        ),
        zones=zones,
        conduits=conduits,
    )


def _create_power_substation() -> Project:
    """Create a Power Substation template for electrical grid substation."""
    zones = [
        Zone(
            id="utility-network",
            name="Utility Network",
            type=ZoneType.ENTERPRISE,
            security_level_target=2,
            description="Utility enterprise network for grid operations",
            assets=[
                Asset(
                    id="ems",
                    name="Energy Management System",
                    type=AssetType.SCADA,
                    description="Utility-wide EMS",
                    criticality=5,
                ),
                Asset(
                    id="outage-mgmt",
                    name="Outage Management System",
                    type=AssetType.SERVER,
                    description="OMS for outage tracking",
                    criticality=3,
                ),
            ],
        ),
        Zone(
            id="substation-dmz",
            name="Substation DMZ",
            type=ZoneType.DMZ,
            security_level_target=3,
            description="Security boundary for substation access",
            assets=[
                Asset(
                    id="sub-firewall",
                    name="Substation Firewall",
                    type=AssetType.FIREWALL,
                    description="Industrial firewall/VPN gateway",
                    criticality=5,
                ),
                Asset(
                    id="sub-router",
                    name="Substation Router",
                    type=AssetType.ROUTER,
                    description="WAN router for utility communication",
                    criticality=5,
                ),
                Asset(
                    id="data-diode",
                    name="Data Diode",
                    type=AssetType.OTHER,
                    description="Unidirectional security gateway",
                    criticality=5,
                ),
            ],
        ),
        Zone(
            id="control-house",
            name="Control House",
            type=ZoneType.SITE,
            security_level_target=3,
            description="Substation control building with RTU and protection systems",
            assets=[
                Asset(
                    id="sub-rtu",
                    name="Substation RTU",
                    type=AssetType.RTU,
                    description="Remote terminal unit for SCADA",
                    criticality=5,
                ),
                Asset(
                    id="sub-hmi",
                    name="Substation HMI",
                    type=AssetType.HMI,
                    description="Local substation operator interface",
                    criticality=4,
                ),
                Asset(
                    id="protection-relay-1",
                    name="Protection Relay Panel 1",
                    type=AssetType.IED,
                    description="Line protection IEDs",
                    criticality=5,
                ),
                Asset(
                    id="protection-relay-2",
                    name="Protection Relay Panel 2",
                    type=AssetType.IED,
                    description="Transformer protection IEDs",
                    criticality=5,
                ),
                Asset(
                    id="gps-clock",
                    name="GPS Clock",
                    type=AssetType.OTHER,
                    description="Precision time source for synchrophasors",
                    criticality=4,
                ),
                Asset(
                    id="eng-laptop",
                    name="Engineering Laptop",
                    type=AssetType.ENGINEERING_WORKSTATION,
                    description="Relay configuration workstation",
                    criticality=3,
                ),
            ],
        ),
        Zone(
            id="switchyard",
            name="Switchyard",
            type=ZoneType.CELL,
            security_level_target=4,
            description="High-voltage switchyard with IEDs and field devices",
            assets=[
                Asset(
                    id="bay-ied-1",
                    name="Bay IED 1",
                    type=AssetType.IED,
                    description="Line bay protection/control IED",
                    criticality=5,
                ),
                Asset(
                    id="bay-ied-2",
                    name="Bay IED 2",
                    type=AssetType.IED,
                    description="Transformer bay protection/control IED",
                    criticality=5,
                ),
                Asset(
                    id="bay-ied-3",
                    name="Bay IED 3",
                    type=AssetType.IED,
                    description="Bus protection IED",
                    criticality=5,
                ),
                Asset(
                    id="merging-unit-1",
                    name="Merging Unit 1",
                    type=AssetType.IED,
                    description="IEC 61850-9-2 merging unit",
                    criticality=5,
                ),
                Asset(
                    id="process-bus-switch",
                    name="Process Bus Switch",
                    type=AssetType.SWITCH,
                    description="IEC 61850 process bus Ethernet switch",
                    criticality=5,
                ),
            ],
        ),
    ]

    conduits = [
        Conduit(
            id="c-util-dmz",
            name="Utility to Substation DMZ",
            from_zone="utility-network",
            to_zone="substation-dmz",
            description="WAN connection from utility to substation",
            requires_inspection=True,
            flows=[
                ProtocolFlow(protocol="ipsec", port=500, direction=ConduitDirection.BIDIRECTIONAL),
                ProtocolFlow(protocol="dnp3", port=20000, direction=ConduitDirection.BIDIRECTIONAL),
            ],
        ),
        Conduit(
            id="c-dmz-control",
            name="DMZ to Control House",
            from_zone="substation-dmz",
            to_zone="control-house",
            description="Controlled access to control house",
            requires_inspection=True,
            flows=[
                ProtocolFlow(protocol="dnp3", port=20000, direction=ConduitDirection.BIDIRECTIONAL),
                ProtocolFlow(
                    protocol="iec61850_mms", port=102, direction=ConduitDirection.BIDIRECTIONAL
                ),
                ProtocolFlow(protocol="ssh", port=22, direction=ConduitDirection.OUTBOUND),
            ],
        ),
        Conduit(
            id="c-control-switchyard",
            name="Control House to Switchyard",
            from_zone="control-house",
            to_zone="switchyard",
            description="Station bus to process bus communication",
            flows=[
                ProtocolFlow(
                    protocol="iec61850_goose",
                    direction=ConduitDirection.BIDIRECTIONAL,
                    description="GOOSE multicast (Layer 2)",
                ),
                ProtocolFlow(
                    protocol="iec61850_mms", port=102, direction=ConduitDirection.BIDIRECTIONAL
                ),
                ProtocolFlow(
                    protocol="iec61850_sv",
                    direction=ConduitDirection.INBOUND,
                    description="Sampled Values from merging units (Layer 2)",
                ),
            ],
        ),
    ]

    return Project(
        version="1.0",
        project=ProjectMetadata(
            name="Power Substation",
            description="Electrical grid substation with IEC 61850 architecture, "
            "protection relays, RTU for SCADA, and high-voltage switchyard IEDs.",
            standard="IEC62443",
            version="1.0",
            author="InduForm Templates",
        ),
        zones=zones,
        conduits=conduits,
    )


# Template registry
_TEMPLATES: dict[str, dict] = {
    "purdue-model": {
        "name": "Purdue Model",
        "description": "Classic 5-level Purdue Enterprise Reference Architecture (PERA) "
        "for industrial control systems. Includes Enterprise, Site Business, DMZ, "
        "Site Operations, Area Supervisory, Basic Control, and Process levels with "
        "appropriate security levels and conduits.",
        "factory": _create_purdue_model,
    },
    "manufacturing-plant": {
        "name": "Manufacturing Plant",
        "description": "Simplified manufacturing facility architecture with Enterprise, "
        "Industrial DMZ, central SCADA network, and two production cells. Includes "
        "typical assets like PLCs, HMIs, Historian, and engineering workstations.",
        "factory": _create_manufacturing_plant,
    },
    "water-treatment": {
        "name": "Water Treatment Facility",
        "description": "Water/wastewater treatment facility with Corporate network, "
        "Utility DMZ, SCADA network, Treatment Process zone, and Distribution network "
        "for remote pump stations and tanks. Includes treatment PLCs, RTUs, and analyzers.",
        "factory": _create_water_treatment,
    },
    "power-substation": {
        "name": "Power Substation",
        "description": "Electrical grid substation architecture with Utility Network, "
        "Substation DMZ, Control House, and Switchyard. Features IEC 61850 components "
        "including IEDs, merging units, protection relays, and RTU for SCADA integration.",
        "factory": _create_power_substation,
    },
}


def get_templates() -> dict[str, dict]:
    """Get all available project templates.

    Returns a dictionary mapping template_id to template info containing:
    - name: Human-readable template name
    - description: Detailed description of the template
    - project: The Project instance

    Returns:
        Dict mapping template_id to {name, description, project}
    """
    result = {}
    for template_id, template_info in _TEMPLATES.items():
        result[template_id] = {
            "name": template_info["name"],
            "description": template_info["description"],
            "project": template_info["factory"](),
        }
    return result


def get_template(template_id: str) -> Project:
    """Get a specific template by ID.

    Args:
        template_id: The unique identifier for the template

    Returns:
        A new Project instance for the requested template

    Raises:
        KeyError: If template_id is not found
    """
    if template_id not in _TEMPLATES:
        available = ", ".join(_TEMPLATES.keys())
        raise KeyError(f"Template '{template_id}' not found. Available templates: {available}")

    return _TEMPLATES[template_id]["factory"]()


def list_template_ids() -> list[str]:
    """Get a list of all available template IDs.

    Returns:
        List of template ID strings
    """
    return list(_TEMPLATES.keys())
