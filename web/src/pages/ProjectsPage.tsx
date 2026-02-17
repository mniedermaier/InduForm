import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useToast } from '../contexts/ToastContext';
import NetworkBackground from '../components/NetworkBackground';
import UserSettingsDialog from '../components/UserSettingsDialog';
import NotificationBell from '../components/NotificationBell';
import ActivityLogPanel from '../components/ActivityLogPanel';
import UserMenu from '../components/UserMenu';
import { Sparkline } from '../components/AnalyticsPanel';

interface ProjectSummary {
  id: string;
  name: string;
  description: string | null;
  standard: string;
  compliance_standards?: string[];
  owner_id: string;
  owner_username: string;
  created_at: string;
  updated_at: string;
  zone_count: number;
  conduit_count: number;
  asset_count: number;
  permission: 'owner' | 'editor' | 'viewer';
  risk_score?: number;
  risk_level?: 'critical' | 'high' | 'medium' | 'low' | 'minimal';
  compliance_score?: number;
  zone_types?: Record<string, number>;
  is_archived?: boolean;
  archived_at?: string;
}

interface ProjectsPageProps {
  onOpenProject: (projectId: string) => void;
  onOpenTeamManagement: () => void;
  onCreateProject: () => void;
  onShareProject?: (projectId: string, projectName: string) => void;
  onOpenTemplates?: () => void;
  onOpenAdmin?: () => void;
  onOpenGlobalSearch?: () => void;
}

