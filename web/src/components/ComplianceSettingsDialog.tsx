import { memo } from 'react';
import type { ComplianceStandard } from '../types/models';
import { COMPLIANCE_STANDARDS } from '../types/models';
import DialogShell from './DialogShell';

// Validation checks with their applicable standards
const VALIDATION_CHECKS: {
  code: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  standards: ComplianceStandard[];
}[] = [
  { code: 'ZONE_CIRCULAR_REF', name: 'Zone Hierarchy', description: 'Circular parent reference detection', severity: 'error', standards: ['IEC62443'] },
  { code: 'CONDUIT_SL_INSUFFICIENT', name: 'Conduit SL Check', description: 'Conduit security level must match zone requirements', severity: 'error', standards: ['IEC62443'] },
  { code: 'CONDUIT_INSPECTION_RECOMMENDED', name: 'Inspection Recommended', description: 'Deep packet inspection for large SL gaps', severity: 'warning', standards: ['IEC62443'] },
  { code: 'DMZ_BYPASS', name: 'DMZ Bypass', description: 'Enterprise-to-cell traffic must traverse DMZ', severity: 'error', standards: ['IEC62443', 'PURDUE'] },
  { code: 'DMZ_MISSING', name: 'DMZ Missing', description: 'No DMZ zone exists between enterprise and cell', severity: 'warning', standards: ['IEC62443', 'PURDUE'] },
  { code: 'CELL_ISOLATION_VIOLATION', name: 'Cell Isolation', description: 'Cell zones should be isolated from each other', severity: 'warning', standards: ['IEC62443', 'PURDUE'] },
  { code: 'PROTOCOL_NOT_IN_ALLOWLIST', name: 'Protocol Allowlist', description: 'Only approved industrial protocols permitted', severity: 'info', standards: ['IEC62443'] },
  { code: 'CRITICAL_ASSET_LOW_SL', name: 'Critical Asset Placement', description: 'Critical assets require higher security levels', severity: 'warning', standards: ['IEC62443', 'NIST_CSF', 'NERC_CIP'] },
  { code: 'ZONE_NO_CONDUITS', name: 'Zone Connectivity', description: 'Zones should have at least one conduit', severity: 'warning', standards: ['IEC62443', 'PURDUE', 'NIST_CSF'] },
  { code: 'CONDUIT_NO_FLOWS', name: 'Conduit Flows', description: 'Conduits should have defined protocol flows', severity: 'warning', standards: ['IEC62443'] },
  { code: 'SAFETY_ZONE_NON_SAFETY_ASSET', name: 'Safety Zone Assets', description: 'Safety zones should contain safety-related assets', severity: 'info', standards: ['IEC62443'] },
  { code: 'PURDUE_NON_ADJACENT', name: 'Purdue Adjacency', description: 'Conduits should connect adjacent Purdue levels', severity: 'info', standards: ['PURDUE'] },
  { code: 'NIST_ASSET_INVENTORY_GAP', name: 'Asset Inventory Gap', description: 'Zones should have assets for complete inventory', severity: 'warning', standards: ['NIST_CSF'] },
  { code: 'CIP_ESP_MISSING', name: 'ESP Missing', description: 'Critical zones need DMZ as Electronic Security Perimeter', severity: 'warning', standards: ['NERC_CIP'] },
];

// Policy rules with their applicable standards
const POLICY_RULES: {
  id: string;
  name: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  standards: ComplianceStandard[];
}[] = [
  { id: 'POL-001', name: 'Default Deny', description: 'All traffic must be explicitly allowed via conduits', severity: 'high', standards: ['IEC62443'] },
  { id: 'POL-002', name: 'SL Boundary Protection', description: 'Conduits spanning SL difference >= 2 require inspection', severity: 'high', standards: ['IEC62443'] },
  { id: 'POL-003', name: 'Protocol Allowlist', description: 'Only approved industrial protocols permitted', severity: 'medium', standards: ['IEC62443'] },
  { id: 'POL-004', name: 'Cell Zone Isolation', description: 'Cell zones must not connect directly', severity: 'medium', standards: ['IEC62443', 'PURDUE'] },
  { id: 'POL-005', name: 'DMZ Requirement', description: 'Enterprise-cell traffic must traverse DMZ', severity: 'critical', standards: ['IEC62443', 'PURDUE'] },
  { id: 'POL-006', name: 'Safety Zone Protection', description: 'Safety zones require SL-T >= 3 and limited connectivity', severity: 'critical', standards: ['IEC62443'] },
  { id: 'POL-007', name: 'Purdue Model Hierarchy', description: 'Conduits should connect adjacent Purdue levels', severity: 'low', standards: ['PURDUE'] },
  { id: 'NIST-001', name: 'Asset Identification', description: 'All zones should have assets for complete inventory', severity: 'medium', standards: ['NIST_CSF'] },
  { id: 'CIP-001', name: 'ESP Boundary', description: 'Critical zones need DMZ as Electronic Security Perimeter', severity: 'high', standards: ['NERC_CIP'] },
  { id: 'CIP-002', name: 'BES Asset Classification', description: 'Assets in critical zones need explicit criticality', severity: 'medium', standards: ['NERC_CIP'] },
];

