// Demo mode mock data — rich dataset for a realistic Water Treatment Facility

import type {
  Project, Zone, Conduit, ValidationReport, PolicyViolation,
  Vulnerability, VulnerabilitySummary,
} from '../types/models';
import type { RiskAssessment } from '../api/client';

// ── Users ──────────────────────────────────────────────────────────

export const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@induform.example',
  username: 'demo',
  display_name: 'Demo User',
  created_at: '2025-01-15T10:00:00Z',
  is_active: true,
  is_admin: true,
};

const DEMO_USERS = [
  DEMO_USER,
  { id: 'user-alice', email: 'alice@induform.example', username: 'alice.chen', display_name: 'Alice Chen', created_at: '2025-02-01T09:00:00Z', is_active: true, is_admin: false },
  { id: 'user-bob', email: 'bob@induform.example', username: 'bob.mueller', display_name: 'Bob Mueller', created_at: '2025-03-10T14:00:00Z', is_active: true, is_admin: false },
  { id: 'user-carol', email: 'carol@induform.example', username: 'carol.tanaka', display_name: 'Carol Tanaka', created_at: '2025-04-05T11:30:00Z', is_active: true, is_admin: true },
];

export { DEMO_USERS };

// ── Project IDs ────────────────────────────────────────────────────

export const DEMO_PROJECT_ID = 'demo-project-001';
const PROJECT2_ID = 'demo-project-002';
const PROJECT3_ID = 'demo-project-003';

// ── Zones — full Purdue model ──────────────────────────────────────

