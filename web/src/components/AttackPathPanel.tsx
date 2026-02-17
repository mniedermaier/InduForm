import { memo, useState, useEffect, useCallback } from 'react';
import type { Project } from '../types/models';
import { api, AttackPathAnalysis, AttackPath, AttackPathStep } from '../api/client';
import DialogShell from './DialogShell';

interface AttackPathPanelProps {
  project: Project;
  onClose: () => void;
  onHighlightPath?: (path: AttackPath | null) => void;
}

const RISK_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  critical: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', badge: 'bg-red-500' },
  high: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', badge: 'bg-orange-500' },
  medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', badge: 'bg-yellow-500' },
  low: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-500' },
  minimal: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', badge: 'bg-green-500' },
};

function RiskBadge({ level, score }: { level: string; score: number }) {
  const colors = RISK_COLORS[level] || RISK_COLORS.minimal;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
      <span className={`w-2 h-2 rounded-full ${colors.badge}`} />
      {Math.round(score)} {level}
    </span>
  );
}

function WeaknessCard({ weakness }: { weakness: { weakness_type: string; description: string; remediation: string; severity_contribution: number } }) {
  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded p-2 text-xs">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="font-medium text-gray-800 dark:text-gray-200">{weakness.description}</span>
        <span className="text-gray-400 flex-shrink-0">
          {Math.round(weakness.severity_contribution * 100)}%
        </span>
      </div>
      <div className="text-gray-500 dark:text-gray-400">
        <span className="font-medium">Fix: </span>{weakness.remediation}
      </div>
    </div>
  );
}

function StepDetail({ step, index }: { step: AttackPathStep; index: number }) {
  return (
    <div className="flex items-start gap-2 py-2">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300">
        {index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 text-sm">
          <span className="font-medium text-gray-800 dark:text-gray-200">{step.from_zone_name}</span>
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span className="font-medium text-gray-800 dark:text-gray-200">{step.to_zone_name}</span>
          <span className="text-xs text-gray-400 ml-1">cost: {step.traversal_cost}</span>
        </div>
        {step.weaknesses.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {step.weaknesses.map((w, i) => (
              <WeaknessCard key={i} weakness={w} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PathCard({ path, isHighlighted, onHighlight }: { path: AttackPath; isHighlighted: boolean; onHighlight?: (path: AttackPath | null) => void }) {
  const [expanded, setExpanded] = useState(false);
  const totalWeaknesses = path.steps.reduce((sum, s) => sum + s.weaknesses.length, 0);

  return (
    <div className={`border rounded-lg ${RISK_COLORS[path.risk_level]?.bg || 'bg-gray-50 dark:bg-gray-800'} ${isHighlighted ? 'border-blue-500 border-l-4' : 'border-gray-200 dark:border-gray-600'}`}>
      <div className="flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 px-4 py-3 flex items-center justify-between text-left"
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-3 min-w-0">
            <RiskBadge level={path.risk_level} score={path.risk_score} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                {path.entry_zone_name} → {path.target_zone_name}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {path.steps.length} step{path.steps.length !== 1 ? 's' : ''}
                {totalWeaknesses > 0 && ` · ${totalWeaknesses} weakness${totalWeaknesses !== 1 ? 'es' : ''}`}
              </div>
            </div>
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {onHighlight && (
          <button
            onClick={(e) => { e.stopPropagation(); onHighlight(isHighlighted ? null : path); }}
            className={`mr-3 p-1.5 rounded-lg transition-colors flex-shrink-0 ${
              isHighlighted
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-600'
            }`}
            title={isHighlighted ? 'Hide on map' : 'Show on map'}
            aria-label={isHighlighted ? 'Hide on map' : 'Show on map'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-3 border-t border-gray-200 dark:border-gray-600">
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 mb-1">
            Target: {path.target_reason}
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-600">
            {path.steps.map((step, i) => (
              <StepDetail key={step.conduit_id} step={step} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const AttackPathPanel = memo(({ project, onClose, onHighlightPath }: AttackPathPanelProps) => {
  const [analysis, setAnalysis] = useState<AttackPathAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightedPathId, setHighlightedPathId] = useState<string | null>(null);

  const handleHighlight = useCallback((path: AttackPath | null) => {
    setHighlightedPathId(path?.id ?? null);
    onHighlightPath?.(path);
  }, [onHighlightPath]);

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.analyzeAttackPaths(project);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze attack paths');
    } finally {
      setLoading(false);
    }
  }, [project]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  return (
    <DialogShell title="Attack Path Analysis" onClose={onClose} maxWidth="max-w-5xl">
      <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-gray-500 dark:text-gray-400">Analyzing attack paths...</span>
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <div className="text-red-600 dark:text-red-400 mb-2">{error}</div>
            <button
              onClick={fetchAnalysis}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        )}

        {analysis && !loading && (
          <>
            {/* Summary bar */}
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
                {analysis.summary}
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.counts.critical > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {analysis.counts.critical} critical
                  </span>
                )}
                {analysis.counts.high > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                    {analysis.counts.high} high
                  </span>
                )}
                {analysis.counts.medium > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                    {analysis.counts.medium} medium
                  </span>
                )}
                {analysis.counts.low > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    {analysis.counts.low} low
                  </span>
                )}
              </div>
            </div>

            {/* Entry points and targets */}
            <div className="flex flex-wrap gap-4 mb-4 text-xs">
              {analysis.entry_points.length > 0 && (
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400 mr-1">Entry points:</span>
                  {analysis.entry_points.map((name) => (
                    <span key={name} className="inline-block px-2 py-0.5 mr-1 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {analysis.high_value_targets.length > 0 && (
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400 mr-1">Targets:</span>
                  {analysis.high_value_targets.map((name) => (
                    <span key={name} className="inline-block px-2 py-0.5 mr-1 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Path list */}
            {analysis.paths.length > 0 ? (
              <div className="space-y-2">
                {analysis.paths.map((path) => (
                  <PathCard
                    key={path.id}
                    path={path}
                    isHighlighted={highlightedPathId === path.id}
                    onHighlight={handleHighlight}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <svg className="w-12 h-12 mx-auto mb-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <div className="font-medium">No attack paths identified</div>
                <div className="text-sm mt-1">
                  No viable lateral movement paths were found between entry points and high-value targets.
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          Close
        </button>
      </div>
    </DialogShell>
  );
});

AttackPathPanel.displayName = 'AttackPathPanel';

export default AttackPathPanel;