interface ComplianceSettingsDialogProps {
  enabledStandards: ComplianceStandard[];
  onClose: () => void;
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  high: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
  medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
  low: 'bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200',
  error: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
  info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
};

function StandardBadge({ standardId }: { standardId: ComplianceStandard }) {
  const std = COMPLIANCE_STANDARDS.find(s => s.id === standardId);
  if (!std) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded"
      style={{ backgroundColor: std.color + '20', color: std.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: std.color }} />
      {std.name}
    </span>
  );
}

const ComplianceSettingsDialog = memo(({
  enabledStandards,
  onClose,
}: ComplianceSettingsDialogProps) => {
  const enabledSet = new Set(enabledStandards);

  const activeChecks = VALIDATION_CHECKS.filter(c => c.standards.some(s => enabledSet.has(s)));
  const inactiveChecks = VALIDATION_CHECKS.filter(c => !c.standards.some(s => enabledSet.has(s)));

  const activeRules = POLICY_RULES.filter(r => r.standards.some(s => enabledSet.has(s)));
  const inactiveRules = POLICY_RULES.filter(r => !r.standards.some(s => enabledSet.has(s)));

  return (
    <DialogShell title="Compliance Settings" onClose={onClose} maxWidth="max-w-3xl">
        <div className="max-h-[calc(85vh-4rem)] flex flex-col">
        {/* Description */}
        <div className="px-6 pb-2 -mt-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Active checks and rules based on selected compliance standards
          </p>
        </div>

        {/* Active standards */}
        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">Active:</span>
          {enabledStandards.map(std => (
            <StandardBadge key={std} standardId={std} />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Active Validation Checks */}
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">
              Validation Checks ({activeChecks.length} active)
            </h3>
            <div className="space-y-2">
              {activeChecks.map(check => (
                <div key={check.code} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${severityColors[check.severity]}`}>
                    {check.severity.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{check.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{check.description}</div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {check.standards.map(s => (
                      <StandardBadge key={s} standardId={s} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Policy Rules */}
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">
              Policy Rules ({activeRules.length} active)
            </h3>
            <div className="space-y-2">
              {activeRules.map(rule => (
                <div key={rule.id} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${severityColors[rule.severity]}`}>
                    {rule.severity.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400 mr-1.5">{rule.id}</span>
                      {rule.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{rule.description}</div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {rule.standards.map(s => (
                      <StandardBadge key={s} standardId={s} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Inactive checks/rules */}
          {(inactiveChecks.length > 0 || inactiveRules.length > 0) && (
            <div>
              <h3 className="font-semibold text-gray-500 dark:text-gray-400 mb-3">
                Inactive ({inactiveChecks.length + inactiveRules.length} from other standards)
              </h3>
              <div className="space-y-2 opacity-50">
                {inactiveChecks.map(check => (
                  <div key={check.code} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400">
                      {check.severity.toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-500 dark:text-gray-400">{check.name}</div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {check.standards.map(s => (
                        <StandardBadge key={s} standardId={s} />
                      ))}
                    </div>
                  </div>
                ))}
                {inactiveRules.map(rule => (
                  <div key={rule.id} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400">
                      {rule.severity.toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        <span className="font-mono text-xs mr-1.5">{rule.id}</span>
                        {rule.name}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {rule.standards.map(s => (
                        <StandardBadge key={s} standardId={s} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Change active standards in Project Settings
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

ComplianceSettingsDialog.displayName = 'ComplianceSettingsDialog';

export default ComplianceSettingsDialog;