const zones: Zone[] = [
  {
    id: 'zone-enterprise',
    name: 'Enterprise Network',
    type: 'enterprise',
    security_level_target: 2,
    security_level_capability: 3,
    description: 'Corporate IT network with ERP, email, Active Directory, and business intelligence platforms.',
    network_segment: '10.0.0.0/16',
    assets: [
      {
        id: 'asset-erp', name: 'SAP ERP Server', type: 'server',
        ip_address: '10.0.1.5', vendor: 'SAP', model: 'S/4HANA',
        description: 'Enterprise resource planning for procurement and finance.',
        criticality: 3, os_name: 'SUSE Linux', os_version: '15 SP5',
        subnet: '10.0.1.0/24', open_ports: '443,3200,3300', protocols: 'HTTPS,RFC',
      },
      {
        id: 'asset-historian', name: 'Plant Historian', type: 'historian',
        ip_address: '10.0.1.10', vendor: 'AVEVA', model: 'PI Server 2024',
        description: 'Enterprise data historian aggregating plant-wide process data for business analytics.',
        criticality: 3, os_name: 'Windows Server', os_version: '2022',
        subnet: '10.0.1.0/24', open_ports: '5450,443', protocols: 'PI-SDK,HTTPS',
        cpe: 'cpe:2.3:a:aveva:pi_server:2024:*:*:*:*:*:*:*',
      },
      {
        id: 'asset-ad', name: 'Domain Controller', type: 'server',
        ip_address: '10.0.1.2', vendor: 'Microsoft', model: 'Windows Server 2022 DC',
        description: 'Active Directory domain controller for enterprise authentication.',
        criticality: 4, os_name: 'Windows Server', os_version: '2022',
        subnet: '10.0.1.0/24', open_ports: '53,88,389,636', protocols: 'DNS,Kerberos,LDAP,LDAPS',
      },
    ],
    x_position: 400,
    y_position: 50,
  },
  {
    id: 'zone-dmz',
    name: 'Industrial DMZ',
    type: 'dmz',
    security_level_target: 3,
    security_level_capability: 3,
    description: 'Demilitarized zone between IT and OT. Hosts jump servers, data diodes, and remote access gateways.',
    network_segment: '10.5.0.0/24',
    assets: [
      {
        id: 'asset-jump', name: 'Remote Access Jump Host', type: 'jump_host',
        ip_address: '10.5.0.10', vendor: 'CyberArk', model: 'Privileged Access Manager',
        description: 'Privileged access gateway for remote vendor maintenance sessions.',
        criticality: 4, os_name: 'Linux', os_version: 'RHEL 9.3',
        subnet: '10.5.0.0/24', open_ports: '443,22', protocols: 'HTTPS,SSH',
      },
      {
        id: 'asset-diode', name: 'Data Diode', type: 'firewall',
        ip_address: '10.5.0.20', vendor: 'Waterfall Security', model: 'Unidirectional Gateway',
        description: 'Hardware-enforced one-way data transfer from OT to IT.',
        criticality: 4, firmware_version: '6.2.1',
      },
      {
        id: 'asset-patch', name: 'Patch Management Server', type: 'server',
        ip_address: '10.5.0.30', vendor: 'Microsoft', model: 'WSUS',
        description: 'Windows Server Update Services for controlled OT patching.',
        criticality: 3, os_name: 'Windows Server', os_version: '2022',
        subnet: '10.5.0.0/24', open_ports: '8530,8531', protocols: 'HTTP,HTTPS',
        last_patched: '2025-11-15',
      },
    ],
    x_position: 400,
    y_position: 200,
  },
  {
    id: 'zone-site',
    name: 'Site Operations',
    type: 'site',
    security_level_target: 3,
    security_level_capability: 2,
    description: 'Site-level operations for the water treatment facility. MES, scheduling, and production management.',
    network_segment: '10.10.0.0/16',
    assets: [
      {
        id: 'asset-mes', name: 'MES Server', type: 'server',
        ip_address: '10.10.1.5', vendor: 'Siemens', model: 'SIMATIC IT',
        description: 'Manufacturing Execution System managing batch processes and work orders.',
        criticality: 3, os_name: 'Windows Server', os_version: '2019',
        subnet: '10.10.1.0/24', open_ports: '443,1433', protocols: 'HTTPS,SQL',
      },
      {
        id: 'asset-log', name: 'OT Syslog Collector', type: 'server',
        ip_address: '10.10.1.20', vendor: 'Splunk', model: 'Universal Forwarder',
        description: 'Centralized log collection for OT security monitoring and incident response.',
        criticality: 2, os_name: 'Linux', os_version: 'Ubuntu 22.04',
        subnet: '10.10.1.0/24', open_ports: '514,9997', protocols: 'Syslog,Splunk-HEC',
      },
    ],
    x_position: 150,
    y_position: 350,
  },
  {
    id: 'zone-control',
    name: 'Process Control Network',
    type: 'area',
    security_level_target: 3,
    security_level_capability: 3,
    description: 'SCADA and HMI systems for supervisory control of water treatment processes.',
    network_segment: '10.20.0.0/16',
    assets: [
      {
        id: 'asset-scada', name: 'SCADA Server', type: 'scada',
        ip_address: '10.20.1.10', vendor: 'Siemens', model: 'WinCC OA v3.19',
        description: 'Primary supervisory control and data acquisition server.',
        criticality: 5, os_name: 'Windows Server', os_version: '2019',
        subnet: '10.20.1.0/24', open_ports: '4840,5678', protocols: 'OPC-UA,WinCC',
        cpe: 'cpe:2.3:a:siemens:wincc_oa:3.19:*:*:*:*:*:*:*',
        last_patched: '2025-09-20',
      },
      {
        id: 'asset-hmi1', name: 'Operator HMI #1', type: 'hmi',
        ip_address: '10.20.1.20', vendor: 'Siemens', model: 'SIMATIC Comfort Panel',
        description: 'Primary operator workstation for treatment process overview.',
        criticality: 4, firmware_version: 'V17 Update 5',
        subnet: '10.20.1.0/24', open_ports: '102,4840', protocols: 'S7comm,OPC-UA',
      },
      {
        id: 'asset-hmi2', name: 'Operator HMI #2', type: 'hmi',
        ip_address: '10.20.1.21', vendor: 'Siemens', model: 'SIMATIC Comfort Panel',
        description: 'Secondary operator workstation for chemical dosing and filtration.',
        criticality: 4, firmware_version: 'V17 Update 5',
        subnet: '10.20.1.0/24', open_ports: '102,4840', protocols: 'S7comm,OPC-UA',
      },
      {
        id: 'asset-eng', name: 'Engineering Workstation', type: 'engineering_workstation',
        ip_address: '10.20.1.50', vendor: 'Siemens', model: 'TIA Portal V18',
        description: 'Programming and configuration workstation for PLCs and HMIs.',
        criticality: 5, os_name: 'Windows 11', os_version: '23H2',
        subnet: '10.20.1.0/24', open_ports: '102,4840', protocols: 'S7comm,OPC-UA',
      },
    ],
    x_position: 400,
    y_position: 380,
  },
  {
    id: 'zone-field',
    name: 'Field Device Network',
    type: 'cell',
    security_level_target: 4,
    security_level_capability: 2,
    description: 'PLCs, RTUs, and I/O modules directly controlling pumps, valves, and chemical dosing.',
    network_segment: '10.30.0.0/16',
    assets: [
      {
        id: 'asset-plc1', name: 'Intake PLC', type: 'plc',
        ip_address: '10.30.1.10', vendor: 'Siemens', model: 'S7-1500 CPU 1516-3',
        firmware_version: 'V2.9.7', criticality: 5,
        description: 'Controls raw water intake pumps and pre-screening.',
        subnet: '10.30.1.0/24', open_ports: '102', protocols: 'S7comm,Profinet',
        cpe: 'cpe:2.3:h:siemens:s7-1500:*:*:*:*:*:*:*:*',
      },
      {
        id: 'asset-plc2', name: 'Treatment PLC', type: 'plc',
        ip_address: '10.30.1.11', vendor: 'Siemens', model: 'S7-1500 CPU 1516-3',
        firmware_version: 'V2.9.7', criticality: 5,
        description: 'Controls coagulation, flocculation, sedimentation, and filtration stages.',
        subnet: '10.30.1.0/24', open_ports: '102', protocols: 'S7comm,Profinet',
      },
      {
        id: 'asset-plc3', name: 'Chemical Dosing PLC', type: 'plc',
        ip_address: '10.30.1.12', vendor: 'Allen-Bradley', model: 'ControlLogix 5580',
        firmware_version: 'V34.011', criticality: 5,
        description: 'Manages chlorine, fluoride, and pH adjustment dosing pumps.',
        subnet: '10.30.1.0/24', open_ports: '44818', protocols: 'EtherNet/IP,CIP',
        cpe: 'cpe:2.3:h:rockwellautomation:controllogix_5580:*:*:*:*:*:*:*:*',
      },
      {
        id: 'asset-rtu1', name: 'Distribution RTU', type: 'rtu',
        ip_address: '10.30.2.10', vendor: 'Schneider Electric', model: 'SCADAPack 474',
        firmware_version: '9.0.3', criticality: 4,
        description: 'Remote telemetry unit monitoring distribution network pressure and flow.',
        subnet: '10.30.2.0/24', open_ports: '502', protocols: 'Modbus/TCP,DNP3',
      },
      {
        id: 'asset-switch1', name: 'OT Network Switch', type: 'switch',
        ip_address: '10.30.0.1', vendor: 'Hirschmann', model: 'RSP25',
        firmware_version: '09.1.00', criticality: 3,
        description: 'Managed industrial Ethernet switch for field device network.',
        subnet: '10.30.0.0/24', protocols: 'Profinet,SNMP',
      },
    ],
    x_position: 650,
    y_position: 380,
  },
  {
    id: 'zone-safety',
    name: 'Safety Instrumented Systems',
    type: 'safety',
    security_level_target: 4,
    security_level_capability: 4,
    description: 'SIL-2 rated safety systems for emergency shutdown, chlorine leak detection, and fire suppression.',
    network_segment: '10.40.0.0/24',
    assets: [
      {
        id: 'asset-sis', name: 'Safety Controller', type: 'plc',
        ip_address: '10.40.0.10', vendor: 'HIMA', model: 'HIMax X-SIL-3',
        firmware_version: '8.4.0', criticality: 5,
        description: 'SIL-3 safety controller for emergency shutdown and gas detection.',
        subnet: '10.40.0.0/24', open_ports: '9000', protocols: 'SafeEthernet',
      },
      {
        id: 'asset-gas', name: 'Chlorine Gas Detector', type: 'ied',
        ip_address: '10.40.0.20', vendor: 'Dräger', model: 'Polytron 7000',
        firmware_version: '3.2', criticality: 5,
        description: 'Fixed chlorine gas monitoring with automatic alarm and valve isolation.',
      },
    ],
    x_position: 650,
    y_position: 550,
  },
];

// ── Conduits ───────────────────────────────────────────────────────

