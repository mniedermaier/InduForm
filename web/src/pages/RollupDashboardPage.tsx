import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api/client';
import { Sparkline, LineChart } from '../components/AnalyticsPanel';
import type { ChartPoint } from '../components/AnalyticsPanel';
import type { RollupDashboardData, RollupProjectItem } from '../types/models';
import UserMenu from '../components/UserMenu';
import NetworkBackground from '../components/NetworkBackground';

interface RollupDashboardPageProps {
  onBackToProjects: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenTeamManagement?: () => void;
  onOpenAdmin?: () => void;
}

type SortField = 'name' | 'compliance' | 'risk' | 'zones' | 'assets' | 'conduits' | 'updated';
type SortDir = 'asc' | 'desc';

export default function RollupDashboardPage({
  onBackToProjects,
  onOpenProject,
  onOpenTeamManagement,
  onOpenAdmin,
}: RollupDashboardPageProps) {
  const [data, setData] = useState<RollupDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [sortField, setSortField] = useState<SortField>('compliance');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [riskFilter, setRiskFilter] = useState<string | null>(null);
  const [complianceFilter, setComplianceFilter] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getRollupDashboard(days);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return field;
      }
      setSortDir(field === 'name' || field === 'updated' ? 'asc' : 'desc');
      return field;
    });
  }, []);

  const filteredAndSortedProjects = useMemo(() => {
    if (!data) return [];
    let projects = [...data.projects];

    // Apply filters
    if (riskFilter) {
      projects = projects.filter(p => {
        if (p.risk_score === null) return riskFilter === 'unknown';
        if (riskFilter === 'critical') return p.risk_score >= 80;
        if (riskFilter === 'high') return p.risk_score >= 60 && p.risk_score < 80;
        if (riskFilter === 'medium') return p.risk_score >= 40 && p.risk_score < 60;
        if (riskFilter === 'low') return p.risk_score >= 20 && p.risk_score < 40;
        if (riskFilter === 'minimal') return p.risk_score < 20;
        return true;
      });
    }

    if (complianceFilter) {
      projects = projects.filter(p => {
        if (p.compliance_score === null) return complianceFilter === 'unknown';
        if (complianceFilter === 'high') return p.compliance_score >= 90;
        if (complianceFilter === 'medium') return p.compliance_score >= 70 && p.compliance_score < 90;
        if (complianceFilter === 'low') return p.compliance_score < 70;
        return true;
      });
    }

    // Sort
    projects.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'compliance': cmp = (a.compliance_score ?? -1) - (b.compliance_score ?? -1); break;
        case 'risk': cmp = (a.risk_score ?? -1) - (b.risk_score ?? -1); break;
        case 'zones': cmp = a.zone_count - b.zone_count; break;
        case 'assets': cmp = a.asset_count - b.asset_count; break;
        case 'conduits': cmp = a.conduit_count - b.conduit_count; break;
        case 'updated': cmp = a.updated_at.localeCompare(b.updated_at); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return projects;
  }, [data, sortField, sortDir, riskFilter, complianceFilter]);

  const complianceTrendData: ChartPoint[] = useMemo(() => {
    if (!data?.trends.length) return [];
    return data.trends.map((t, i) => ({ x: i, y: t.avg_compliance, label: t.date }));
  }, [data]);

  const riskTrendData: ChartPoint[] = useMemo(() => {
    if (!data?.trends.length) return [];
    return data.trends.map((t, i) => ({ x: i, y: t.avg_risk, label: t.date }));
  }, [data]);

  const complianceColor = (score: number | null) => {
    if (score === null) return 'text-gray-400 dark:text-slate-500';
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-yellow-500';
    if (score >= 50) return 'text-orange-500';
    return 'text-red-500';
  };

  const riskColor = (score: number | null) => {
    if (score === null) return 'text-gray-400 dark:text-slate-500';
    if (score >= 80) return 'text-red-500';
    if (score >= 60) return 'text-orange-500';
    if (score >= 40) return 'text-yellow-500';
    if (score >= 20) return 'text-blue-500';
    return 'text-green-500';
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-slate-200 select-none"
      onClick={() => handleSort(field)}
      aria-label={`Sort by ${label}`}
      aria-sort={sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field && (
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            {sortDir === 'asc'
              ? <path d="M5 10l5-5 5 5H5z" />
              : <path d="M5 10l5 5 5-5H5z" />
            }
          </svg>
        )}
      </span>
    </th>
  );

  return (
    <div className="h-screen relative bg-gray-50 dark:bg-slate-900 flex flex-col overflow-hidden">
      <NetworkBackground />

      {/* Header */}
      <header className="flex-none bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-slate-700/50 relative z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={onBackToProjects}
                className="p-1.5 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-lg"
                aria-label="Back to projects"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="InduForm" className="w-8 h-8" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white hidden sm:block">Compliance Overview</h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Time range selector */}
              <div className="flex gap-1 bg-gray-100 dark:bg-slate-700/50 rounded-lg p-1">
                {([7, 30, 90] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      days === d
                        ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>

              <UserMenu
                onOpenTeamManagement={onOpenTeamManagement}
                onOpenAdmin={onOpenAdmin}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Loading */}
          {loading && (
            <div className="p-16 text-center" role="status" aria-live="polite">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" aria-hidden="true" />
              <div className="text-gray-500 dark:text-slate-400">Loading dashboard...</div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-16 text-center">
              <div className="text-red-500 dark:text-red-400 mb-2">{error}</div>
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600"
              >
                Retry
              </button>
            </div>
          )}

          {/* Dashboard content */}
          {!loading && !error && data && (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatCard label="Projects" value={data.total_projects} color="text-gray-900 dark:text-white" />
                <StatCard label="Zones" value={data.total_zones} color="text-cyan-400" />
                <StatCard label="Assets" value={data.total_assets} color="text-amber-400" />
                <StatCard label="Conduits" value={data.total_conduits} color="text-blue-400" />
              </div>

              {/* Compliance + Risk sections */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Compliance */}
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-slate-700/50 p-6">
                  <h2 className="text-sm font-medium text-gray-600 dark:text-slate-300 mb-4">Compliance</h2>
                  <div className="flex items-start gap-6 mb-4">
                    <div>
                      <div className={`text-4xl font-bold ${complianceColor(data.avg_compliance)}`}>
                        {data.avg_compliance !== null ? `${data.avg_compliance}%` : '-'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">avg across projects</div>
                    </div>
                    <div className="flex-1">
                      <DistributionBar
                        segments={[
                          { value: data.compliance_distribution.high, color: 'bg-green-500', label: `High (${data.compliance_distribution.high})` },
                          { value: data.compliance_distribution.medium, color: 'bg-yellow-500', label: `Medium (${data.compliance_distribution.medium})` },
                          { value: data.compliance_distribution.low, color: 'bg-red-500', label: `Low (${data.compliance_distribution.low})` },
                          { value: data.compliance_distribution.unknown, color: 'bg-gray-400', label: `Unknown (${data.compliance_distribution.unknown})` },
                        ]}
                        total={data.total_projects}
                      />
                    </div>
                  </div>
                  {complianceTrendData.length >= 2 && (
                    <LineChart data={complianceTrendData} height={160} color="#22c55e" fillColor="#22c55e20" yMin={0} yMax={100} yLabel="%" />
                  )}
                  {data.worst_compliance.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-xs text-gray-500 dark:text-slate-400 mb-2">Lowest Compliance</h3>
                      {data.worst_compliance.map(w => (
                        <div
                          key={w.id}
                          className="flex items-center justify-between py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded px-2 -mx-2"
                          onClick={() => onOpenProject(w.id)}
                        >
                          <span className="text-sm text-gray-700 dark:text-slate-200 truncate">{w.name}</span>
                          <span className={`text-sm font-medium ${complianceColor(w.score)}`}>{w.score}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Risk */}
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-slate-700/50 p-6">
                  <h2 className="text-sm font-medium text-gray-600 dark:text-slate-300 mb-4">Risk</h2>
                  <div className="flex items-start gap-6 mb-4">
                    <div>
                      <div className={`text-4xl font-bold ${riskColor(data.avg_risk)}`}>
                        {data.avg_risk !== null ? data.avg_risk : '-'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">avg risk score</div>
                    </div>
                    <div className="flex-1">
                      <DistributionBar
                        segments={[
                          { value: data.risk_distribution.critical, color: 'bg-red-600', label: `Critical (${data.risk_distribution.critical})` },
                          { value: data.risk_distribution.high, color: 'bg-orange-500', label: `High (${data.risk_distribution.high})` },
                          { value: data.risk_distribution.medium, color: 'bg-yellow-500', label: `Medium (${data.risk_distribution.medium})` },
                          { value: data.risk_distribution.low, color: 'bg-blue-500', label: `Low (${data.risk_distribution.low})` },
                          { value: data.risk_distribution.minimal, color: 'bg-green-500', label: `Minimal (${data.risk_distribution.minimal})` },
                          { value: data.risk_distribution.unknown, color: 'bg-gray-400', label: `Unknown (${data.risk_distribution.unknown})` },
                        ]}
                        total={data.total_projects}
                      />
                    </div>
                  </div>
                  {riskTrendData.length >= 2 && (
                    <LineChart data={riskTrendData} height={160} color="#ef4444" fillColor="#ef444420" yMin={0} yMax={100} yLabel="" />
                  )}
                  {data.worst_risk.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-xs text-gray-500 dark:text-slate-400 mb-2">Highest Risk</h3>
                      {data.worst_risk.map(w => (
                        <div
                          key={w.id}
                          className="flex items-center justify-between py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded px-2 -mx-2"
                          onClick={() => onOpenProject(w.id)}
                        >
                          <span className="text-sm text-gray-700 dark:text-slate-200 truncate">{w.name}</span>
                          <span className={`text-sm font-medium ${riskColor(w.score)}`}>{w.score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="text-sm text-gray-500 dark:text-slate-400">Filter:</span>
                <FilterChips
                  label="Risk"
                  options={['critical', 'high', 'medium', 'low', 'minimal']}
                  active={riskFilter}
                  onSelect={v => setRiskFilter(riskFilter === v ? null : v)}
                  colors={{
                    critical: 'bg-red-600',
                    high: 'bg-orange-500',
                    medium: 'bg-yellow-500',
                    low: 'bg-blue-500',
                    minimal: 'bg-green-500',
                  }}
                />
                <FilterChips
                  label="Compliance"
                  options={['high', 'medium', 'low']}
                  active={complianceFilter}
                  onSelect={v => setComplianceFilter(complianceFilter === v ? null : v)}
                  colors={{
                    high: 'bg-green-500',
                    medium: 'bg-yellow-500',
                    low: 'bg-red-500',
                  }}
                />
                {(riskFilter || complianceFilter) && (
                  <button
                    onClick={() => { setRiskFilter(null); setComplianceFilter(null); }}
                    className="text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Projects table */}
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-slate-700/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full" aria-label="Projects compliance overview">
                    <thead className="bg-gray-50/50 dark:bg-slate-700/30">
                      <tr>
                        <SortHeader field="name" label="Project" />
                        <SortHeader field="compliance" label="Compliance" />
                        <SortHeader field="risk" label="Risk" />
                        <SortHeader field="zones" label="Zones" />
                        <SortHeader field="assets" label="Assets" />
                        <SortHeader field="conduits" label="Conduits" />
                        <SortHeader field="updated" label="Updated" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-slate-700/50">
                      {filteredAndSortedProjects.map(proj => (
                        <ProjectRow
                          key={proj.id}
                          project={proj}
                          onClick={() => onOpenProject(proj.id)}
                        />
                      ))}
                      {filteredAndSortedProjects.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-500 dark:text-slate-400">
                            No projects match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-sm text-gray-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

function DistributionBar({ segments, total }: { segments: { value: number; color: string; label: string }[]; total: number }) {
  if (total === 0) return <div className="text-xs text-gray-400 dark:text-slate-500">No data</div>;
  const nonZero = segments.filter(s => s.value > 0);
  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden bg-gray-200 dark:bg-slate-700">
        {nonZero.map((seg, i) => (
          <div
            key={i}
            className={`${seg.color} transition-all`}
            style={{ width: `${(seg.value / total) * 100}%` }}
            title={seg.label}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {segments.filter(s => s.value > 0).map((seg, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${seg.color}`} />
            <span className="text-xs text-gray-600 dark:text-slate-300">{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterChips({
  label,
  options,
  active,
  onSelect,
  colors,
}: {
  label: string;
  options: string[];
  active: string | null;
  onSelect: (v: string) => void;
  colors: Record<string, string>;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400 dark:text-slate-500 mr-1">{label}:</span>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onSelect(opt)}
          className={`px-2 py-0.5 text-xs rounded-full capitalize transition-colors ${
            active === opt
              ? `${colors[opt]} text-white`
              : 'bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-300 dark:hover:bg-slate-500'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function ProjectRow({ project, onClick }: { project: RollupProjectItem; onClick: () => void }) {
  const compColor = project.compliance_score !== null
    ? project.compliance_score >= 90 ? '#22c55e' : project.compliance_score >= 70 ? '#eab308' : project.compliance_score >= 50 ? '#f97316' : '#ef4444'
    : '#94a3b8';
  const riskColorHex = project.risk_score !== null
    ? project.risk_score >= 80 ? '#ef4444' : project.risk_score >= 60 ? '#f97316' : project.risk_score >= 40 ? '#eab308' : project.risk_score >= 20 ? '#3b82f6' : '#22c55e'
    : '#94a3b8';

  return (
    <tr
      className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-gray-900 dark:text-slate-100">{project.name}</div>
        {project.description && (
          <div className="text-xs text-gray-500 dark:text-slate-400 truncate max-w-xs">{project.description}</div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${
            project.compliance_score !== null
              ? project.compliance_score >= 90 ? 'text-green-500' : project.compliance_score >= 70 ? 'text-yellow-500' : project.compliance_score >= 50 ? 'text-orange-500' : 'text-red-500'
              : 'text-gray-400 dark:text-slate-500'
          }`}>
            {project.compliance_score !== null ? `${project.compliance_score}%` : '-'}
          </span>
          {project.compliance_sparkline.length >= 2 && (
            <Sparkline data={project.compliance_sparkline} width={50} height={16} color={compColor} />
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${
            project.risk_score !== null
              ? project.risk_score >= 80 ? 'text-red-500' : project.risk_score >= 60 ? 'text-orange-500' : project.risk_score >= 40 ? 'text-yellow-500' : project.risk_score >= 20 ? 'text-blue-500' : 'text-green-500'
              : 'text-gray-400 dark:text-slate-500'
          }`}>
            {project.risk_score !== null ? project.risk_score : '-'}
          </span>
          {project.risk_sparkline.length >= 2 && (
            <Sparkline data={project.risk_sparkline} width={50} height={16} color={riskColorHex} />
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{project.zone_count}</td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{project.asset_count}</td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">{project.conduit_count}</td>
      <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
        {new Date(project.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
      </td>
    </tr>
  );
}
