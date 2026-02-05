import { memo, useMemo } from 'react';
import type { Project, ValidationResult, PolicyViolation } from '../types/models';
import { ZONE_TYPE_CONFIG, SECURITY_LEVEL_CONFIG } from '../types/models';

interface ComplianceDashboardProps {
  project: Project;
  validationResults: ValidationResult[];
  policyViolations: PolicyViolation[];
  onClose: () => void;
}

// IEC 62443 Security Requirements (subset)
const SECURITY_REQUIREMENTS = [
  { id: 'SR-1.1', name: 'Human user identification and authentication', category: 'IAC' },
  { id: 'SR-1.2', name: 'Software process and device identification and authentication', category: 'IAC' },
  { id: 'SR-2.1', name: 'Authorization enforcement', category: 'UC' },
  { id: 'SR-2.2', name: 'Wireless use control', category: 'UC' },
  { id: 'SR-3.1', name: 'Communication integrity', category: 'SI' },
  { id: 'SR-3.2', name: 'Malicious code protection', category: 'SI' },
  { id: 'SR-4.1', name: 'Information confidentiality', category: 'DC' },
  { id: 'SR-5.1', name: 'Network segmentation', category: 'RDF' },
  { id: 'SR-6.1', name: 'Audit log accessibility', category: 'TRE' },
  { id: 'SR-7.1', name: 'Denial of service protection', category: 'RA' },
];