const conduits: Conduit[] = [
  {
    id: 'conduit-ent-dmz',
    name: 'Enterprise ↔ DMZ',
    from_zone: 'zone-enterprise',
    to_zone: 'zone-dmz',
    flows: [
      { protocol: 'HTTPS', port: 443, direction: 'bidirectional', description: 'Remote access portal' },
      { protocol: 'Syslog', port: 514, direction: 'inbound', description: 'OT log forwarding to SIEM' },
      { protocol: 'PI-SDK', port: 5450, direction: 'inbound', description: 'Historian data replication' },
    ],
    security_level_required: 3,
    requires_inspection: true,
    description: 'Next-gen firewall with IDS/IPS between corporate IT and industrial DMZ.',
  },
  {
    id: 'conduit-dmz-site',
    name: 'DMZ ↔ Site Ops',
    from_zone: 'zone-dmz',
    to_zone: 'zone-site',
    flows: [
      { protocol: 'HTTPS', port: 443, direction: 'bidirectional', description: 'Patch distribution and MES sync' },
      { protocol: 'SQL', port: 1433, direction: 'outbound', description: 'Batch production data export' },
    ],
    security_level_required: 3,
    requires_inspection: true,
    description: 'Filtered link from DMZ to site-level MES and log servers.',
  },
  {
    id: 'conduit-site-ctrl',
    name: 'Site Ops ↔ Control',
    from_zone: 'zone-site',
    to_zone: 'zone-control',
    flows: [
      { protocol: 'OPC-UA', port: 4840, direction: 'bidirectional', description: 'Process data exchange' },
      { protocol: 'Syslog', port: 514, direction: 'inbound', description: 'Control system log forwarding' },
    ],
    security_level_required: 3,
    requires_inspection: true,
    description: 'OPC-UA gateway link between site operations and process control layer.',
  },
  {
    id: 'conduit-dmz-ctrl',
    name: 'DMZ → Control (Jump)',
    from_zone: 'zone-dmz',
    to_zone: 'zone-control',
    flows: [
      { protocol: 'RDP', port: 3389, direction: 'outbound', description: 'Remote engineering session via jump host' },
    ],
    security_level_required: 3,
    requires_inspection: true,
    description: 'Jump host remote access to engineering workstations — session recorded.',
  },
  {
    id: 'conduit-ctrl-field',
    name: 'Control ↔ Field',
    from_zone: 'zone-control',
    to_zone: 'zone-field',
    flows: [
      { protocol: 'S7comm', port: 102, direction: 'bidirectional', description: 'PLC programming and process I/O' },
      { protocol: 'Profinet', port: 34964, direction: 'bidirectional', description: 'Real-time I/O data' },
      { protocol: 'EtherNet/IP', port: 44818, direction: 'bidirectional', description: 'Allen-Bradley PLC communication' },
      { protocol: 'Modbus/TCP', port: 502, direction: 'outbound', description: 'Legacy RTU polling' },
    ],
    security_level_required: 4,
    requires_inspection: true,
    description: 'Industrial firewall between SCADA/HMI and field-level controllers.',
  },
  {
    id: 'conduit-ctrl-safety',
    name: 'Control ↔ Safety',
    from_zone: 'zone-control',
    to_zone: 'zone-safety',
    flows: [
      { protocol: 'SafeEthernet', port: 9000, direction: 'bidirectional', description: 'Safety status and interlock signals' },
    ],
    security_level_required: 4,
    requires_inspection: false,
    description: 'Dedicated, isolated link for safety interlocks — air-gapped from other networks.',
  },
  {
    id: 'conduit-field-safety',
    name: 'Field ↔ Safety',
    from_zone: 'zone-field',
    to_zone: 'zone-safety',
    flows: [
      { protocol: 'Hardwired', direction: 'bidirectional', description: 'Physical relay wiring for ESD trip signals' },
    ],
    security_level_required: 4,
    requires_inspection: false,
    description: 'Hard-wired safety interlocks — no network dependency.',
  },
];

// ── Main Demo Project ──────────────────────────────────────────────

export const DEMO_PROJECT: Project = {
  version: '1.0',
  project: {
    name: 'Water Treatment Facility',
    description: 'IEC 62443 zone/conduit model for a municipal water treatment plant processing 50 ML/day. Covers intake, treatment, chemical dosing, distribution, and safety systems.',
    compliance_standards: ['IEC62443', 'NIST_CSF'],
    version: '2.3.1',
    author: 'Demo User',
    allowed_protocols: ['OPC-UA', 'S7comm', 'Profinet', 'Modbus/TCP', 'EtherNet/IP', 'HTTPS', 'SSH', 'DNP3'],
  },
  zones,
  conduits,
};

// ── Second project (for project list) ──────────────────────────────

const project2Zones: Zone[] = [
  {
    id: 'p2-zone-corp', name: 'Corporate IT', type: 'enterprise',
    security_level_target: 2, security_level_capability: 2,
    description: 'Corporate network segment.', assets: [
      { id: 'p2-a1', name: 'HMI Server', type: 'hmi', criticality: 3 },
      { id: 'p2-a2', name: 'Historian', type: 'historian', criticality: 3 },
    ],
    x_position: 200, y_position: 100,
  },
  {
    id: 'p2-zone-scada', name: 'SCADA Network', type: 'area',
    security_level_target: 3, security_level_capability: 3,
    description: 'SCADA supervisory layer.', assets: [
      { id: 'p2-a3', name: 'SCADA Master', type: 'scada', criticality: 4 },
    ],
    x_position: 200, y_position: 300,
  },
  {
    id: 'p2-zone-substation', name: 'Substation LAN', type: 'cell',
    security_level_target: 3, security_level_capability: 2,
    description: 'Substation local area network.', assets: [
      { id: 'p2-a4', name: 'Protection IED', type: 'ied', criticality: 5 },
      { id: 'p2-a5', name: 'Bay Controller', type: 'rtu', criticality: 4 },
      { id: 'p2-a6', name: 'Merging Unit', type: 'ied', criticality: 4 },
    ],
    x_position: 500, y_position: 300,
  },
];

export const DEMO_PROJECT_2: Project = {
  version: '1.0',
  project: {
    name: 'Power Substation 4B',
    description: 'IEC 62443 / NERC CIP model for a 230 kV transmission substation with IEC 61850 architecture.',
    compliance_standards: ['IEC62443', 'NERC_CIP'],
    version: '1.1.0',
    author: 'Alice Chen',
  },
  zones: project2Zones,
  conduits: [
    {
      id: 'p2-c1', name: 'Corp ↔ SCADA', from_zone: 'p2-zone-corp', to_zone: 'p2-zone-scada',
      flows: [{ protocol: 'OPC-UA', port: 4840, direction: 'bidirectional', description: 'Data exchange' }],
      security_level_required: 3, requires_inspection: true, description: 'Firewall between IT and SCADA.',
    },
    {
      id: 'p2-c2', name: 'SCADA ↔ Substation', from_zone: 'p2-zone-scada', to_zone: 'p2-zone-substation',
      flows: [
        { protocol: 'IEC 61850 MMS', port: 102, direction: 'bidirectional', description: 'GOOSE and MMS messaging' },
        { protocol: 'DNP3', port: 20000, direction: 'outbound', description: 'Legacy polling' },
      ],
      security_level_required: 3, requires_inspection: true, description: 'IEC 61850 link to substation.',
    },
  ],
};

// ── Validation ─────────────────────────────────────────────────────

