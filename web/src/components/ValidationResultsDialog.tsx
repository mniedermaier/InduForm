import { memo, useState } from 'react';
import type { ValidationResult, PolicyViolation, Project, ComplianceStandard } from '../types/models';
import { COMPLIANCE_STANDARDS } from '../types/models';
import DialogShell from './DialogShell';

// Maps validation check codes to their applicable standards
const CHECK_CODE_STANDARDS: Record<string, ComplianceStandard[]> = {
  ZONE_CIRCULAR_REF: ['IEC62443'],
  CONDUIT_SL_INSUFFICIENT: ['IEC62443'],
  CONDUIT_INSPECTION_RECOMMENDED: ['IEC62443'],
  DMZ_BYPASS: ['IEC62443', 'PURDUE'],
  DMZ_MISSING: ['IEC62443', 'PURDUE'],
  CELL_ISOLATION_VIOLATION: ['IEC62443', 'PURDUE'],
  PROTOCOL_NOT_IN_ALLOWLIST: ['IEC62443'],
  CRITICAL_ASSET_LOW_SL: ['IEC62443', 'NIST_CSF', 'NERC_CIP'],
  ZONE_NO_CONDUITS: ['IEC62443', 'PURDUE', 'NIST_CSF'],
  CONDUIT_NO_FLOWS: ['IEC62443'],
  SAFETY_ZONE_NON_SAFETY_ASSET: ['IEC62443'],
  PURDUE_NON_ADJACENT: ['PURDUE'],
  NIST_ASSET_INVENTORY_GAP: ['NIST_CSF'],
  CIP_ESP_MISSING: ['NERC_CIP'],
};

// Maps policy rule IDs to their applicable standards
const RULE_ID_STANDARDS: Record<string, ComplianceStandard[]> = {
  'POL-001': ['IEC62443'],
  'POL-002': ['IEC62443'],
  'POL-003': ['IEC62443'],
  'POL-004': ['IEC62443', 'PURDUE'],
  'POL-005': ['IEC62443', 'PURDUE'],
  'POL-006': ['IEC62443'],
  'POL-007': ['PURDUE'],
  'NIST-001': ['NIST_CSF'],
  'CIP-001': ['NERC_CIP'],
  'CIP-002': ['NERC_CIP'],
};

function StandardBadges({ standards }: { standards: ComplianceStandard[] }) {
  return (
    <span className="inline-flex gap-1 ml-1">
      {standards.map(stdId => {
        const std = COMPLIANCE_STANDARDS.find(s => s.id === stdId);
        if (!std) return null;
        return (
          <span
            key={stdId}
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: std.color }}
            title={std.name}
          />
        );
      })}
    </span>
  );
}

interface ValidationResultsDialogProps {
  validationResults: ValidationResult[];
  policyViolations: PolicyViolation[];
  project: Project;
  onClose: () => void;
}