export default function ProjectsPage({
  onOpenProject,
  onOpenTeamManagement,
  onCreateProject,
  onShareProject,
  onOpenTemplates,
  onOpenAdmin,
  onOpenGlobalSearch,
}: ProjectsPageProps) {
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'owned' | 'shared' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string[]>([]);
  const [complianceFilter, setComplianceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renameProject, setRenameProject] = useState<{ id: string; name: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [saveTemplateProject, setSaveTemplateProject] = useState<{ id: string; name: string } | null>(null);
  const [saveTemplateLoading, setSaveTemplateLoading] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [activityLogProject, setActivityLogProject] = useState<string | null>(null);
  const [sparklineData, setSparklineData] = useState<Record<string, number[]>>({});
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('induform_access_token');
      const includeArchived = filter === 'archived';
      const response = await fetch(`/api/projects/?include_archived=${includeArchived}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }

      const data = await response.json();
      setProjects(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Fetch sparkline data for all projects (compliance score trend over last 30 days)
  useEffect(() => {
    if (projects.length === 0) return;
    const token = localStorage.getItem('induform_access_token');
    const headers = { 'Authorization': `Bearer ${token}` };

    // Fetch analytics for each project (limited to first 20 to avoid too many requests)
    const projectsToFetch = projects.filter(p => !p.is_archived).slice(0, 20);
    const fetchPromises = projectsToFetch.map(async (p) => {
      try {
        const res = await fetch(`/api/projects/${p.id}/analytics?days=30`, { headers });
        if (!res.ok) return { id: p.id, data: [] as number[] };
        const data = await res.json();
        const scores = (data as Array<{ compliance_score: number }>).map(
          (d: { compliance_score: number }) => d.compliance_score
        );
        return { id: p.id, data: scores };
      } catch {
        return { id: p.id, data: [] as number[] };
      }
    });

    Promise.all(fetchPromises).then((results) => {
      const sparklines: Record<string, number[]> = {};
      for (const r of results) {
        if (r.data.length >= 2) {
          sparklines[r.id] = r.data;
        }
      }
      setSparklineData(sparklines);
    });
  }, [projects]);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      const token = localStorage.getItem('induform_access_token');
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete project');
      }

      toast.success('Project deleted');
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete project');
    }
  }, [fetchProjects, toast]);

  const handleRenameProject = useCallback(async (projectId: string, newName: string) => {
    try {
      const token = localStorage.getItem('induform_access_token');
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newName }),
      });

      if (!response.ok) {
        throw new Error('Failed to rename project');
      }

      toast.success('Project renamed');
      setRenameProject(null);
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename project');
    }
  }, [fetchProjects, toast]);

  const handleDuplicateProject = useCallback(async (projectId: string) => {
    try {
      const token = localStorage.getItem('induform_access_token');
      const response = await fetch(`/api/projects/${projectId}/duplicate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to duplicate project');
      }

      toast.success('Project duplicated');
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to duplicate project');
    }
  }, [fetchProjects, toast]);

  const handleExportProject = useCallback(async (projectId: string, projectName: string) => {
    try {
      const token = localStorage.getItem('induform_access_token');
      const response = await fetch(`/api/projects/${projectId}/export/yaml`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to export project');
      }

      const data = await response.json();

      // Create a blob and download
      const blob = new Blob([data.yaml], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || `${projectName.toLowerCase().replace(/\s+/g, '_')}.yaml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Project exported');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export project');
    }
  }, [toast]);

  const handleSaveAsTemplate = useCallback(async (projectId: string, templateName: string, description: string, category: string, isPublic: boolean) => {
    try {
      setSaveTemplateLoading(true);
      const token = localStorage.getItem('induform_access_token');
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          name: templateName,
          description: description || null,
          category: category || null,
          is_public: isPublic,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to save template' }));
        throw new Error(error.detail || 'Failed to save template');
      }

      toast.success('Template saved');
      setSaveTemplateProject(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save as template');
    } finally {
      setSaveTemplateLoading(false);
    }
  }, [toast]);

  const handleArchiveProject = useCallback(async (projectId: string) => {
    try {
      const token = localStorage.getItem('induform_access_token');
      const response = await fetch(`/api/projects/${projectId}/archive`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to archive project');
      toast.success('Project archived');
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to archive project');
    }
  }, [fetchProjects, toast]);

  const handleRestoreProject = useCallback(async (projectId: string) => {
    try {
      const token = localStorage.getItem('induform_access_token');
      const response = await fetch(`/api/projects/${projectId}/restore`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to restore project');
      toast.success('Project restored');
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore project');
    }
  }, [fetchProjects, toast]);

  const handleBulkOperation = useCallback(async (operation: 'archive' | 'restore' | 'delete') => {
    if (selectedProjects.size === 0) return;

    const confirmed = operation === 'delete'
      ? confirm(`Delete ${selectedProjects.size} project(s)? This cannot be undone.`)
      : true;

    if (!confirmed) return;

    try {
      setBulkLoading(true);
      const token = localStorage.getItem('induform_access_token');
      const response = await fetch('/api/projects/bulk', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_ids: Array.from(selectedProjects),
          operation,
        }),
      });

      if (!response.ok) throw new Error('Bulk operation failed');

      const result = await response.json();
      if (result.failed?.length > 0) {
        toast.warning(`${result.success.length} succeeded, ${result.failed.length} failed`);
      } else {
        const opName = operation === 'archive' ? 'archived' : operation === 'restore' ? 'restored' : 'deleted';
        toast.success(`${result.success.length} project(s) ${opName}`);
      }

      setSelectedProjects(new Set());
      fetchProjects();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk operation failed');
    } finally {
      setBulkLoading(false);
    }
  }, [selectedProjects, fetchProjects, toast]);

  const filteredProjects = useMemo(() => projects.filter(p => {
    // Archived filter
    if (filter === 'archived') {
      if (!p.is_archived) return false;
    } else {
      if (p.is_archived) return false;
    }

    // Ownership filter
    if (filter === 'owned' && p.permission !== 'owner') return false;
    if (filter === 'shared' && p.permission === 'owner') return false;

    // Search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = p.name.toLowerCase().includes(query);
      const matchesDesc = p.description?.toLowerCase().includes(query);
      if (!matchesName && !matchesDesc) return false;
    }

    // Risk level filter
    if (riskFilter.length > 0 && p.risk_level) {
      if (!riskFilter.includes(p.risk_level)) return false;
    }

    // Compliance filter
    if (complianceFilter !== 'all' && p.compliance_score !== undefined) {
      if (complianceFilter === 'high' && p.compliance_score < 90) return false;
      if (complianceFilter === 'medium' && (p.compliance_score < 70 || p.compliance_score >= 90)) return false;
      if (complianceFilter === 'low' && p.compliance_score >= 70) return false;
    }

    return true;
  }), [projects, filter, searchQuery, riskFilter, complianceFilter]);

  const toggleSelectProject = useCallback((projectId: string) => {
    setSelectedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    const visibleIds = filteredProjects.map(p => p.id);
    setSelectedProjects(new Set(visibleIds));
  }, [filteredProjects]);

  const clearSelection = useCallback(() => {
    setSelectedProjects(new Set());
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };

    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openMenuId]);


  const getPermissionBadge = (permission: string) => {
    switch (permission) {
      case 'owner':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">Owner</span>;
      case 'editor':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">Editor</span>;
      case 'viewer':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300">Viewer</span>;
      default:
        return null;
    }
  };

  const getRiskBadge = (riskLevel?: string, riskScore?: number) => {
    if (!riskLevel) return null;

    const config = {
      critical: { bg: 'bg-red-100 dark:bg-red-900/60', text: 'text-red-700 dark:text-red-300', label: 'Critical' },
      high: { bg: 'bg-orange-100 dark:bg-orange-900/60', text: 'text-orange-700 dark:text-orange-300', label: 'High' },
      medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/60', text: 'text-yellow-700 dark:text-yellow-300', label: 'Medium' },
      low: { bg: 'bg-blue-100 dark:bg-blue-900/60', text: 'text-blue-700 dark:text-blue-300', label: 'Low' },
      minimal: { bg: 'bg-green-100 dark:bg-green-900/60', text: 'text-green-700 dark:text-green-300', label: 'Minimal' },
    }[riskLevel] || { bg: 'bg-gray-200 dark:bg-slate-700', text: 'text-gray-600 dark:text-slate-300', label: 'Unknown' };

    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${config.bg} ${config.text}`} title={`Risk: ${config.label}`}>
        {config.label}{riskScore !== undefined ? ` (${riskScore})` : ''}
      </span>
    );
  };

  const getComplianceBadge = (score?: number, projectId?: string) => {
    if (score === undefined || score === null) return null;

    let config;
    if (score >= 90) {
      config = { bg: 'bg-green-100 dark:bg-green-900/60', text: 'text-green-700 dark:text-green-300', icon: '\u2713', color: '#22c55e' };
    } else if (score >= 70) {
      config = { bg: 'bg-yellow-100 dark:bg-yellow-900/60', text: 'text-yellow-700 dark:text-yellow-300', icon: '!', color: '#eab308' };
    } else if (score >= 50) {
      config = { bg: 'bg-orange-100 dark:bg-orange-900/60', text: 'text-orange-700 dark:text-orange-300', icon: '!!', color: '#f97316' };
    } else {
      config = { bg: 'bg-red-100 dark:bg-red-900/60', text: 'text-red-700 dark:text-red-300', icon: '\u2717', color: '#ef4444' };
    }

    const sparkData = projectId ? sparklineData[projectId] : undefined;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${config.bg} ${config.text}`} title={`Compliance: ${score}%`}>
        {config.icon} {score}%
        {sparkData && sparkData.length >= 2 && (
          <Sparkline data={sparkData} width={40} height={14} color={config.color} />
        )}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Calculate overall statistics
  const activeProjects = projects.filter(p => !p.is_archived);
  const archivedProjects = projects.filter(p => p.is_archived);
  const stats = {
    totalProjects: activeProjects.length,
    ownedProjects: activeProjects.filter(p => p.permission === 'owner').length,
    sharedProjects: activeProjects.filter(p => p.permission !== 'owner').length,
    archivedProjects: archivedProjects.length,
    totalZones: activeProjects.reduce((sum, p) => sum + p.zone_count, 0),
    totalConduits: activeProjects.reduce((sum, p) => sum + p.conduit_count, 0),
    totalAssets: activeProjects.reduce((sum, p) => sum + (p.asset_count || 0), 0),
    avgCompliance: activeProjects.filter(p => p.compliance_score !== undefined).length > 0
      ? Math.round(activeProjects.filter(p => p.compliance_score !== undefined)
          .reduce((sum, p) => sum + (p.compliance_score || 0), 0) /
          activeProjects.filter(p => p.compliance_score !== undefined).length)
      : null,
  };

  // Calculate risk overview
  const riskStats = {
    critical: projects.filter(p => p.risk_level === 'critical').length,
    high: projects.filter(p => p.risk_level === 'high').length,
    medium: projects.filter(p => p.risk_level === 'medium').length,
    low: projects.filter(p => p.risk_level === 'low').length,
    minimal: projects.filter(p => p.risk_level === 'minimal').length,
  };
  const projectsWithRisk = projects.filter(p => p.risk_level).length;
  const hasRiskData = projectsWithRisk > 0;

  return (
    <div className="min-h-screen relative bg-gray-50 dark:bg-slate-900">
      <NetworkBackground />
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-slate-700/50 relative z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <img src="/favicon.svg" alt="InduForm" className="w-8 h-8" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white hidden sm:block">InduForm</h1>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              {onOpenTemplates && (
                <button
                  onClick={onOpenTemplates}
                  className="px-2 sm:px-3 py-1.5 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-lg flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                  </svg>
                  <span className="hidden sm:inline">Templates</span>
                </button>
              )}
              <NotificationBell />

              <UserMenu
                onOpenTeamManagement={onOpenTeamManagement}
                onOpenProfileSettings={() => setShowSettings(true)}
                onOpenAdmin={onOpenAdmin}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalProjects}</div>
            <div className="text-sm text-gray-500 dark:text-slate-400">Projects</div>
          </div>
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
            <div className="text-2xl font-bold text-purple-400">{stats.ownedProjects}</div>
            <div className="text-sm text-gray-500 dark:text-slate-400">Owned</div>
          </div>
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
            <div className="text-2xl font-bold text-cyan-400">{stats.totalZones}</div>
            <div className="text-sm text-gray-500 dark:text-slate-400">Zones</div>
          </div>
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
            <div className="text-2xl font-bold text-blue-400">{stats.totalConduits}</div>
            <div className="text-sm text-gray-500 dark:text-slate-400">Conduits</div>
          </div>
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
            <div className="text-2xl font-bold text-amber-400">{stats.totalAssets}</div>
            <div className="text-sm text-gray-500 dark:text-slate-400">Assets</div>
          </div>
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
            <div className="flex items-center gap-2">
              <div className={`text-2xl font-bold ${
                stats.avgCompliance === null ? 'text-gray-400 dark:text-slate-500' :
                stats.avgCompliance >= 90 ? 'text-green-400' :
                stats.avgCompliance >= 70 ? 'text-yellow-400' :
                stats.avgCompliance >= 50 ? 'text-orange-400' : 'text-red-400'
              }`}>
                {stats.avgCompliance !== null ? `${stats.avgCompliance}%` : '-'}
              </div>
              {/* Show aggregated compliance sparkline */}
              {(() => {
                const allSparklines = Object.values(sparklineData).filter(s => s.length >= 2);
                if (allSparklines.length === 0) return null;
                // Average compliance scores across all projects at each time index
                const maxLen = Math.max(...allSparklines.map(s => s.length));
                const avgScores: number[] = [];
                for (let i = 0; i < maxLen; i++) {
                  let sum = 0;
                  let count = 0;
                  for (const s of allSparklines) {
                    const idx = Math.floor((i / maxLen) * s.length);
                    if (idx < s.length) {
                      sum += s[idx];
                      count++;
                    }
                  }
                  if (count > 0) avgScores.push(sum / count);
                }
                if (avgScores.length < 2) return null;
                const sparkColor = stats.avgCompliance !== null && stats.avgCompliance >= 90 ? '#22c55e' :
                  stats.avgCompliance !== null && stats.avgCompliance >= 70 ? '#eab308' :
                  stats.avgCompliance !== null && stats.avgCompliance >= 50 ? '#f97316' : '#ef4444';
                return <Sparkline data={avgScores} width={50} height={20} color={sparkColor} />;
              })()}
            </div>
            <div className="text-sm text-gray-500 dark:text-slate-400">Avg Compliance</div>
          </div>
        </div>

        {/* Risk Overview */}
        {hasRiskData && (
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50 mb-8">
            <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300 mb-3">Risk Overview</h3>
            <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
              {riskStats.critical > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-sm text-gray-700 dark:text-slate-200">{riskStats.critical} Critical</span>
                </div>
              )}
              {riskStats.high > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span className="text-sm text-gray-700 dark:text-slate-200">{riskStats.high} High</span>
                </div>
              )}
              {riskStats.medium > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span className="text-sm text-gray-700 dark:text-slate-200">{riskStats.medium} Medium</span>
                </div>
              )}
              {riskStats.low > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-sm text-gray-700 dark:text-slate-200">{riskStats.low} Low</span>
                </div>
              )}
              {riskStats.minimal > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm text-gray-700 dark:text-slate-200">{riskStats.minimal} Minimal</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Projects Section */}
        <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-slate-700/50">
          <div className="p-4 border-b border-gray-200 dark:border-slate-700/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-4 flex-wrap">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Projects</h2>

                {/* Filter tabs */}
                <div className="flex gap-1 bg-gray-100 dark:bg-slate-700/50 rounded-lg p-1 overflow-x-auto">
                  <button
                    onClick={() => setFilter('all')}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      filter === 'all'
                        ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    All ({projects.length})
                  </button>
                  <button
                    onClick={() => setFilter('owned')}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      filter === 'owned'
                        ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Owned ({stats.ownedProjects})
                  </button>
                  <button
                    onClick={() => setFilter('shared')}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      filter === 'shared'
                        ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Shared ({stats.sharedProjects})
                  </button>
                  <button
                    onClick={() => setFilter('archived')}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      filter === 'archived'
                        ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    Archived ({stats.archivedProjects})
                  </button>
                </div>
              </div>

              <button
                onClick={onCreateProject}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Project
              </button>
            </div>

            {/* Search and Filters */}
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-slate-700/50 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Global search button */}
              {onOpenGlobalSearch && (
                <button
                  onClick={onOpenGlobalSearch}
                  className="px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors bg-gray-100 dark:bg-slate-700/50 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700"
                  title="Search all projects (Ctrl+K)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span className="hidden sm:inline">Search All</span>
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 bg-gray-200 dark:bg-slate-600 border border-gray-300 dark:border-slate-500 rounded text-xs text-gray-500 dark:text-slate-400">
                    Ctrl+K
                  </kbd>
                </button>
              )}

              {/* Filter toggle */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                  showFilters || riskFilter.length > 0 || complianceFilter !== 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-slate-700/50 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filters
                {(riskFilter.length > 0 || complianceFilter !== 'all') && (
                  <span className="px-1.5 py-0.5 bg-white/20 rounded text-xs">
                    {riskFilter.length + (complianceFilter !== 'all' ? 1 : 0)}
                  </span>
                )}
              </button>

              {/* Results count */}
              {(searchQuery || riskFilter.length > 0 || complianceFilter !== 'all') && (
                <span className="text-sm text-gray-500 dark:text-slate-400">
                  {filteredProjects.length} of {projects.length} projects
                </span>
              )}
            </div>

            {/* Bulk Selection Toolbar */}
            {selectedProjects.size > 0 && (
              <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700/50 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-blue-700 dark:text-blue-200">
                    {selectedProjects.size} project{selectedProjects.size !== 1 ? 's' : ''} selected
                  </span>
                  <button
                    onClick={selectAllVisible}
                    className="text-xs text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100"
                  >
                    Select all ({filteredProjects.length})
                  </button>
                  <button
                    onClick={clearSelection}
                    className="text-xs text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100"
                  >
                    Clear selection
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {filter !== 'archived' ? (
                    <button
                      onClick={() => handleBulkOperation('archive')}
                      disabled={bulkLoading}
                      className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded hover:bg-gray-300 dark:hover:bg-slate-600 disabled:opacity-50 flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                      Archive
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBulkOperation('restore')}
                      disabled={bulkLoading}
                      className="px-3 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-600 disabled:opacity-50 flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Restore
                    </button>
                  )}
                  <button
                    onClick={() => handleBulkOperation('delete')}
                    disabled={bulkLoading}
                    className="px-3 py-1.5 text-sm bg-red-700 text-white rounded hover:bg-red-600 disabled:opacity-50 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            )}

            {/* Expanded Filters */}
            {showFilters && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg flex flex-wrap gap-4">
                {/* Risk Level Filter */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-2">Risk Level</label>
                  <div className="flex gap-2">
                    {['critical', 'high', 'medium', 'low', 'minimal'].map((level) => (
                      <button
                        key={level}
                        onClick={() => {
                          setRiskFilter(prev =>
                            prev.includes(level)
                              ? prev.filter(r => r !== level)
                              : [...prev, level]
                          );
                        }}
                        className={`px-2 py-1 text-xs rounded-full capitalize transition-colors ${
                          riskFilter.includes(level)
                            ? level === 'critical' ? 'bg-red-600 text-white' :
                              level === 'high' ? 'bg-orange-600 text-white' :
                              level === 'medium' ? 'bg-yellow-600 text-white' :
                              level === 'low' ? 'bg-blue-600 text-white' :
                              'bg-green-600 text-white'
                            : 'bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-300 dark:hover:bg-slate-500'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compliance Filter */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-slate-400 mb-2">Compliance</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'all', label: 'All' },
                      { value: 'high', label: '90%+' },
                      { value: 'medium', label: '70-89%' },
                      { value: 'low', label: '<70%' },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setComplianceFilter(value as typeof complianceFilter)}
                        className={`px-2 py-1 text-xs rounded-full transition-colors ${
                          complianceFilter === value
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-300 dark:hover:bg-slate-500'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clear Filters */}
                {(riskFilter.length > 0 || complianceFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setRiskFilter([]);
                      setComplianceFilter('all');
                    }}
                    className="self-end px-3 py-1 text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Loading state */}
          {loading && (
            <div className="p-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
              <div className="text-gray-500 dark:text-slate-400">Loading projects...</div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="p-8 text-center">
              <div className="text-red-500 dark:text-red-400 mb-2">{error}</div>
              <button
                onClick={fetchProjects}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-300 dark:hover:bg-slate-600"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && filteredProjects.length === 0 && (
            <div className="p-8 text-center">
              <div className="text-4xl mb-2">📁</div>
              <div className="text-gray-600 dark:text-slate-300 mb-1">
                {filter === 'all' ? 'No projects yet' : `No ${filter} projects`}
              </div>
              <div className="text-sm text-gray-500 dark:text-slate-400 mb-4">
                {filter === 'all' ? 'Create your first project to get started' : 'Try a different filter'}
              </div>
              {filter === 'all' && (
                <button
                  onClick={onCreateProject}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  Create Project
                </button>
              )}
            </div>
          )}

          {/* Projects list */}
          {!loading && !error && filteredProjects.length > 0 && (
            <div className="divide-y divide-gray-200 dark:divide-slate-700/50 max-h-[60vh] overflow-y-auto">
              {filteredProjects.map(project => (
                <div
                  key={project.id}
                  className={`p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors ${
                    selectedProjects.has(project.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Selection checkbox */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectProject(project.id);
                        }}
                        className="pt-0.5"
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${
                          selectedProjects.has(project.id)
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-gray-300 dark:border-slate-500 hover:border-gray-400 dark:hover:border-slate-400'
                        }`}>
                          {selectedProjects.has(project.id) && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0" onClick={() => onOpenProject(project.id)}>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-base font-medium text-gray-800 dark:text-slate-100 truncate">
                          {project.name}
                        </h3>
                        {getPermissionBadge(project.permission)}
                        {getRiskBadge(project.risk_level, project.risk_score)}
                        {getComplianceBadge(project.compliance_score, project.id)}
                      </div>

                      {project.description && (
                        <p className="text-sm text-gray-500 dark:text-slate-400 line-clamp-1 mb-2">
                          {project.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-slate-500 flex-wrap">
                        <span title="Zones">{project.zone_count} zones</span>
                        <span title="Conduits">{project.conduit_count} conduits</span>
                        <span title="Assets">{project.asset_count} assets</span>
                        {project.zone_types && Object.keys(project.zone_types).length > 0 && (
                          <span className="text-gray-500 dark:text-slate-400" title="Zone types">
                            ({Object.entries(project.zone_types).map(([type, count]) =>
                              `${count} ${type}`
                            ).join(', ')})
                          </span>
                        )}
                        <span>Updated {formatDate(project.updated_at)}</span>
                        {project.permission !== 'owner' && (
                          <span>Owner: {project.owner_username}</span>
                        )}
                        {project.is_archived && (
                          <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-slate-300 rounded text-xs">Archived</span>
                        )}
                      </div>
                      </div>
                    </div>

                    <div className="ml-4 flex items-center gap-2">
                      {/* Three-dot menu */}
                      <div className="relative" ref={openMenuId === project.id ? menuRef : undefined}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === project.id ? null : project.id);
                          }}
                          className="p-1.5 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-600/50 rounded"
                          title="Project options"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="5" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>

                        {openMenuId === project.id && (
                          <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-600 py-1 z-[200]">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                                setRenameProject({ id: project.id, name: project.name });
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Rename
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                                handleDuplicateProject(project.id);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Duplicate
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                                handleExportProject(project.id, project.name);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Export YAML
                            </button>
                            {(project.permission === 'owner' || project.permission === 'editor') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(null);
                                  setSaveTemplateProject({ id: project.id, name: project.name });
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                                </svg>
                                Save as Template
                              </button>
                            )}
                            {(project.permission === 'owner' || project.permission === 'editor') && onShareProject && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(null);
                                  onShareProject(project.id, project.name);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                </svg>
                                Share
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(null);
                                setActivityLogProject(project.id);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Activity Log
                            </button>
                            <div className="border-t border-gray-200 dark:border-slate-600 my-1"></div>
                            {(project.permission === 'owner' || project.permission === 'editor') && !project.is_archived && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(null);
                                  handleArchiveProject(project.id);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                </svg>
                                Archive
                              </button>
                            )}
                            {(project.permission === 'owner' || project.permission === 'editor') && project.is_archived && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(null);
                                  handleRestoreProject(project.id);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Restore
                              </button>
                            )}
                            {(project.permission === 'owner' || project.permission === 'editor') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(null);
                                  if (confirm(`Delete project "${project.name}"? This cannot be undone.`)) {
                                    handleDeleteProject(project.id);
                                  }
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <svg className="w-5 h-5 text-gray-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Rename Dialog */}
      {renameProject && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md mx-4 border border-gray-200 dark:border-slate-700">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">Rename Project</h2>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const newName = formData.get('name') as string;
                if (newName?.trim()) {
                  handleRenameProject(renameProject.id, newName.trim());
                }
              }}
              className="p-4"
            >
              <input
                type="text"
                name="name"
                defaultValue={renameProject.name}
                autoFocus
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-slate-400"
                placeholder="Project name"
              />
              <div className="flex justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setRenameProject(null)}
                  className="px-4 py-2 text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Rename
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Settings Dialog */}
      {showSettings && (
        <UserSettingsDialog onClose={() => setShowSettings(false)} />
      )}

      {/* Activity Log Panel */}
      {activityLogProject && (
        <ActivityLogPanel
          projectId={activityLogProject}
          onClose={() => setActivityLogProject(null)}
        />
      )}

      {/* Save as Template Dialog */}
      {saveTemplateProject && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md mx-4 border border-gray-200 dark:border-slate-700">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">Save as Template</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                Save "{saveTemplateProject.name}" as a reusable template
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const name = formData.get('name') as string;
                const description = formData.get('description') as string;
                const category = formData.get('category') as string;
                const isPublic = formData.get('isPublic') === 'on';
                if (name?.trim()) {
                  handleSaveAsTemplate(saveTemplateProject.id, name.trim(), description, category, isPublic);
                }
              }}
              className="p-4 space-y-4"
            >
              <div>
                <label className="block text-sm text-gray-600 dark:text-slate-300 mb-1">Template Name</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={`${saveTemplateProject.name} Template`}
                  autoFocus
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-slate-400"
                  placeholder="Template name"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-slate-300 mb-1">Description</label>
                <textarea
                  name="description"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-slate-400 resize-none"
                  placeholder="Template description (optional)"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-slate-300 mb-1">Category</label>
                <select
                  name="category"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">None</option>
                  <option value="manufacturing">Manufacturing</option>
                  <option value="utility">Utility / Energy</option>
                  <option value="reference">Reference Architecture</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="isPublic"
                  id="isPublic"
                  className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="isPublic" className="text-sm text-gray-600 dark:text-slate-300">
                  Make template public (visible to all users)
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSaveTemplateProject(null)}
                  disabled={saveTemplateLoading}
                  className="px-4 py-2 text-gray-700 dark:text-slate-200 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveTemplateLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {saveTemplateLoading && (
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                  )}
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