export const DEMO_VALIDATION: ValidationReport = {
  valid: false,
  results: [
    {
      severity: 'error', code: 'SL_CRITICAL_GAP',
      message: 'Field Device Network: security capability (SL 2) is critically below target (SL 4). Gap of 2 levels.',
      location: 'zone-field',
      recommendation: 'Deploy industrial IDS, enable encrypted communications (TLS for OPC-UA, Profinet Security Class 1), and implement application whitelisting on all PLCs.',
    },
    {
      severity: 'error', code: 'SL_GAP',
      message: 'Site Operations: security capability (SL 2) is below target (SL 3).',
      location: 'zone-site',
      recommendation: 'Enable role-based access control on MES server, deploy host-based firewall, and add network monitoring.',
    },
    {
      severity: 'warning', code: 'MISSING_SL_CAP',
      message: 'Enterprise Network: security level capability (SL 3) exceeds target (SL 2) — consider raising the target to match.',
      location: 'zone-enterprise',
    },
    {
      severity: 'warning', code: 'UNENCRYPTED_FLOW',
      message: 'Conduit "Control ↔ Field" carries unencrypted Modbus/TCP traffic on port 502.',
      location: 'conduit-ctrl-field',
      recommendation: 'Migrate to Modbus/TCP Security (TLS) or deploy a Modbus-aware industrial firewall with deep packet inspection.',
    },
    {
      severity: 'warning', code: 'LEGACY_PROTOCOL',
      message: 'Conduit "Control ↔ Field" uses legacy Modbus/TCP without authentication.',
      location: 'conduit-ctrl-field',
      recommendation: 'Evaluate migration to OPC-UA or deploy protocol-aware firewall rules.',
    },
    {
      severity: 'warning', code: 'SINGLE_CONDUIT',
      message: 'Enterprise Network has only one path to the OT network — no redundant conduit for failover.',
      location: 'zone-enterprise',
      recommendation: 'Consider adding a secondary conduit through a separate firewall for high-availability.',
    },
    {
      severity: 'info', code: 'CONDUIT_INSPECTION',
      message: '5 of 7 conduits have inspection enabled — all critical paths are monitored.',
      location: 'global',
    },
    {
      severity: 'info', code: 'SAFETY_ISOLATED',
      message: 'Safety Instrumented Systems zone is properly isolated with dedicated conduits.',
      location: 'zone-safety',
    },
    {
      severity: 'info', code: 'ASSET_INVENTORY',
      message: 'All 22 assets have been catalogued with vendor and model information.',
      location: 'global',
    },
  ],
  error_count: 2,
  warning_count: 4,
  info_count: 3,
};

// ── Policy Violations ──────────────────────────────────────────────

export const DEMO_POLICY_VIOLATIONS: PolicyViolation[] = [
  {
    rule_id: 'POL-001', rule_name: 'Minimum Security Level',
    severity: 'critical',
    message: 'Field Device Network has a 2-level gap between SL target (4) and capability (2).',
    affected_entities: ['zone-field'],
    remediation: 'Implement network segmentation, encrypted protocols, and device authentication to close the SL gap.',
  },
  {
    rule_id: 'POL-004', rule_name: 'Unencrypted Industrial Protocols',
    severity: 'high',
    message: 'Modbus/TCP (port 502) detected without TLS encapsulation.',
    affected_entities: ['conduit-ctrl-field'],
    remediation: 'Deploy Modbus/TCP Security extensions or use OPC-UA with mutual TLS.',
  },
  {
    rule_id: 'POL-007', rule_name: 'Remote Access Controls',
    severity: 'medium',
    message: 'RDP access to control network should require multi-factor authentication.',
    affected_entities: ['conduit-dmz-ctrl'],
    remediation: 'Enable MFA on the jump host and restrict RDP sessions to maximum 4 hours.',
  },
  {
    rule_id: 'POL-011', rule_name: 'Patch Currency',
    severity: 'medium',
    message: 'SCADA Server last patched 5+ months ago — exceeds 90-day patch policy.',
    affected_entities: ['asset-scada'],
    remediation: 'Schedule maintenance window to apply latest WinCC OA security patches.',
  },
  {
    rule_id: 'POL-015', rule_name: 'Network Monitoring Coverage',
    severity: 'low',
    message: 'Site Operations zone lacks dedicated network traffic monitoring.',
    affected_entities: ['zone-site'],
    remediation: 'Deploy a SPAN port or network TAP with OT-aware IDS (e.g., Claroty, Nozomi).',
  },
];

// ── Risk Assessment ────────────────────────────────────────────────

export const DEMO_RISK: RiskAssessment = {
  zone_risks: {
    'zone-enterprise': {
      score: 28, level: 'low',
      factors: { sl_base_risk: 8, asset_criticality_risk: 8, exposure_risk: 7, sl_gap_risk: 0, vulnerability_risk: 5 },
    },
    'zone-dmz': {
      score: 42, level: 'medium',
      factors: { sl_base_risk: 12, asset_criticality_risk: 10, exposure_risk: 12, sl_gap_risk: 0, vulnerability_risk: 8 },
    },
    'zone-site': {
      score: 55, level: 'medium',
      factors: { sl_base_risk: 12, asset_criticality_risk: 8, exposure_risk: 10, sl_gap_risk: 15, vulnerability_risk: 10 },
    },
    'zone-control': {
      score: 62, level: 'high',
      factors: { sl_base_risk: 15, asset_criticality_risk: 18, exposure_risk: 12, sl_gap_risk: 0, vulnerability_risk: 17 },
    },
    'zone-field': {
      score: 82, level: 'critical',
      factors: { sl_base_risk: 20, asset_criticality_risk: 20, exposure_risk: 12, sl_gap_risk: 25, vulnerability_risk: 5 },
    },
    'zone-safety': {
      score: 15, level: 'minimal',
      factors: { sl_base_risk: 5, asset_criticality_risk: 5, exposure_risk: 2, sl_gap_risk: 0, vulnerability_risk: 3 },
    },
  },
  overall_score: 58,
  overall_level: 'medium',
  recommendations: [
    'CRITICAL: Close the SL gap in the Field Device Network — current capability (SL 2) must reach target (SL 4). Deploy encrypted protocols and application whitelisting.',
    'HIGH: Patch the SCADA server (WinCC OA) — 5+ months since last security update. CVE-2024-30321 is actively exploited.',
    'HIGH: Migrate Modbus/TCP traffic to Modbus Security (TLS) or replace with OPC-UA on the Control ↔ Field conduit.',
    'MEDIUM: Close SL gap in Site Operations (SL 2 → SL 3) with RBAC and host-based firewalls.',
    'MEDIUM: Enforce MFA for all remote access sessions through the DMZ jump host.',
    'LOW: Add network monitoring (IDS) to Site Operations zone for full visibility.',
  ],
};

// ── Vulnerabilities ────────────────────────────────────────────────

