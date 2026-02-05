import { memo, useState, useEffect } from 'react';
import type { Project } from '../types/models';
import { api, RiskAssessment, ZoneRisk } from '../api/client';

interface RiskDashboardProps {
  project: Project;
  onClose: () => void;
}

const RISK_COLORS = {
  critical: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', badge: 'bg-red-500' },
  high: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', badge: 'bg-orange-500' },
  medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', badge: 'bg-yellow-500' },
  low: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-500' },
  minimal: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', badge: 'bg-green-500' },
};

function RiskMeter({ score, size = 'large' }: { score: number; size?: 'small' | 'large' }) {
  const radius = size === 'large' ? 70 : 35;
  const stroke = size === 'large' ? 12 : 6;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  const getColor = (score: number) => {
    if (score >= 80) return '#ef4444';
    if (score >= 60) return '#f97316';
    if (score >= 40) return '#eab308';
    if (score >= 20) return '#3b82f6';
    return '#22c55e';
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={radius * 2 + stroke} height={radius * 2 + stroke} className="transform -rotate-90">
        <circle
          cx={radius + stroke / 2}
          cy={radius + stroke / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-gray-200 dark:text-gray-700"
        />
        <circle
          cx={radius + stroke / 2}
          cy={radius + stroke / 2}
          r={radius}
          fill="none"
          stroke={getColor(score)}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-bold ${size === 'large' ? 'text-3xl' : 'text-lg'} text-gray-800 dark:text-gray-100`}>
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
}

function ZoneRiskCard({ zoneName, risk }: { zoneName: string; risk: ZoneRisk }) {
  const colors = RISK_COLORS[risk.level];
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg p-3 ${colors.bg}`}>
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${colors.badge}`} />
          <span className={`font-medium ${colors.text}`}>{zoneName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${colors.text}`}>{Math.round(risk.score)}</span>
          <span className={`text-xs uppercase ${colors.text}`}>{risk.level}</span>
          <svg
            className={`w-4 h-4 transition-transform ${colors.text} ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">SL Base Risk:</span>
              <span className={colors.text}>{risk.factors.sl_base_risk.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Asset Criticality:</span>
              <span className={colors.text}>{risk.factors.asset_criticality_risk.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Exposure:</span>
              <span className={colors.text}>{risk.factors.exposure_risk.toFixed(1)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">SL Gap:</span>
              <span className={colors.text}>{risk.factors.sl_gap_risk.toFixed(1)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const RiskDashboard = memo(({ project, onClose }: RiskDashboardProps) => {
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRisk = async () => {
      try {
        setLoading(true);
        const result = await api.assessRisk(project);
        setAssessment(result);
        setError(null);
      } catch (err) {
        console.error('Risk assessment error:', err);
        setError('Failed to assess risk');
      } finally {
        setLoading(false);
      }
    };

    fetchRisk();
  }, [project]);

  const sortedZones = assessment
    ? Object.entries(assessment.zone_risks)
        .map(([zoneId, risk]) => ({
          zoneId,
          zoneName: project.zones.find(z => z.id === zoneId)?.name || zoneId,
          risk,
        }))
        .sort((a, b) => b.risk.score - a.risk.score)
    : [];

  const overallColors = assessment ? RISK_COLORS[assessment.overall_level] : RISK_COLORS.minimal;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Risk Assessment</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Security risk analysis for {project.project.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
              {error}
            </div>
          ) : assessment ? (
            <div className="space-y-6">
              {/* Overall Risk */}
              <div className={`rounded-lg p-6 ${overallColors.bg}`}>
                <div className="flex items-center gap-6">
                  <RiskMeter score={assessment.overall_score} />
                  <div className="flex-1">
                    <div className={`text-2xl font-bold ${overallColors.text} capitalize`}>
                      {assessment.overall_level} Risk
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Overall security risk score based on zone configurations, asset criticality, and network exposure.
                    </p>
                  </div>
                </div>
              </div>

              {/* Risk Distribution */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Risk by Zone</h3>
                <div className="space-y-2">
                  {sortedZones.map(({ zoneId, zoneName, risk }) => (
                    <ZoneRiskCard key={zoneId} zoneName={zoneName} risk={risk} />
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              {assessment.recommendations.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Recommendations</h3>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <ul className="space-y-2">
                      {assessment.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-blue-800 dark:text-blue-200">
                          <span className="text-blue-500 mt-0.5">•</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

RiskDashboard.displayName = 'RiskDashboard';

export default RiskDashboard;