// Define all validation checks that are performed
const VALIDATION_CHECKS = [
  {
    id: 'zone_hierarchy',
    name: 'Zone Hierarchy',
    description: 'Validates that zone parent relationships form a valid hierarchy without circular references.',
    codes: ['ZONE_CIRCULAR_REF'],
  },
  {
    id: 'conduit_security_levels',
    name: 'Conduit Security Levels',
    description: 'Ensures conduits have sufficient security levels for the zones they connect.',
    codes: ['CONDUIT_SL_INSUFFICIENT', 'CONDUIT_INSPECTION_RECOMMENDED'],
  },
  {
    id: 'dmz_requirement',
    name: 'DMZ Requirement',
    description: 'Validates that enterprise-to-cell traffic traverses a DMZ zone.',
    codes: ['DMZ_BYPASS', 'DMZ_MISSING'],
  },
  {
    id: 'zone_isolation',
    name: 'Cell Zone Isolation',
    description: 'Checks that cell zones are properly isolated from each other.',
    codes: ['CELL_ISOLATION_VIOLATION'],
  },
  {
    id: 'protocol_allowlist',
    name: 'Protocol Allowlist',
    description: 'Validates that only approved industrial protocols are used in conduits.',
    codes: ['PROTOCOL_NOT_IN_ALLOWLIST'],
  },
  {
    id: 'asset_placement',
    name: 'Asset Placement',
    description: 'Ensures critical assets (PLCs, SCADA, DCS) are in appropriately secured zones.',
    codes: ['CRITICAL_ASSET_LOW_SL'],
  },
  {
    id: 'zone_connectivity',
    name: 'Zone Connectivity',
    description: 'Warns if a zone has no conduits and may be isolated unintentionally.',
    codes: ['ZONE_NO_CONDUITS'],
  },
  {
    id: 'conduit_flows',
    name: 'Conduit Flows',
    description: 'Warns if a conduit has no protocol flows defined.',
    codes: ['CONDUIT_NO_FLOWS'],
  },
  {
    id: 'safety_zone_assets',
    name: 'Safety Zone Assets',
    description: 'Checks that safety zones primarily contain safety-related asset types.',
    codes: ['SAFETY_ZONE_NON_SAFETY_ASSET'],
  },
  {
    id: 'purdue_model',
    name: 'Purdue Model Adjacency',
    description: 'Validates that conduits connect adjacent Purdue model levels.',
    codes: ['PURDUE_NON_ADJACENT'],
  },
  {
    id: 'nist_asset_inventory',
    name: 'NIST Asset Inventory',
    description: 'Checks that zones have assets registered for complete inventory (NIST CSF).',
    codes: ['NIST_ASSET_INVENTORY_GAP'],
  },
  {
    id: 'cip_esp',
    name: 'CIP Electronic Security Perimeter',
    description: 'Checks that critical zones have a DMZ as ESP boundary (NERC CIP).',
    codes: ['CIP_ESP_MISSING'],
  },
];

// Define all policy rules that are checked
const POLICY_RULES = [
  {
    id: 'POL-001',
    name: 'Default Deny',
    description: 'All traffic must be explicitly allowed via conduits. Implicit deny for undefined flows.',
    severity: 'high',
  },
  {
    id: 'POL-002',
    name: 'SL Boundary Protection',
    description: 'Conduits spanning security level difference >= 2 require deep packet inspection.',
    severity: 'high',
  },
  {
    id: 'POL-003',
    name: 'Protocol Allowlist',
    description: 'Only approved industrial protocols (Modbus, OPC UA, DNP3, etc.) are permitted.',
    severity: 'medium',
  },
  {
    id: 'POL-004',
    name: 'Cell Zone Isolation',
    description: 'Cell zones must not have direct connectivity to each other without traversing supervisory zones.',
    severity: 'medium',
  },
  {
    id: 'POL-005',
    name: 'DMZ Requirement',
    description: 'Enterprise to cell/safety communication must traverse a DMZ zone.',
    severity: 'critical',
  },
  {
    id: 'POL-006',
    name: 'Safety Zone Protection',
    description: 'Safety zones require SL-T >= 3 and limited connectivity (max 2 conduits).',
    severity: 'critical',
  },
  {
    id: 'POL-007',
    name: 'Purdue Model Hierarchy',
    description: 'Conduits should connect adjacent Purdue model levels. Skipping levels violates defense-in-depth.',
    severity: 'low',
  },
  {
    id: 'NIST-001',
    name: 'Asset Identification',
    description: 'All zones should have assets registered for complete inventory (NIST CSF).',
    severity: 'medium',
  },
  {
    id: 'CIP-001',
    name: 'ESP Boundary',
    description: 'Critical zones need a DMZ as Electronic Security Perimeter (NERC CIP-005).',
    severity: 'high',
  },
  {
    id: 'CIP-002',
    name: 'BES Asset Classification',
    description: 'Assets in critical zones must have explicit criticality classification (NERC CIP-002).',
    severity: 'medium',
  },
];