export const DEMO_VULNERABILITIES: Vulnerability[] = [
  {
    id: 'vuln-001', asset_db_id: 'asset-scada', asset_name: 'SCADA Server', zone_name: 'Process Control Network',
    cve_id: 'CVE-2024-30321', title: 'Siemens WinCC OA Remote Code Execution',
    description: 'A vulnerability in the web server component of WinCC OA allows unauthenticated remote code execution via crafted HTTP requests.',
    severity: 'critical', cvss_score: 9.8, status: 'open',
    discovered_at: '2025-10-15T08:30:00Z', added_by: 'user-carol', reporter_username: 'carol.tanaka',
  },
  {
    id: 'vuln-002', asset_db_id: 'asset-plc1', asset_name: 'Intake PLC', zone_name: 'Field Device Network',
    cve_id: 'CVE-2023-46280', title: 'Siemens S7-1500 CPU Denial of Service',
    description: 'Specially crafted packets sent to port 102 can cause the CPU to enter STOP mode, requiring a manual restart.',
    severity: 'high', cvss_score: 7.5, status: 'mitigated',
    mitigation_notes: 'Industrial firewall rule added to block malformed S7comm packets. PLC firmware update scheduled for next maintenance window.',
    discovered_at: '2025-08-20T14:00:00Z', updated_at: '2025-09-05T10:00:00Z', added_by: 'user-bob', reporter_username: 'bob.mueller',
  },
  {
    id: 'vuln-003', asset_db_id: 'asset-plc3', asset_name: 'Chemical Dosing PLC', zone_name: 'Field Device Network',
    cve_id: 'CVE-2024-21914', title: 'Rockwell ControlLogix Authentication Bypass',
    description: 'The ControlLogix 5580 firmware allows unauthenticated changes to controller configuration through CIP messaging.',
    severity: 'critical', cvss_score: 9.1, status: 'open',
    discovered_at: '2025-11-01T09:00:00Z', added_by: 'user-alice', reporter_username: 'alice.chen',
  },
  {
    id: 'vuln-004', asset_db_id: 'asset-historian', asset_name: 'Plant Historian', zone_name: 'Enterprise Network',
    cve_id: 'CVE-2024-23468', title: 'AVEVA PI Server SQL Injection',
    description: 'PI Web API allows SQL injection through crafted query parameters, potentially exposing process data.',
    severity: 'high', cvss_score: 8.1, status: 'open',
    discovered_at: '2025-09-10T16:00:00Z', added_by: 'demo-user', reporter_username: 'demo',
  },
  {
    id: 'vuln-005', asset_db_id: 'asset-jump', asset_name: 'Remote Access Jump Host', zone_name: 'Industrial DMZ',
    cve_id: 'CVE-2024-12356', title: 'CyberArk PAM Privilege Escalation',
    description: 'A local privilege escalation vulnerability allows standard users to gain administrative access on the jump host.',
    severity: 'high', cvss_score: 7.8, status: 'mitigated',
    mitigation_notes: 'Patched to CyberArk PAM v13.2.1. SELinux enforcing mode enabled.',
    discovered_at: '2025-07-05T11:00:00Z', updated_at: '2025-07-20T09:00:00Z', added_by: 'user-bob', reporter_username: 'bob.mueller',
  },
  {
    id: 'vuln-006', asset_db_id: 'asset-hmi1', asset_name: 'Operator HMI #1', zone_name: 'Process Control Network',
    cve_id: 'CVE-2024-33698', title: 'Siemens SIMATIC HMI Comfort Panel XSS',
    description: 'Cross-site scripting vulnerability in the web-based management interface allows session hijacking.',
    severity: 'medium', cvss_score: 6.1, status: 'accepted',
    mitigation_notes: 'Web interface disabled — operators use local display only. Risk accepted per OT security board decision 2025-Q3.',
    discovered_at: '2025-08-01T13:00:00Z', updated_at: '2025-08-15T10:00:00Z', added_by: 'user-carol', reporter_username: 'carol.tanaka',
  },
  {
    id: 'vuln-007', asset_db_id: 'asset-rtu1', asset_name: 'Distribution RTU', zone_name: 'Field Device Network',
    cve_id: 'CVE-2023-29413', title: 'Schneider SCADAPack DNP3 Buffer Overflow',
    description: 'Malformed DNP3 packets can cause a buffer overflow leading to arbitrary code execution on the RTU.',
    severity: 'high', cvss_score: 8.6, status: 'open',
    discovered_at: '2025-10-20T07:30:00Z', added_by: 'user-alice', reporter_username: 'alice.chen',
  },
  {
    id: 'vuln-008', asset_db_id: 'asset-ad', asset_name: 'Domain Controller', zone_name: 'Enterprise Network',
    cve_id: 'CVE-2024-49113', title: 'Windows LDAP Remote Code Execution',
    description: 'A vulnerability in Windows LDAP service allows RCE via specially crafted LDAP requests.',
    severity: 'critical', cvss_score: 9.8, status: 'mitigated',
    mitigation_notes: 'KB5043076 applied during November 2025 patch cycle.',
    discovered_at: '2025-11-12T08:00:00Z', updated_at: '2025-11-16T14:00:00Z', added_by: 'demo-user', reporter_username: 'demo',
  },
  {
    id: 'vuln-009', asset_db_id: 'asset-switch1', asset_name: 'OT Network Switch', zone_name: 'Field Device Network',
    cve_id: 'CVE-2024-41798', title: 'Hirschmann RSP Firmware Command Injection',
    description: 'Authenticated command injection via the web-based management interface of Hirschmann RSP switches.',
    severity: 'medium', cvss_score: 6.8, status: 'open',
    discovered_at: '2025-12-01T10:00:00Z', added_by: 'user-bob', reporter_username: 'bob.mueller',
  },
  {
    id: 'vuln-010', asset_db_id: 'asset-eng', asset_name: 'Engineering Workstation', zone_name: 'Process Control Network',
    cve_id: 'CVE-2024-46886', title: 'Siemens TIA Portal Project File Manipulation',
    description: 'A crafted TIA Portal project file can execute arbitrary code when opened on the engineering workstation.',
    severity: 'medium', cvss_score: 6.5, status: 'open',
    mitigation_notes: undefined,
    discovered_at: '2025-12-10T15:00:00Z', added_by: 'user-carol', reporter_username: 'carol.tanaka',
  },
];

export const DEMO_VULN_SUMMARY: VulnerabilitySummary = {
  total: DEMO_VULNERABILITIES.length,
  by_severity: { critical: 3, high: 4, medium: 3, low: 0 },
  by_status: { open: 6, mitigated: 3, accepted: 1, false_positive: 0 },
  top_affected_assets: [
    { asset_id: 'asset-plc1', asset_name: 'Intake PLC', count: 1 },
    { asset_id: 'asset-plc3', asset_name: 'Chemical Dosing PLC', count: 1 },
    { asset_id: 'asset-scada', asset_name: 'SCADA Server', count: 1 },
    { asset_id: 'asset-rtu1', asset_name: 'Distribution RTU', count: 1 },
    { asset_id: 'asset-historian', asset_name: 'Plant Historian', count: 1 },
  ],
};

// ── Gap Analysis ───────────────────────────────────────────────────