const ComplianceDashboard = memo(({
  project,
  validationResults,
  policyViolations,
  onClose,
}: ComplianceDashboardProps) => {
  // Calculate compliance metrics
  const metrics = useMemo(() => {
    const zones = project.zones;
    const conduits = project.conduits;
    const totalAssets = zones.reduce((sum, z) => sum + z.assets.length, 0);

    // Zone compliance
    const zonesWithSL = zones.filter(z => z.security_level_target >= 1);
    const zoneCompliance = zones.length > 0 ? Math.round((zonesWithSL.length / zones.length) * 100) : 0;

    // Conduit compliance (all conduits should have flows defined)
    const conduitsWithFlows = conduits.filter(c => c.flows && c.flows.length > 0);
    const conduitCompliance = conduits.length > 0 ? Math.round((conduitsWithFlows.length / conduits.length) * 100) : 0;

    // Security level distribution
    const slDistribution = [0, 0, 0, 0, 0]; // SL 0-4
    zones.forEach(z => {
      slDistribution[z.security_level_target]++;
    });

    // Error/warning counts
    const errorCount = validationResults.filter(r => r.severity === 'error').length;
    const warningCount = validationResults.filter(r => r.severity === 'warning').length;
    const policyCount = policyViolations.length;

    // Overall score
    const baseScore = 100;
    const overallScore = Math.max(0, baseScore - (errorCount * 20) - (warningCount * 5) - (policyCount * 10));

    return {
      zoneCount: zones.length,
      conduitCount: conduits.length,
      assetCount: totalAssets,
      zoneCompliance,
      conduitCompliance,
      slDistribution,
      errorCount,
      warningCount,
      policyCount,
      overallScore,
    };
  }, [project, validationResults, policyViolations]);

  // Group zones by type
  const zonesByType = useMemo(() => {
    const grouped: Record<string, number> = {};
    project.zones.forEach(z => {
      grouped[z.type] = (grouped[z.type] || 0) + 1;
    });
    return grouped;
  }, [project.zones]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 dark:bg-green-900/30';
    if (score >= 60) return 'bg-yellow-100 dark:bg-yellow-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Compliance Dashboard</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">IEC 62443 Security Assessment</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Overall Score */}
          <div className={`${getScoreBgColor(metrics.overallScore)} rounded-lg p-6 mb-6`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Overall Compliance Score</h3>
                <p className={`text-5xl font-bold ${getScoreColor(metrics.overallScore)}`}>
                  {metrics.overallScore}%
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-red-600 dark:text-red-400">{metrics.errorCount} errors</span>
                  <span className="text-yellow-600 dark:text-yellow-400">{metrics.warningCount} warnings</span>
                  <span className="text-orange-600 dark:text-orange-400">{metrics.policyCount} policy issues</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{metrics.zoneCount}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Zones</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{metrics.conduitCount}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Conduits</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{metrics.assetCount}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Assets</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">{metrics.conduitCompliance}%</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Flow Coverage</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Zone Distribution */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Zone Types</h3>
              <div className="space-y-2">
                {Object.entries(zonesByType).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: ZONE_TYPE_CONFIG[type as keyof typeof ZONE_TYPE_CONFIG]?.color || '#888' }}
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {ZONE_TYPE_CONFIG[type as keyof typeof ZONE_TYPE_CONFIG]?.label || type}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Security Level Distribution */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Security Level Distribution</h3>
              <div className="space-y-2">
                {[1, 2, 3, 4].map(sl => (
                  <div key={sl} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-bold"
                        style={{
                          backgroundColor: SECURITY_LEVEL_CONFIG[sl]?.bgColor,
                          color: SECURITY_LEVEL_CONFIG[sl]?.color,
                        }}
                      >
                        SL-{sl}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {SECURITY_LEVEL_CONFIG[sl]?.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                        <div
                          className="bg-blue-500 rounded-full h-2"
                          style={{
                            width: `${metrics.zoneCount > 0 ? (metrics.slDistribution[sl] / metrics.zoneCount) * 100 : 0}%`
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200 w-6 text-right">
                        {metrics.slDistribution[sl]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SL-T vs SL-C Gap Analysis */}
          {project.zones.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">SL-T vs SL-C Gap Analysis</h3>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-600">
                      <th className="text-left px-4 py-2 text-gray-600 dark:text-gray-300 font-medium">Zone</th>
                      <th className="text-center px-4 py-2 text-gray-600 dark:text-gray-300 font-medium">Type</th>
                      <th className="text-center px-4 py-2 text-gray-600 dark:text-gray-300 font-medium">SL-T</th>
                      <th className="text-center px-4 py-2 text-gray-600 dark:text-gray-300 font-medium">SL-C</th>
                      <th className="text-center px-4 py-2 text-gray-600 dark:text-gray-300 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.zones.map((zone) => {
                      const slT = zone.security_level_target;
                      const slC = zone.security_level_capability ?? null;
                      let statusLabel: string;
                      let statusColor: string;
                      if (slC == null) {
                        statusLabel = 'Undefined';
                        statusColor = 'bg-gray-200 dark:bg-gray-500 text-gray-600 dark:text-gray-300';
                      } else if (slC >= slT) {
                        statusLabel = 'Met';
                        statusColor = 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300';
                      } else {
                        statusLabel = `Gap (${slT - slC})`;
                        statusColor = 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300';
                      }
                      return (
                        <tr key={zone.id} className="border-t border-gray-200 dark:border-gray-600">
                          <td className="px-4 py-2 text-gray-800 dark:text-gray-200 font-medium">{zone.name}</td>
                          <td className="px-4 py-2 text-center">
                            <span
                              className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                              style={{ backgroundColor: ZONE_TYPE_CONFIG[zone.type]?.color || '#888' }}
                            >
                              {ZONE_TYPE_CONFIG[zone.type]?.label || zone.type}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-bold" style={{
                              backgroundColor: SECURITY_LEVEL_CONFIG[slT]?.bgColor,
                              color: SECURITY_LEVEL_CONFIG[slT]?.color,
                            }}>
                              SL-{slT}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            {slC != null ? (
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-bold" style={{
                                backgroundColor: SECURITY_LEVEL_CONFIG[slC]?.bgColor,
                                color: SECURITY_LEVEL_CONFIG[slC]?.color,
                              }}>
                                SL-{slC}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">--</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* Summary counts */}
                <div className="flex items-center gap-4 px-4 py-3 border-t border-gray-200 dark:border-gray-600 text-xs">
                  {(() => {
                    const met = project.zones.filter(z => z.security_level_capability != null && z.security_level_capability >= z.security_level_target).length;
                    const gap = project.zones.filter(z => z.security_level_capability != null && z.security_level_capability < z.security_level_target).length;
                    const undef = project.zones.filter(z => z.security_level_capability == null).length;
                    return (
                      <>
                        <span className="text-green-600 dark:text-green-400 font-medium">{met} Met</span>
                        <span className="text-red-600 dark:text-red-400 font-medium">{gap} Gap</span>
                        <span className="text-gray-500 dark:text-gray-400">{undef} Undefined</span>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Security Requirements */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">IEC 62443 Security Requirements Coverage</h3>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-2">
                {SECURITY_REQUIREMENTS.map(sr => (
                  <div key={sr.id} className="flex items-center gap-2 text-sm">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                      metrics.overallScore >= 60 ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400' : 'bg-gray-200 dark:bg-gray-600 text-gray-500'
                    }`}>
                      {metrics.overallScore >= 60 ? '✓' : '○'}
                    </span>
                    <span className="text-gray-600 dark:text-gray-300">{sr.id}: {sr.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Policy Violations */}
          {policyViolations.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Policy Violations</h3>
              <div className="space-y-2">
                {policyViolations.map((violation, index) => (
                  <div key={index} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
                    <div className="font-medium text-red-800 dark:text-red-300">{violation.rule_id}: {violation.rule_name}</div>
                    <div className="text-sm text-red-600 dark:text-red-400">{violation.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

ComplianceDashboard.displayName = 'ComplianceDashboard';

export default ComplianceDashboard;
