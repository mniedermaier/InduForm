// Demo mode mock data — hardcoded project, zones, conduits, assets

import type { Project, Zone, Conduit, ValidationReport, VulnerabilitySummary } from '../types/models';
import type { RiskAssessment } from '../api/client';

export const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@induform.example',
  username: 'demo',
  display_name: 'Demo User',
  created_at: '2025-01-15T10:00:00Z',
  is_active: true,
  is_admin: true,
};

export const DEMO_PROJECT_ID = 'demo-project-001';

const zones: Zone[] = [
  {
    id: 'zone-enterprise',
    name: 'Enterprise Network',
    type: 'enterprise',
    security_level_target: 2,
    security_level_capability: 3,
    description: 'Corporate IT network with ERP, email, and business applications.',
    assets: [
      {
        id: 'asset-historian',
        name: 'Plant Historian',
        type: 'historian',
        ip_address: '10.0.1.10',
        vendor: 'OSIsoft',
        model: 'PI Server',
        description: 'Enterprise data historian aggregating plant data.',
        criticality: 3,
        os_name: 'Windows Server',
        os_version: '2022',
      },
      {
        id: 'asset-jump-host',
        name: 'Remote Access Jump Host',
        type: 'jump_host',
        ip_address: '10.0.1.20',
        vendor: 'CyberArk',
        description: 'Privileged access gateway for remote maintenance.',
        criticality: 4,
        os_name: 'Linux',
        os_version: 'RHEL 9',
      },
    ],
    x_position: 400,
    y_position: 50,
  },
  {
    id: 'zone-control',
    name: 'Control System Network',
    type: 'area',
    security_level_target: 3,
    security_level_capability: 3,
    description: 'SCADA and HMI systems for process monitoring and supervisory control.',
    assets: [
      {
        id: 'asset-scada',
        name: 'SCADA Server',
        type: 'scada',
        ip_address: '10.10.1.10',
        vendor: 'Siemens',
        model: 'WinCC OA',
        description: 'Supervisory control and data acquisition server.',
        criticality: 4,
        os_name: 'Windows Server',
        os_version: '2019',
      },
    ],
    x_position: 200,
    y_position: 300,
  },
  {
    id: 'zone-field',
    name: 'Field Devices',
    type: 'cell',
    security_level_target: 4,
    security_level_capability: 2,
    description: 'PLCs and RTUs directly controlling physical processes.',
    assets: [
      {
        id: 'asset-plc',
        name: 'Main Process PLC',
        type: 'plc',
        ip_address: '10.20.1.10',
        vendor: 'Siemens',
        model: 'S7-1500',
        firmware_version: 'V2.9',
        description: 'Primary programmable logic controller for process automation.',
        criticality: 5,
      },
    ],
    x_position: 600,
    y_position: 300,
  },
];

const conduits: Conduit[] = [
  {
    id: 'conduit-ent-ctrl',
    name: 'Enterprise ↔ Control',
    from_zone: 'zone-enterprise',
    to_zone: 'zone-control',
    flows: [
      { protocol: 'OPC-UA', port: 4840, direction: 'bidirectional', description: 'Process data exchange' },
      { protocol: 'HTTPS', port: 443, direction: 'inbound', description: 'Remote monitoring dashboard' },
    ],
    security_level_required: 3,
    requires_inspection: true,
    description: 'Firewall-mediated link between enterprise and control networks.',
  },
  {
    id: 'conduit-ctrl-field',
    name: 'Control ↔ Field',
    from_zone: 'zone-control',
    to_zone: 'zone-field',
    flows: [
      { protocol: 'Profinet', port: 34964, direction: 'bidirectional', description: 'PLC communication' },
      { protocol: 'Modbus/TCP', port: 502, direction: 'outbound', description: 'Legacy device polling' },
    ],
    security_level_required: 4,
    requires_inspection: true,
    description: 'Direct link between SCADA and field-level controllers.',
  },
];

export const DEMO_PROJECT: Project = {
  version: '1.0',
  project: {
    name: 'Water Treatment Facility',
    description: 'IEC 62443 zone/conduit model for a municipal water treatment plant.',
    compliance_standards: ['IEC62443', 'NIST_CSF'],
    version: '1.0.0',
    author: 'Demo User',
  },
  zones,
  conduits,
};

export const DEMO_VALIDATION: ValidationReport = {
  valid: false,
  results: [
    {
      severity: 'warning',
      code: 'SL_GAP',
      message: 'Field Devices zone: security capability (SL 2) is below target (SL 4).',
      location: 'zone-field',
      recommendation: 'Implement additional security controls to reach target SL 4.',
    },
    {
      severity: 'info',
      code: 'CONDUIT_INSPECTION',
      message: 'All conduits requiring inspection have been flagged.',
      location: 'global',
    },
  ],
  error_count: 0,
  warning_count: 1,
  info_count: 1,
};

export const DEMO_RISK: RiskAssessment = {
  zone_risks: {
    'zone-enterprise': {
      score: 35,
      level: 'medium',
      factors: { sl_base_risk: 10, asset_criticality_risk: 10, exposure_risk: 5, sl_gap_risk: 0, vulnerability_risk: 10 },
    },
    'zone-control': {
      score: 50,
      level: 'medium',
      factors: { sl_base_risk: 15, asset_criticality_risk: 15, exposure_risk: 10, sl_gap_risk: 0, vulnerability_risk: 10 },
    },
    'zone-field': {
      score: 75,
      level: 'high',
      factors: { sl_base_risk: 20, asset_criticality_risk: 20, exposure_risk: 10, sl_gap_risk: 20, vulnerability_risk: 5 },
    },
  },
  overall_score: 55,
  overall_level: 'medium',
  recommendations: [
    'Address SL gap in Field Devices zone — capability (SL 2) vs target (SL 4).',
    'Review conduit inspection requirements between Control and Field zones.',
    'Consider network segmentation enhancements for enterprise historian access.',
  ],
};

export const DEMO_VULN_SUMMARY: VulnerabilitySummary = {
  total: 3,
  by_severity: { critical: 0, high: 1, medium: 1, low: 1 },
  by_status: { open: 2, mitigated: 1, accepted: 0, false_positive: 0 },
  top_affected_assets: [
    { asset_id: 'asset-plc', asset_name: 'Main Process PLC', count: 2 },
    { asset_id: 'asset-scada', asset_name: 'SCADA Server', count: 1 },
  ],
};