function makeControls(zoneName: string, zoneType: string, slTarget: number) {
  const frs = [
    { fr_id: 'FR 1', fr_name: 'Identification and Authentication Control', srs: [
      { sr_id: 'SR 1.1', sr_name: 'Human user identification and authentication' },
      { sr_id: 'SR 1.2', sr_name: 'Software process and device identification and authentication' },
      { sr_id: 'SR 1.3', sr_name: 'Account management' },
      { sr_id: 'SR 1.4', sr_name: 'Identifier management' },
      { sr_id: 'SR 1.5', sr_name: 'Authenticator management' },
      { sr_id: 'SR 1.7', sr_name: 'Strength of password-based authentication' },
      { sr_id: 'SR 1.8', sr_name: 'Public key infrastructure certificates' },
      { sr_id: 'SR 1.9', sr_name: 'Strength of public key authentication' },
    ]},
    { fr_id: 'FR 2', fr_name: 'Use Control', srs: [
      { sr_id: 'SR 2.1', sr_name: 'Authorization enforcement' },
      { sr_id: 'SR 2.2', sr_name: 'Wireless use control' },
      { sr_id: 'SR 2.3', sr_name: 'Use control for portable and mobile devices' },
      { sr_id: 'SR 2.4', sr_name: 'Mobile code' },
      { sr_id: 'SR 2.5', sr_name: 'Session lock' },
      { sr_id: 'SR 2.6', sr_name: 'Remote session termination' },
    ]},
    { fr_id: 'FR 3', fr_name: 'System Integrity', srs: [
      { sr_id: 'SR 3.1', sr_name: 'Communication integrity' },
      { sr_id: 'SR 3.2', sr_name: 'Malicious code protection' },
      { sr_id: 'SR 3.3', sr_name: 'Security functionality verification' },
      { sr_id: 'SR 3.4', sr_name: 'Software and information integrity' },
      { sr_id: 'SR 3.5', sr_name: 'Input validation' },
    ]},
    { fr_id: 'FR 4', fr_name: 'Data Confidentiality', srs: [
      { sr_id: 'SR 4.1', sr_name: 'Information confidentiality' },
      { sr_id: 'SR 4.2', sr_name: 'Information persistence' },
      { sr_id: 'SR 4.3', sr_name: 'Use of cryptography' },
    ]},
    { fr_id: 'FR 5', fr_name: 'Restricted Data Flow', srs: [
      { sr_id: 'SR 5.1', sr_name: 'Network segmentation' },
      { sr_id: 'SR 5.2', sr_name: 'Zone boundary protection' },
      { sr_id: 'SR 5.3', sr_name: 'General purpose person-to-person communication restrictions' },
      { sr_id: 'SR 5.4', sr_name: 'Application partitioning' },
    ]},
    { fr_id: 'FR 6', fr_name: 'Timely Response to Events', srs: [
      { sr_id: 'SR 6.1', sr_name: 'Audit log accessibility' },
      { sr_id: 'SR 6.2', sr_name: 'Continuous monitoring' },
    ]},
    { fr_id: 'FR 7', fr_name: 'Resource Availability', srs: [
      { sr_id: 'SR 7.1', sr_name: 'Denial of service protection' },
      { sr_id: 'SR 7.2', sr_name: 'Resource management' },
      { sr_id: 'SR 7.3', sr_name: 'Control system backup' },
      { sr_id: 'SR 7.4', sr_name: 'Control system recovery and reconstitution' },
      { sr_id: 'SR 7.6', sr_name: 'Network and security configuration settings' },
    ]},
  ];

  const statuses: Array<'met' | 'partial' | 'unmet' | 'not_applicable'> = [];
  const seed = zoneName.length + slTarget;
  let i = 0;
  for (const fr of frs) {
    for (let _srIdx = 0; _srIdx < fr.srs.length; _srIdx++) {
      const v = (seed * 7 + i * 13) % 100;
      if (zoneType === 'safety') {
        statuses.push(v < 70 ? 'met' : v < 85 ? 'partial' : v < 90 ? 'unmet' : 'not_applicable');
      } else if (slTarget >= 4) {
        statuses.push(v < 30 ? 'met' : v < 55 ? 'partial' : v < 85 ? 'unmet' : 'not_applicable');
      } else {
        statuses.push(v < 50 ? 'met' : v < 75 ? 'partial' : v < 90 ? 'unmet' : 'not_applicable');
      }
      i++;
    }
  }

  const controls: Array<{
    sr_id: string; sr_name: string; fr_id: string; fr_name: string;
    status: 'met' | 'partial' | 'unmet' | 'not_applicable';
    details: string; remediation: string | null;
  }> = [];
  i = 0;
  for (const fr of frs) {
    for (const sr of fr.srs) {
      const status = statuses[i];
      controls.push({
        sr_id: sr.sr_id, sr_name: sr.sr_name,
        fr_id: fr.fr_id, fr_name: fr.fr_name,
        status,
        details: status === 'met' ? `${sr.sr_name} is fully implemented.`
          : status === 'partial' ? `${sr.sr_name} is partially implemented — additional controls needed for SL ${slTarget}.`
          : status === 'unmet' ? `${sr.sr_name} is not implemented in this zone.`
          : `${sr.sr_name} is not applicable to ${zoneType} zones.`,
        remediation: status === 'unmet' ? `Implement ${sr.sr_name.toLowerCase()} controls per IEC 62443-3-3 ${sr.sr_id}.`
          : status === 'partial' ? `Enhance existing ${sr.sr_name.toLowerCase()} to reach SL ${slTarget} requirements.`
          : null,
      });
      i++;
    }
  }

  const met = controls.filter(c => c.status === 'met').length;
  const partial = controls.filter(c => c.status === 'partial').length;
  const unmet = controls.filter(c => c.status === 'unmet').length;
  const na = controls.filter(c => c.status === 'not_applicable').length;
  const applicable = met + partial + unmet;

  return {
    controls, met, partial, unmet, not_applicable: na,
    total_controls: controls.length,
    compliance_percentage: applicable > 0 ? Math.round(((met + partial * 0.5) / applicable) * 100) : 100,
  };
}

function buildGapAnalysis() {
  const zoneAnalyses = zones.map(z => {
    const c = makeControls(z.name, z.type, z.security_level_target);
    return {
      zone_id: z.id, zone_name: z.name, zone_type: z.type,
      security_level_target: z.security_level_target,
      total_controls: c.total_controls,
      met_controls: c.met, partial_controls: c.partial, unmet_controls: c.unmet,
      compliance_percentage: c.compliance_percentage,
      controls: c.controls,
    };
  });

  const totals = zoneAnalyses.reduce((acc, z) => ({
    met: acc.met + z.met_controls,
    partial: acc.partial + z.partial_controls,
    unmet: acc.unmet + z.unmet_controls,
  }), { met: 0, partial: 0, unmet: 0 });

  const overallApplicable = totals.met + totals.partial + totals.unmet;
  return {
    project_name: 'Water Treatment Facility',
    analysis_date: '2026-02-17T10:30:00Z',
    overall_compliance: overallApplicable > 0 ? Math.round(((totals.met + totals.partial * 0.5) / overallApplicable) * 100) : 100,
    zones: zoneAnalyses,
    summary: { met: totals.met, partial: totals.partial, unmet: totals.unmet },
    priority_remediations: [
      'Implement device authentication (SR 1.2) across all field device zones to address SL 4 requirements.',
      'Deploy encrypted communication (SR 3.1) for Modbus/TCP and S7comm traffic on the Control ↔ Field conduit.',
      'Enable continuous monitoring (SR 6.2) with OT-aware IDS in Site Operations and Field Device zones.',
      'Establish formal backup and recovery procedures (SR 7.3/7.4) for all PLC and SCADA configurations.',
      'Implement mobile code protection (SR 2.4) on engineering workstations to prevent supply-chain attacks.',
    ],
  };
}