const ValidationResultsDialog = memo(({
  validationResults,
  policyViolations,
  project,
  onClose,
}: ValidationResultsDialogProps) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'checks' | 'policies' | 'issues'>('summary');

  const errors = validationResults.filter(r => r.severity === 'error');
  const warnings = validationResults.filter(r => r.severity === 'warning');
  const infos = validationResults.filter(r => r.severity === 'info');

  const criticalViolations = policyViolations.filter(v => v.severity === 'critical');

  const totalIssues = validationResults.length + policyViolations.length;
  const isValid = errors.length === 0 && criticalViolations.length === 0;

  // Check which validation checks have issues
  const getCheckStatus = (check: typeof VALIDATION_CHECKS[0]) => {
    const issues = validationResults.filter(r => check.codes.includes(r.code));
    if (issues.some(i => i.severity === 'error')) return 'error';
    if (issues.some(i => i.severity === 'warning')) return 'warning';
    if (issues.length > 0) return 'info';
    return 'passed';
  };

  // Check which policy rules have violations
  const getPolicyStatus = (rule: typeof POLICY_RULES[0]) => {
    const violations = policyViolations.filter(v => v.rule_id === rule.id);
    if (violations.length > 0) return violations[0].severity;
    return 'passed';
  };

  return (
    <DialogShell title="Validation Report" onClose={onClose} maxWidth="max-w-3xl">
        <div className="max-h-[calc(85vh-4rem)] flex flex-col">
        {/* Status badge */}
        <div className="px-6 pb-2 -mt-2">
          {isValid ? (
            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs font-medium rounded">
              PASSED
            </span>
          ) : (
            <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-xs font-medium rounded">
              FAILED
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'summary', label: 'Summary' },
            { id: 'checks', label: 'Validation Checks' },
            { id: 'policies', label: 'Policy Rules' },
            { id: 'issues', label: `Issues (${totalIssues})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'summary' && (
            <SummaryTab
              project={project}
              policyViolations={policyViolations}
              errors={errors}
              warnings={warnings}
              infos={infos}
              isValid={isValid}
            />
          )}

          {activeTab === 'checks' && (
            <ChecksTab
              checks={VALIDATION_CHECKS}
              getCheckStatus={getCheckStatus}
              getCheckIssues={(check) => validationResults.filter(r => check.codes.includes(r.code))}
            />
          )}

          {activeTab === 'policies' && (
            <PoliciesTab
              policies={POLICY_RULES}
              getPolicyStatus={getPolicyStatus}
              policyViolations={policyViolations}
            />
          )}

          {activeTab === 'issues' && (
            <IssuesTab
              validationResults={validationResults}
              policyViolations={policyViolations}
            />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
            Validated against:
            {(project.project.compliance_standards || ['IEC62443']).map(stdId => {
              const std = COMPLIANCE_STANDARDS.find(s => s.id === stdId);
              return std ? (
                <span key={stdId} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: std.color + '20', color: std.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: std.color }} />
                  {std.name}
                </span>
              ) : null;
            })}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
        </div>
    </DialogShell>
  );
});

ValidationResultsDialog.displayName = 'ValidationResultsDialog';

// Summary Tab
const SummaryTab = memo(({
  project,
  policyViolations,
  errors,
  warnings,
  infos,
  isValid,
}: {
  project: Project;
  policyViolations: PolicyViolation[];
  errors: ValidationResult[];
  warnings: ValidationResult[];
  infos: ValidationResult[];
  isValid: boolean;
}) => (
  <div className="space-y-6">
    {/* Overall Status */}
    <div className={`p-4 rounded-lg ${isValid ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{isValid ? '✓' : '✗'}</span>
        <div>
          <div className={`font-semibold ${isValid ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
            {isValid ? 'Project passes validation' : 'Project has validation issues'}
          </div>
          <div className={`text-sm ${isValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {isValid
              ? 'Your IEC 62443 zone and conduit configuration meets all requirements.'
              : 'Please review the issues below and make corrections.'}
          </div>
        </div>
      </div>
    </div>

    {/* Project Overview */}
    <div>
      <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Project Overview</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 dark:bg-gray-700 rounded p-3">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{project.zones.length}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Zones defined</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded p-3">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{project.conduits.length}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Conduits defined</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded p-3">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            {project.zones.reduce((sum, z) => sum + z.assets.length, 0)}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Assets registered</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded p-3">
          <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            {project.conduits.reduce((sum, c) => sum + c.flows.length, 0)}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Protocol flows</div>
        </div>
      </div>
    </div>

    {/* Issue Summary */}
    <div>
      <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Issue Summary</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
          <span className="text-sm text-gray-700 dark:text-gray-300">Validation Errors</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${errors.length > 0 ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'}`}>
            {errors.length}
          </span>
        </div>
        <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
          <span className="text-sm text-gray-700 dark:text-gray-300">Validation Warnings</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${warnings.length > 0 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'}`}>
            {warnings.length}
          </span>
        </div>
        <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
          <span className="text-sm text-gray-700 dark:text-gray-300">Info Messages</span>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
            {infos.length}
          </span>
        </div>
        <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
          <span className="text-sm text-gray-700 dark:text-gray-300">Policy Violations</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${policyViolations.length > 0 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300' : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'}`}>
            {policyViolations.length}
          </span>
        </div>
      </div>
    </div>

    {/* Checks Performed */}
    <div>
      <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">Checks Performed</h3>
      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
        <div>• Zone hierarchy validation (circular references)</div>
        <div>• Conduit security level requirements</div>
        <div>• DMZ traversal requirements</div>
        <div>• Cell zone isolation</div>
        <div>• Protocol allowlist verification</div>
        <div>• Critical asset placement</div>
        <div>• Zone connectivity</div>
        <div>• Conduit flow completeness</div>
        <div>• Safety zone asset validation</div>
        <div>• Purdue model adjacency</div>
        <div>• IEC 62443 policy compliance (7 rules)</div>
      </div>
    </div>
  </div>
));

SummaryTab.displayName = 'SummaryTab';

// Checks Tab
const ChecksTab = memo(({
  checks,
  getCheckStatus,
  getCheckIssues,
}: {
  checks: typeof VALIDATION_CHECKS;
  getCheckStatus: (check: typeof VALIDATION_CHECKS[0]) => string;
  getCheckIssues: (check: typeof VALIDATION_CHECKS[0]) => ValidationResult[];
}) => (
  <div className="space-y-4">
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
      The following validation checks are performed on your project configuration:
    </p>
    {checks.map(check => {
      const status = getCheckStatus(check);
      const issues = getCheckIssues(check);
      return (
        <div key={check.id} className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className={`p-3 flex items-start gap-3 ${
            status === 'passed' ? 'bg-green-50 dark:bg-green-900/20' :
            status === 'error' ? 'bg-red-50 dark:bg-red-900/20' :
            status === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-blue-50 dark:bg-blue-900/20'
          }`}>
            <span className="text-lg">
              {status === 'passed' ? '✓' : status === 'error' ? '✗' : '⚠'}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800 dark:text-gray-100">{check.name}</span>
                <span className={`px-2 py-0.5 text-xs rounded ${
                  status === 'passed' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                  status === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                  status === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
                }`}>
                  {status === 'passed' ? 'PASSED' : `${issues.length} ISSUE${issues.length !== 1 ? 'S' : ''}`}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{check.description}</p>
            </div>
          </div>
          {issues.length > 0 && (
            <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-2">
              {issues.map((issue, idx) => (
                <div key={idx} className="text-sm">
                  <span className={`font-mono text-xs px-1 rounded ${
                    issue.severity === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                    issue.severity === 'warning' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  }`}>
                    {issue.code}
                  </span>
                  <span className="ml-2 text-gray-700 dark:text-gray-300">{issue.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    })}
  </div>
));

ChecksTab.displayName = 'ChecksTab';

// Policies Tab
const PoliciesTab = memo(({
  policies,
  getPolicyStatus,
  policyViolations,
}: {
  policies: typeof POLICY_RULES;
  getPolicyStatus: (rule: typeof POLICY_RULES[0]) => string;
  policyViolations: PolicyViolation[];
}) => (
  <div className="space-y-4">
    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
      The following IEC 62443 policy rules are enforced:
    </p>
    {policies.map(rule => {
      const status = getPolicyStatus(rule);
      const violations = policyViolations.filter(v => v.rule_id === rule.id);

      return (
        <div key={rule.id} className="border dark:border-gray-700 rounded-lg overflow-hidden">
          <div className={`p-3 flex items-start gap-3 ${
            status === 'passed' ? 'bg-green-50 dark:bg-green-900/20' :
            status === 'critical' ? 'bg-red-50 dark:bg-red-900/20' :
            status === 'high' ? 'bg-orange-50 dark:bg-orange-900/20' : 'bg-yellow-50 dark:bg-yellow-900/20'
          }`}>
            <span className="text-lg">
              {status === 'passed' ? '✓' : '✗'}
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{rule.id}</span>
                <span className="font-medium text-gray-800 dark:text-gray-100">{rule.name}</span>
                <span className={`px-2 py-0.5 text-xs rounded ${
                  status === 'passed' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' :
                  status === 'critical' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300' :
                  status === 'high' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                }`}>
                  {status === 'passed' ? 'COMPLIANT' : status.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{rule.description}</p>
            </div>
          </div>
          {violations.length > 0 && (
            <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-2">
              {violations.map((violation, idx) => (
                <div key={idx} className="text-sm">
                  <div className="text-gray-700 dark:text-gray-300">{violation.message}</div>
                  {violation.remediation && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span className="font-medium">Fix:</span> {violation.remediation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    })}
  </div>
));

PoliciesTab.displayName = 'PoliciesTab';

// Issues Tab
const IssuesTab = memo(({
  validationResults,
  policyViolations,
}: {
  validationResults: ValidationResult[];
  policyViolations: PolicyViolation[];
}) => {
  const totalIssues = validationResults.length + policyViolations.length;

  if (totalIssues === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">✓</div>
        <div className="text-lg font-medium text-green-800 dark:text-green-300">No Issues Found</div>
        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Your project configuration passes all validation checks.
        </div>
      </div>
    );
  }

  // Sort by severity
  const sortedResults = [...validationResults].sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });

  const sortedViolations = [...policyViolations].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <div className="space-y-3">
      {sortedResults.map((result, index) => (
        <ResultCard key={`v-${index}`} result={result} />
      ))}
      {sortedViolations.map((violation, index) => (
        <ViolationCard key={`p-${index}`} violation={violation} />
      ))}
    </div>
  );
});

IssuesTab.displayName = 'IssuesTab';

const ResultCard = memo(({ result }: { result: ValidationResult }) => {
  const severityStyles = {
    error: 'border-l-red-500 bg-red-50 dark:bg-red-900/20',
    warning: 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
    info: 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/20',
  };

  const severityBadge = {
    error: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
    warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
    info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  };

  return (
    <div className={`border dark:border-gray-700 border-l-4 rounded p-3 ${severityStyles[result.severity]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${severityBadge[result.severity]}`}>
          {result.severity.toUpperCase()}
        </span>
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{result.code}</span>
        <StandardBadges standards={CHECK_CODE_STANDARDS[result.code] || []} />
      </div>
      <div className="text-sm text-gray-800 dark:text-gray-200">{result.message}</div>
      {result.location && (
        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">{result.location}</div>
      )}
      {result.recommendation && (
        <div className="text-xs text-gray-600 dark:text-gray-400 mt-2 p-2 bg-white dark:bg-gray-700 rounded">
          <span className="font-medium">Recommendation:</span> {result.recommendation}
        </div>
      )}
    </div>
  );
});

ResultCard.displayName = 'ResultCard';

const ViolationCard = memo(({ violation }: { violation: PolicyViolation }) => {
  const severityStyles = {
    critical: 'border-l-red-500 bg-red-50 dark:bg-red-900/20',
    high: 'border-l-orange-500 bg-orange-50 dark:bg-orange-900/20',
    medium: 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
    low: 'border-l-gray-400 bg-gray-50 dark:bg-gray-700',
  };

  const severityBadge = {
    critical: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
    high: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
    medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
    low: 'bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200',
  };

  return (
    <div className={`border dark:border-gray-700 border-l-4 rounded p-3 ${severityStyles[violation.severity]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${severityBadge[violation.severity]}`}>
          {violation.severity.toUpperCase()}
        </span>
        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{violation.rule_id}</span>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{violation.rule_name}</span>
        <StandardBadges standards={RULE_ID_STANDARDS[violation.rule_id] || []} />
      </div>
      <div className="text-sm text-gray-800 dark:text-gray-200">{violation.message}</div>
      {violation.affected_entities.length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Affects: <span className="font-mono">{violation.affected_entities.join(', ')}</span>
        </div>
      )}
      {violation.remediation && (
        <div className="text-xs text-gray-600 dark:text-gray-400 mt-2 p-2 bg-white dark:bg-gray-700 rounded">
          <span className="font-medium">Remediation:</span> {violation.remediation}
        </div>
      )}
    </div>
  );
});

ViolationCard.displayName = 'ViolationCard';

export default ValidationResultsDialog;
