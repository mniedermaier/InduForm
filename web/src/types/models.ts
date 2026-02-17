// TypeScript types matching the Python models

export type ZoneType = 'enterprise' | 'site' | 'area' | 'cell' | 'dmz' | 'safety';

export type AssetType =
  | 'plc'
  | 'hmi'
  | 'scada'
  | 'engineering_workstation'
  | 'historian'
  | 'jump_host'
  | 'firewall'
  | 'switch'
  | 'router'
  | 'server'
  | 'rtu'
  | 'ied'
  | 'dcs'
  | 'other';

export type ConduitDirection = 'inbound' | 'outbound' | 'bidirectional';

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  ip_address?: string;
  mac_address?: string;
  vendor?: string;
  model?: string;
  firmware_version?: string;
  description?: string;
  criticality?: number;
  // OS & Software
  os_name?: string;
  os_version?: string;
  software?: string;
  cpe?: string;
  // Network
  subnet?: string;
  gateway?: string;
  vlan?: number;
  dns?: string;
  open_ports?: string;
  protocols?: string;
  // Lifecycle
  purchase_date?: string;
  end_of_life?: string;
  warranty_expiry?: string;
  last_patched?: string;
  patch_level?: string;
  location?: string;
}

export interface Zone {
  id: string;
  name: string;
  type: ZoneType;
  security_level_target: number;
  security_level_capability?: number;
  description?: string;
  assets: Asset[];
  parent_zone?: string;
  network_segment?: string;
  x_position?: number;
  y_position?: number;
}

export interface ProtocolFlow {
  protocol: string;
  port?: number;
  direction: ConduitDirection;
  description?: string;
}

export interface Conduit {
  id: string;
  name?: string;
  from_zone: string;
  to_zone: string;
  flows: ProtocolFlow[];
  security_level_required?: number;
  requires_inspection: boolean;
  description?: string;
}

export type ComplianceStandard = 'IEC62443' | 'PURDUE' | 'NIST_CSF' | 'NERC_CIP';

export const COMPLIANCE_STANDARDS: {
  id: ComplianceStandard;
  name: string;
  description: string;
  color: string;
}[] = [
  {
    id: 'IEC62443',
    name: 'IEC 62443',
    description: 'Industrial automation and control systems security standard. Defines security levels, zones, and conduits.',
    color: '#3b82f6',
  },
  {
    id: 'PURDUE',
    name: 'Purdue Model',
    description: 'Reference architecture for industrial network segmentation with hierarchical levels from enterprise to safety.',
    color: '#8b5cf6',
  },
  {
    id: 'NIST_CSF',
    name: 'NIST CSF',
    description: 'NIST Cybersecurity Framework for identifying, protecting, detecting, responding, and recovering from cyber threats.',
    color: '#10b981',
  },
  {
    id: 'NERC_CIP',
    name: 'NERC CIP',
    description: 'Critical Infrastructure Protection standards for bulk electric system cybersecurity.',
    color: '#f59e0b',
  },
];

export interface ProjectMetadata {
  name: string;
  description?: string;
  compliance_standards: ComplianceStandard[];
  allowed_protocols?: string[];
  version?: string;
  author?: string;
}

export interface Project {
  version: string;
  project: ProjectMetadata;
  zones: Zone[];
  conduits: Conduit[];
}

export interface ValidationResult {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  location?: string;
  recommendation?: string;
}

export interface ValidationReport {
  valid: boolean;
  results: ValidationResult[];
  error_count: number;
  warning_count: number;
  info_count: number;
}

export interface PolicyViolation {
  rule_id: string;
  rule_name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  affected_entities: string[];
  remediation?: string;
}

export interface Vulnerability {
  id: string;
  asset_db_id: string;
  asset_name?: string;
  zone_name?: string;
  cve_id: string;
  title: string;
  description?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cvss_score?: number;
  status: 'open' | 'mitigated' | 'accepted' | 'false_positive';
  mitigation_notes?: string;
  discovered_at: string;
  updated_at?: string;
  added_by?: string;
  reporter_username?: string;
}

export interface VulnerabilitySummary {
  total: number;
  by_severity: Record<string, number>;
  by_status: Record<string, number>;
  top_affected_assets: Array<{ asset_id: string; asset_name: string; count: number }>;
}

export interface ProjectResponse {
  project: Project;
  validation: ValidationReport;
  policy_violations: PolicyViolation[];
  file_path?: string;
}

// Zone type display configuration
// Purdue model hierarchy: Enterprise (IT) -> DMZ -> Site -> Area -> Cell -> Safety (OT)
export const ZONE_TYPE_CONFIG: Record<ZoneType, {
  label: string;
  color: string;
  level: number;
  description: string;
}> = {
  enterprise: {
    label: 'Enterprise',
    color: '#6366f1',
    level: 6,
    description: 'Corporate IT network. Business systems, email, ERP, and internet connectivity.'
  },
  dmz: {
    label: 'DMZ',
    color: '#f59e0b',
    level: 5,
    description: 'Demilitarized zone between IT and OT. Hosts historians, jump servers, and data diodes.'
  },
  site: {
    label: 'Site',
    color: '#8b5cf6',
    level: 4,
    description: 'Site-level operations. Manufacturing execution systems (MES), site scheduling.'
  },
  area: {
    label: 'Area',
    color: '#10b981',
    level: 3,
    description: 'Production area supervision. HMIs, SCADA servers, area control systems.'
  },
  cell: {
    label: 'Cell',
    color: '#3b82f6',
    level: 2,
    description: 'Production cell/line. PLCs, RTUs, local HMIs, and direct process control.'
  },
  safety: {
    label: 'Safety',
    color: '#ef4444',
    level: 1,
    description: 'Safety instrumented systems (SIS). Emergency shutdown, fire & gas detection.'
  },
};

// Security Level configuration per IEC 62443
export const SECURITY_LEVEL_CONFIG: Record<number, {
  label: string;
  color: string;
  bgColor: string;
  name: string;
  description: string;
}> = {
  1: {
    label: 'SL 1',
    color: '#166534',
    bgColor: '#22c55e',
    name: 'Basic',
    description: 'Protection against casual or coincidental violation. Prevents unauthorized disclosure via eavesdropping.'
  },
  2: {
    label: 'SL 2',
    color: '#854d0e',
    bgColor: '#eab308',
    name: 'Moderate',
    description: 'Protection against intentional violation using simple means. Low resources, generic skills, low motivation.'
  },
  3: {
    label: 'SL 3',
    color: '#9a3412',
    bgColor: '#f97316',
    name: 'High',
    description: 'Protection against sophisticated attacks with moderate resources. IACS-specific skills, moderate motivation.'
  },
  4: {
    label: 'SL 4',
    color: '#991b1b',
    bgColor: '#ef4444',
    name: 'Critical',
    description: 'Protection against state-sponsored attacks. Extended resources, IACS-specific skills, high motivation.'
  },
};