export const DEMO_GAP_ANALYSIS = buildGapAnalysis();

// ── Analytics (30-day time series) ─────────────────────────────────

function buildAnalytics() {
  const points = [];
  const now = new Date('2026-02-17T12:00:00Z');
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86400000);
    // Simulate gradual improvement with some noise
    const progress = (30 - i) / 30;
    const noise = Math.sin(i * 0.7) * 3;
    points.push({
      recorded_at: date.toISOString(),
      zone_count: i > 20 ? 4 : i > 10 ? 5 : 6,
      asset_count: i > 20 ? 14 : i > 10 ? 18 : 22,
      conduit_count: i > 20 ? 4 : i > 10 ? 6 : 7,
      compliance_score: Math.round(Math.min(100, 55 + progress * 20 + noise)),
      risk_score: Math.round(Math.max(0, 72 - progress * 14 + noise)),
      error_count: i > 15 ? 4 : i > 5 ? 3 : 2,
      warning_count: i > 15 ? 6 : i > 5 ? 5 : 4,
    });
  }
  return points;
}

export const DEMO_ANALYTICS = buildAnalytics();

export const DEMO_ANALYTICS_SUMMARY = {
  current: DEMO_ANALYTICS[DEMO_ANALYTICS.length - 1],
  compliance_trend: { value: 73, direction: 'up' as const, change: 18 },
  risk_trend: { value: 58, direction: 'down' as const, change: -14 },
  zone_count_trend: { value: 6, direction: 'up' as const, change: 2 },
  asset_count_trend: { value: 22, direction: 'up' as const, change: 8 },
  min_compliance: 53,
  max_compliance: 76,
  min_risk: 55,
  max_risk: 74,
  snapshot_count: 30,
};

// ── Version History ────────────────────────────────────────────────

export const DEMO_VERSIONS = [
  { id: 'ver-005', version_number: 5, created_by: 'demo-user', created_by_username: 'demo', created_at: '2026-02-15T14:30:00Z', description: 'Added safety instrumented systems zone and gas detection assets' },
  { id: 'ver-004', version_number: 4, created_by: 'user-alice', created_by_username: 'alice.chen', created_at: '2026-02-10T09:15:00Z', description: 'Added chemical dosing PLC and distribution RTU' },
  { id: 'ver-003', version_number: 3, created_by: 'user-bob', created_by_username: 'bob.mueller', created_at: '2026-01-28T16:45:00Z', description: 'Configured conduit flow rules and security level requirements' },
  { id: 'ver-002', version_number: 2, created_by: 'demo-user', created_by_username: 'demo', created_at: '2026-01-20T11:00:00Z', description: 'Added DMZ zone with jump host and data diode' },
  { id: 'ver-001', version_number: 1, created_by: 'demo-user', created_by_username: 'demo', created_at: '2026-01-15T10:00:00Z', description: 'Initial project setup with enterprise, control, and field zones' },
];

// ── Activity Feed ──────────────────────────────────────────────────

export const DEMO_ACTIVITY = [
  { id: 'act-010', user_id: 'demo-user', username: 'demo', action: 'update_project', entity_type: 'project', entity_id: DEMO_PROJECT_ID, entity_name: 'Water Treatment Facility', project_id: DEMO_PROJECT_ID, project_name: 'Water Treatment Facility', details: 'Updated project compliance standards', created_at: '2026-02-17T08:30:00Z' },
  { id: 'act-009', user_id: 'user-carol', username: 'carol.tanaka', action: 'add_vulnerability', entity_type: 'vulnerability', entity_id: 'vuln-010', entity_name: 'CVE-2024-46886', project_id: DEMO_PROJECT_ID, project_name: 'Water Treatment Facility', details: 'Added TIA Portal vulnerability to Engineering Workstation', created_at: '2026-02-16T15:00:00Z' },
  { id: 'act-008', user_id: 'user-bob', username: 'bob.mueller', action: 'add_vulnerability', entity_type: 'vulnerability', entity_id: 'vuln-009', entity_name: 'CVE-2024-41798', project_id: DEMO_PROJECT_ID, project_name: 'Water Treatment Facility', details: 'Added Hirschmann switch vulnerability', created_at: '2026-02-15T10:00:00Z' },
  { id: 'act-007', user_id: 'demo-user', username: 'demo', action: 'create_version', entity_type: 'version', entity_id: 'ver-005', entity_name: 'Version 5', project_id: DEMO_PROJECT_ID, project_name: 'Water Treatment Facility', details: 'Created snapshot: Added safety instrumented systems', created_at: '2026-02-15T14:30:00Z' },
  { id: 'act-006', user_id: 'demo-user', username: 'demo', action: 'add_zone', entity_type: 'zone', entity_id: 'zone-safety', entity_name: 'Safety Instrumented Systems', project_id: DEMO_PROJECT_ID, project_name: 'Water Treatment Facility', details: 'Added SIL-2 safety zone with HIMA controller', created_at: '2026-02-15T14:00:00Z' },
  { id: 'act-005', user_id: 'user-alice', username: 'alice.chen', action: 'add_asset', entity_type: 'asset', entity_id: 'asset-plc3', entity_name: 'Chemical Dosing PLC', project_id: DEMO_PROJECT_ID, project_name: 'Water Treatment Facility', details: 'Added Allen-Bradley ControlLogix 5580', created_at: '2026-02-10T09:00:00Z' },
  { id: 'act-004', user_id: 'user-bob', username: 'bob.mueller', action: 'update_conduit', entity_type: 'conduit', entity_id: 'conduit-ctrl-field', entity_name: 'Control ↔ Field', project_id: DEMO_PROJECT_ID, project_name: 'Water Treatment Facility', details: 'Added Profinet and EtherNet/IP flow rules', created_at: '2026-01-28T16:30:00Z' },
  { id: 'act-003', user_id: 'user-alice', username: 'alice.chen', action: 'create_project', entity_type: 'project', entity_id: PROJECT2_ID, entity_name: 'Power Substation 4B', project_id: PROJECT2_ID, project_name: 'Power Substation 4B', details: 'Created new NERC CIP project', created_at: '2026-01-25T09:00:00Z' },
  { id: 'act-002', user_id: 'demo-user', username: 'demo', action: 'add_zone', entity_type: 'zone', entity_id: 'zone-dmz', entity_name: 'Industrial DMZ', project_id: DEMO_PROJECT_ID, project_name: 'Water Treatment Facility', details: 'Added DMZ zone between IT and OT', created_at: '2026-01-20T10:30:00Z' },
  { id: 'act-001', user_id: 'demo-user', username: 'demo', action: 'create_project', entity_type: 'project', entity_id: DEMO_PROJECT_ID, entity_name: 'Water Treatment Facility', project_id: DEMO_PROJECT_ID, project_name: 'Water Treatment Facility', details: 'Initial project creation', created_at: '2026-01-15T10:00:00Z' },
];

// ── Notifications ──────────────────────────────────────────────────

export const DEMO_NOTIFICATIONS = [
  { id: 'notif-1', type: 'vulnerability', message: 'Critical vulnerability CVE-2024-30321 detected on SCADA Server', read: false, created_at: '2026-02-16T15:30:00Z', project_id: DEMO_PROJECT_ID },
  { id: 'notif-2', type: 'policy', message: 'Policy violation: Modbus/TCP without encryption on Control ↔ Field conduit', read: false, created_at: '2026-02-15T12:00:00Z', project_id: DEMO_PROJECT_ID },
  { id: 'notif-3', type: 'collaboration', message: 'Alice Chen added Chemical Dosing PLC to the Field Device Network', read: true, created_at: '2026-02-10T09:15:00Z', project_id: DEMO_PROJECT_ID },
  { id: 'notif-4', type: 'version', message: 'Bob Mueller created a new version snapshot for Water Treatment Facility', read: true, created_at: '2026-01-28T17:00:00Z', project_id: DEMO_PROJECT_ID },
];

// ── Project List Entries ───────────────────────────────────────────

function totalAssets(p: Project) { return p.zones.reduce((n, z) => n + z.assets.length, 0); }

export const DEMO_PROJECT_LIST = [
  {
    id: DEMO_PROJECT_ID,
    name: DEMO_PROJECT.project.name,
    description: DEMO_PROJECT.project.description,
    standard: 'IEC62443',
    owner_id: DEMO_USER.id,
    owner_username: DEMO_USER.username,
    permission: 'owner' as const,
    zone_count: DEMO_PROJECT.zones.length,
    conduit_count: DEMO_PROJECT.conduits.length,
    asset_count: totalAssets(DEMO_PROJECT),
    risk_score: DEMO_RISK.overall_score,
    risk_level: DEMO_RISK.overall_level,
    compliance_score: DEMO_GAP_ANALYSIS.overall_compliance,
    zone_types: { enterprise: 1, dmz: 1, site: 1, area: 1, cell: 1, safety: 1 },
    is_archived: false,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-02-17T08:30:00Z',
  },
  {
    id: PROJECT2_ID,
    name: DEMO_PROJECT_2.project.name,
    description: DEMO_PROJECT_2.project.description,
    standard: 'NERC_CIP',
    owner_id: 'user-alice',
    owner_username: 'alice.chen',
    permission: 'editor' as const,
    zone_count: DEMO_PROJECT_2.zones.length,
    conduit_count: DEMO_PROJECT_2.conduits.length,
    asset_count: totalAssets(DEMO_PROJECT_2),
    risk_score: 45,
    risk_level: 'medium' as const,
    compliance_score: 68,
    zone_types: { enterprise: 1, area: 1, cell: 1 },
    is_archived: false,
    created_at: '2026-01-25T09:00:00Z',
    updated_at: '2026-02-12T11:00:00Z',
  },
  {
    id: PROJECT3_ID,
    name: 'Gas Pipeline SCADA',
    description: 'Zone/conduit model for a natural gas pipeline SCADA system spanning 3 compressor stations.',
    standard: 'IEC62443',
    owner_id: 'user-bob',
    owner_username: 'bob.mueller',
    permission: 'viewer' as const,
    zone_count: 4,
    conduit_count: 5,
    asset_count: 12,
    risk_score: 38,
    risk_level: 'medium' as const,
    compliance_score: 81,
    zone_types: { enterprise: 1, dmz: 1, area: 1, cell: 1 },
    is_archived: false,
    created_at: '2025-11-10T08:00:00Z',
    updated_at: '2026-02-01T16:00:00Z',
  },
];

// ── Admin Data ─────────────────────────────────────────────────────

export const DEMO_ADMIN_STATS = {
  total_users: DEMO_USERS.length,
  total_projects: DEMO_PROJECT_LIST.length,
  active_sessions: 2,
  total_activity: DEMO_ACTIVITY.length,
};

export const DEMO_ADMIN_HEALTH = {
  db_status: 'healthy',
  uptime_seconds: 864000, // 10 days
  table_counts: { users: 4, projects: 3, zones: 12, conduits: 10, assets: 31, vulnerabilities: 10 },
};

export const DEMO_ADMIN_SESSIONS = [
  { user_id: 'demo-user', username: 'demo', display_name: 'Demo User', is_active: true, last_login_at: '2026-02-17T07:00:00Z' },
  { user_id: 'user-alice', username: 'alice.chen', display_name: 'Alice Chen', is_active: true, last_login_at: '2026-02-17T06:30:00Z' },
];

export const DEMO_LOGIN_HISTORY = [
  { id: 'login-1', user_id: 'demo-user', username_attempted: 'demo', ip_address: '192.168.1.100', success: true, failure_reason: null, created_at: '2026-02-17T07:00:00Z' },
  { id: 'login-2', user_id: 'user-alice', username_attempted: 'alice.chen', ip_address: '192.168.1.105', success: true, failure_reason: null, created_at: '2026-02-17T06:30:00Z' },
  { id: 'login-3', user_id: null, username_attempted: 'admin', ip_address: '10.200.50.3', success: false, failure_reason: 'Invalid credentials', created_at: '2026-02-16T23:15:00Z' },
  { id: 'login-4', user_id: null, username_attempted: 'admin', ip_address: '10.200.50.3', success: false, failure_reason: 'Invalid credentials', created_at: '2026-02-16T23:14:00Z' },
  { id: 'login-5', user_id: 'user-bob', username_attempted: 'bob.mueller', ip_address: '192.168.1.110', success: true, failure_reason: null, created_at: '2026-02-16T08:00:00Z' },
  { id: 'login-6', user_id: 'user-carol', username_attempted: 'carol.tanaka', ip_address: '192.168.1.115', success: true, failure_reason: null, created_at: '2026-02-15T14:00:00Z' },
];

export const DEMO_ADMIN_USERS = DEMO_USERS.map((u, i) => ({
  ...u,
  project_count: [3, 1, 1, 2][i] ?? 0,
}));
