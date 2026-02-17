import { useState, useEffect, useCallback, memo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { api } from '../api/client';
import type { AdminProject, AdminActivity, AdminHealth, AdminSession, AdminLoginAttempt, AdminUser } from '../api/client';
import NetworkBackground from '../components/NetworkBackground';
import UserMenu from '../components/UserMenu';
import NotificationBell from '../components/NotificationBell';

interface AdminStats {
  total_users: number;
  active_users: number;
  total_projects: number;
  total_zones: number;
  total_assets: number;
  total_conduits: number;
}

interface AdminPageProps {
  onBackToProjects: () => void;
}

type TabId = 'dashboard' | 'system' | 'users' | 'projects' | 'activity';

const PAGE_SIZE = 25;

// --- Risk badge helper ---
function RiskBadge({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-xs text-gray-400 dark:text-slate-500">-</span>;
  }
  let color = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  if (score >= 80) color = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  else if (score >= 60) color = 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
  else if (score >= 40) color = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  else if (score >= 20) color = 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {score.toFixed(0)}
    </span>
  );
}

// --- Date formatter ---
function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const AdminPage = memo(({ onBackToProjects }: AdminPageProps) => {
  const { user } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  // --- Users state ---
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userPage, setUserPage] = useState(0);
  const [usersHasMore, setUsersHasMore] = useState(true);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // --- Projects state ---
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState('');
  const [projectPage, setProjectPage] = useState(0);
  const [projectsHasMore, setProjectsHasMore] = useState(true);
  const [transferringProject, setTransferringProject] = useState<string | null>(null);
  const [transferTargetId, setTransferTargetId] = useState('');

  // --- Activity state ---
  const [activities, setActivities] = useState<AdminActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPage, setActivityPage] = useState(0);
  const [activityHasMore, setActivityHasMore] = useState(true);
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [activityUserFilter, setActivityUserFilter] = useState('');
  const [exportingCsv, setExportingCsv] = useState(false);

  // --- System tab state ---
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loginHistory, setLoginHistory] = useState<AdminLoginAttempt[]>([]);
  const [systemLoading, setSystemLoading] = useState(false);

  // --- Fetch functions ---
  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('induform_access_token');
      const response = await fetch('/api/admin/stats', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch {
      // Stats are non-critical
    }
  }, []);

  const fetchUsers = useCallback(async (skip = 0) => {
    try {
      setUsersLoading(true);
      const data = await api.adminListUsers({ skip, limit: PAGE_SIZE });
      if (skip === 0) {
        setUsers(data);
      } else {
        setUsers(prev => [...prev, ...data]);
      }
      setUsersHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, [toast]);

  const fetchProjects = useCallback(async (skip = 0, search = '') => {
    try {
      setProjectsLoading(true);
      const data = await api.adminListProjects({ skip, limit: PAGE_SIZE, search });
      if (skip === 0) {
        setProjects(data);
      } else {
        setProjects(prev => [...prev, ...data]);
      }
      setProjectsHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setProjectsLoading(false);
    }
  }, [toast]);

  const fetchActivity = useCallback(async (skip = 0, userId = '') => {
    try {
      setActivityLoading(true);
      const options: { skip: number; limit: number; user_id?: string } = { skip, limit: PAGE_SIZE };
      if (userId) options.user_id = userId;
      const data = await api.adminListActivity(options);
      if (skip === 0) {
        setActivities(data);
      } else {
        setActivities(prev => [...prev, ...data]);
      }
      setActivityHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load activity');
    } finally {
      setActivityLoading(false);
    }
  }, [toast]);

  const fetchSystemData = useCallback(async () => {
    try {
      setSystemLoading(true);
      const [healthData, sessionsData, historyData] = await Promise.all([
        api.adminGetHealth(),
        api.adminListSessions(),
        api.adminListLoginHistory({ limit: 100 }),
      ]);
      setHealth(healthData);
      setSessions(sessionsData);
      setLoginHistory(historyData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load system data');
    } finally {
      setSystemLoading(false);
    }
  }, [toast]);

  // --- Initial load ---
  useEffect(() => {
    fetchUsers(0);
    fetchStats();
  }, [fetchUsers, fetchStats]);

  // --- Load tab data on switch ---
  useEffect(() => {
    if (activeTab === 'projects' && projects.length === 0) {
      fetchProjects(0);
    } else if (activeTab === 'activity') {
      if (activities.length === 0 || activityUserFilter) {
        fetchActivity(0, activityUserFilter);
      }
    } else if (activeTab === 'system') {
      fetchSystemData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Reload activity when user filter changes
  useEffect(() => {
    if (activeTab === 'activity') {
      setActivityPage(0);
      fetchActivity(0, activityUserFilter);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityUserFilter]);

  // --- User actions ---
  const handleUpdateUser = useCallback(async (userId: string, updates: { is_active?: boolean; is_admin?: boolean }) => {
    setUpdatingUser(userId);
    try {
      const token = localStorage.getItem('induform_access_token');
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update user');
      }

      const updatedUser: AdminUser = await response.json();
      setUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));
      toast.success(`User ${updatedUser.username} updated`);
      fetchStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setUpdatingUser(null);
    }
  }, [toast, fetchStats]);

  // --- Bulk user actions ---
  const handleBulkUpdate = useCallback(async (updates: { is_active?: boolean; is_admin?: boolean }) => {
    if (selectedUsers.size === 0) return;
    setBulkUpdating(true);
    try {
      const result = await api.adminBulkUpdateUsers(Array.from(selectedUsers), updates);
      toast.success(`Updated ${result.updated_count} users`);
      setSelectedUsers(new Set());
      fetchUsers(0);
      fetchStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bulk update failed');
    } finally {
      setBulkUpdating(false);
    }
  }, [selectedUsers, toast, fetchUsers, fetchStats]);

  const toggleUserSelection = useCallback((userId: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedUsers.size === filteredUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(filteredUsers.filter(u => u.id !== user?.id).map(u => u.id)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUsers.size, user?.id]);

  // --- Drilldown: username click -> activity tab filtered ---
  const handleUserDrilldown = useCallback((userId: string) => {
    setActivityUserFilter(userId);
    setActiveTab('activity');
  }, []);

  // --- Project actions ---
  const handleArchiveProject = useCallback(async (projectId: string, archive: boolean) => {
    try {
      const updated = await api.adminArchiveProject(projectId, archive);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      toast.success(`Project ${archive ? 'archived' : 'unarchived'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update project');
    }
  }, [toast]);

  const handleDeleteProject = useCallback(async (projectId: string, name: string) => {
    if (!window.confirm(`Permanently delete project "${name}"? This cannot be undone.`)) return;
    try {
      await api.adminDeleteProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
      toast.success(`Project "${name}" deleted`);
      fetchStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete project');
    }
  }, [toast, fetchStats]);

  const handleTransferProject = useCallback(async (projectId: string) => {
    if (!transferTargetId) return;
    try {
      const updated = await api.adminTransferProject(projectId, transferTargetId);
      setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
      toast.success(`Project transferred to ${updated.owner_username}`);
      setTransferringProject(null);
      setTransferTargetId('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Transfer failed');
    }
  }, [transferTargetId, toast]);

  // --- Force logout ---
  const handleForceLogout = useCallback(async (userId: string, username: string) => {
    if (!window.confirm(`Force logout user "${username}"? All their active sessions will be invalidated.`)) return;
    try {
      await api.adminForceLogout(userId);
      toast.success(`User "${username}" has been logged out`);
      fetchSystemData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Force logout failed');
    }
  }, [toast, fetchSystemData]);

  // --- CSV export ---
  const handleExportCsv = useCallback(async () => {
    setExportingCsv(true);
    try {
      const blob = await api.adminExportActivityCSV();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'activity_log.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Activity log exported');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingCsv(false);
    }
  }, [toast]);

  // --- Project search ---
  useEffect(() => {
    if (activeTab !== 'projects') return;
    const timer = setTimeout(() => {
      setProjectPage(0);
      fetchProjects(0, projectSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [projectSearchQuery, activeTab, fetchProjects]);

  // --- Filtered users (client-side) ---
  const filteredUsers = userSearchQuery
    ? users.filter(u => {
        const q = userSearchQuery.toLowerCase();
        return u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      })
    : users;

  // --- Filtered activity (client-side) ---
  const filteredActivities = activitySearchQuery
    ? activities.filter(a => {
        const q = activitySearchQuery.toLowerCase();
        return (
          a.username.toLowerCase().includes(q) ||
          a.action.toLowerCase().includes(q) ||
          (a.entity_name || '').toLowerCase().includes(q) ||
          (a.project_name || '').toLowerCase().includes(q)
        );
      })
    : activities;

  // --- 403 gate ---
  if (!user?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="text-6xl mb-4">403</div>
          <div className="text-gray-600 dark:text-slate-300 mb-4">Admin access required</div>
          <button
            onClick={onBackToProjects}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'system', label: 'System' },
    { id: 'users', label: 'Users' },
    { id: 'projects', label: 'Projects' },
    { id: 'activity', label: 'Activity' },
  ];

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
              <span className="text-sm text-gray-500 dark:text-slate-400 hidden sm:block">/ Admin</span>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={onBackToProjects}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-lg flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span className="hidden sm:inline">Projects</span>
              </button>

              <NotificationBell />

              <UserMenu
                onOpenAdmin={() => {}}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Tab navigation */}
        <div className="flex gap-1 mb-6 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-slate-700/50 p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dashboard tab */}
        {activeTab === 'dashboard' && (
          <>
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_users}</div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">Total Users</div>
                </div>
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
                  <div className="text-2xl font-bold text-green-500">{stats.active_users}</div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">Active Users</div>
                </div>
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
                  <div className="text-2xl font-bold text-blue-500">{stats.total_projects}</div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">Projects</div>
                </div>
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
                  <div className="text-2xl font-bold text-cyan-400">{stats.total_zones}</div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">Zones</div>
                </div>
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
                  <div className="text-2xl font-bold text-amber-400">{stats.total_assets}</div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">Assets</div>
                </div>
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
                  <div className="text-2xl font-bold text-purple-400">{stats.total_conduits}</div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">Conduits</div>
                </div>
              </div>
            )}

            {/* Recent activity feed */}
            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-slate-700/50">
              <div className="p-4 border-b border-gray-200 dark:border-slate-700/50">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Activity</h2>
              </div>
              {activities.length === 0 && !activityLoading ? (
                <div className="p-4 text-sm text-gray-500 dark:text-slate-400">
                  No recent activity
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-slate-700/50 max-h-96 overflow-y-auto">
                  {activities.slice(0, 20).map(a => (
                    <div key={a.id} className="px-4 py-3 flex items-start gap-3 text-sm">
                      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0 mt-0.5">
                        {a.username.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-800 dark:text-slate-100">{a.username}</span>
                        {' '}
                        <span className="text-gray-500 dark:text-slate-400">{a.action}</span>
                        {a.entity_name && (
                          <span className="text-gray-700 dark:text-slate-300">{' '}{a.entity_type} &quot;{a.entity_name}&quot;</span>
                        )}
                        {a.project_name && (
                          <span className="text-gray-400 dark:text-slate-500"> in {a.project_name}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">
                        {formatDateTime(a.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* System tab */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            {systemLoading && !health ? (
              <LoadingSpinner text="Loading system data..." />
            ) : (
              <>
                {/* Health cards */}
                {health && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
                      <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">Database</div>
                      <div className={`text-lg font-bold ${health.db_status === 'ok' ? 'text-green-500' : 'text-red-500'}`}>
                        {health.db_status === 'ok' ? 'Connected' : 'Error'}
                      </div>
                    </div>
                    <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
                      <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">Uptime</div>
                      <div className="text-lg font-bold text-gray-900 dark:text-white">{formatUptime(health.uptime_seconds)}</div>
                    </div>
                    {Object.entries(health.table_counts).map(([table, count]) => (
                      <div key={table} className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-slate-700/50">
                        <div className="text-sm text-gray-500 dark:text-slate-400 mb-1 capitalize">{table.replace('_', ' ')}</div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white">{count.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Active sessions */}
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-slate-700/50">
                  <div className="p-4 border-b border-gray-200 dark:border-slate-700/50">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Active Sessions</h2>
                  </div>
                  {sessions.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500 dark:text-slate-400">No active sessions</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-slate-700/50">
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">User</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">Last Login</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700/50">
                          {sessions.map(s => (
                            <tr key={s.user_id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                                    {(s.display_name || s.username).slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-gray-800 dark:text-slate-100">{s.username}</div>
                                    {s.display_name && <div className="text-xs text-gray-400 dark:text-slate-500">{s.display_name}</div>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400 hidden sm:table-cell">
                                {s.last_login_at ? formatDateTime(s.last_login_at) : 'Never'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  s.is_active
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'
                                }`}>
                                  {s.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => handleForceLogout(s.user_id, s.username)}
                                  disabled={s.user_id === user?.id}
                                  className="px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Force logout"
                                >
                                  Force Logout
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Login history */}
                <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-slate-700/50">
                  <div className="p-4 border-b border-gray-200 dark:border-slate-700/50">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Login History</h2>
                  </div>
                  {loginHistory.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500 dark:text-slate-400">No login history</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-slate-700/50">
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Username</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">IP Address</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Result</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Reason</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700/50">
                          {loginHistory.map(attempt => (
                            <tr key={attempt.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                              <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-slate-100">{attempt.username_attempted}</td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400 hidden sm:table-cell font-mono">{attempt.ip_address || '-'}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  attempt.success
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                }`}>
                                  {attempt.success ? 'Success' : 'Failed'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400 hidden md:table-cell">
                                {attempt.failure_reason ? attempt.failure_reason.replace('_', ' ') : '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{formatDateTime(attempt.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Users tab */}
        {activeTab === 'users' && (
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-slate-700/50">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">User Management</h2>
                <SearchInput value={userSearchQuery} onChange={setUserSearchQuery} placeholder="Search users..." />
              </div>
              {/* Bulk action toolbar */}
              {selectedUsers.size > 0 && (
                <div className="mt-3 flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800/50">
                  <span className="text-sm text-blue-700 dark:text-blue-300 mr-2">{selectedUsers.size} selected</span>
                  <button
                    onClick={() => handleBulkUpdate({ is_active: true })}
                    disabled={bulkUpdating}
                    className="px-2 py-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50"
                  >
                    Activate
                  </button>
                  <button
                    onClick={() => handleBulkUpdate({ is_active: false })}
                    disabled={bulkUpdating}
                    className="px-2 py-1 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                  >
                    Deactivate
                  </button>
                  <button
                    onClick={() => handleBulkUpdate({ is_admin: true })}
                    disabled={bulkUpdating}
                    className="px-2 py-1 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50"
                  >
                    Make Admin
                  </button>
                  <button
                    onClick={() => handleBulkUpdate({ is_admin: false })}
                    disabled={bulkUpdating}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300 rounded hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50"
                  >
                    Remove Admin
                  </button>
                  <button
                    onClick={() => setSelectedUsers(new Set())}
                    className="px-2 py-1 text-xs text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 ml-auto"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {usersLoading && users.length === 0 ? (
              <LoadingSpinner text="Loading users..." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700/50">
                      <th className="px-4 py-3 text-center w-10">
                        <input
                          type="checkbox"
                          checked={selectedUsers.size > 0 && selectedUsers.size === filteredUsers.filter(u => u.id !== user?.id).length}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                          aria-label="Select all users"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Username</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Display Name</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Active</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Admin</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">Projects</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700/50">
                    {filteredUsers.map(u => {
                      const isSelf = u.id === user?.id;
                      const isUpdating = updatingUser === u.id;
                      const isSelected = selectedUsers.has(u.id);

                      return (
                        <tr
                          key={u.id}
                          className={`hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors ${
                            isSelf ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                          } ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                        >
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={isSelf}
                              onChange={() => toggleUserSelection(u.id)}
                              className="rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                              aria-label={`Select ${u.username}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                                {(u.display_name || u.username).slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <button
                                  onClick={() => handleUserDrilldown(u.id)}
                                  className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                  title="View user activity"
                                >
                                  {u.username}
                                </button>
                                {isSelf && (
                                  <span className="ml-1 text-xs text-blue-600 dark:text-blue-400">(you)</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300">{u.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300 hidden md:table-cell">
                            {u.display_name || '-'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ToggleSwitch
                              checked={u.is_active}
                              disabled={isUpdating || isSelf}
                              color="green"
                              ariaLabel={`Toggle active status for ${u.username}`}
                              onChange={() => handleUpdateUser(u.id, { is_active: !u.is_active })}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ToggleSwitch
                              checked={u.is_admin}
                              disabled={isUpdating || isSelf}
                              color="purple"
                              ariaLabel={`Toggle admin status for ${u.username}`}
                              onChange={() => handleUpdateUser(u.id, { is_admin: !u.is_admin })}
                            />
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-slate-300 hidden sm:table-cell">
                            {u.project_count}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400 hidden lg:table-cell">
                            {formatDate(u.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {filteredUsers.length === 0 && !usersLoading && (
                  <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                    {userSearchQuery ? 'No users match your search' : 'No users found'}
                  </div>
                )}

                {usersHasMore && !userSearchQuery && (
                  <div className="p-4 text-center border-t border-gray-200 dark:border-slate-700/50">
                    <button
                      onClick={() => {
                        const nextPage = userPage + 1;
                        setUserPage(nextPage);
                        fetchUsers(nextPage * PAGE_SIZE);
                      }}
                      disabled={usersLoading}
                      className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg disabled:opacity-50"
                    >
                      {usersLoading ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Projects tab */}
        {activeTab === 'projects' && (
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-slate-700/50">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">All Projects</h2>
                <SearchInput value={projectSearchQuery} onChange={setProjectSearchQuery} placeholder="Search projects..." />
              </div>
            </div>

            {projectsLoading && projects.length === 0 ? (
              <LoadingSpinner text="Loading projects..." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700/50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Owner</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">Zones</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">Assets</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">Conduits</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Risk</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">Updated</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700/50">
                    {projects.map(p => (
                      <tr
                        key={p.id}
                        className={`hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors ${
                          p.is_archived ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-800 dark:text-slate-100">
                            {p.name}
                            {p.is_archived && (
                              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">Archived</span>
                            )}
                          </div>
                          {p.description && (
                            <div className="text-xs text-gray-400 dark:text-slate-500 truncate max-w-xs">{p.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300 hidden md:table-cell">{p.owner_username}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-slate-300 hidden sm:table-cell">{p.zone_count}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-slate-300 hidden sm:table-cell">{p.asset_count}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-slate-300 hidden lg:table-cell">{p.conduit_count}</td>
                        <td className="px-4 py-3 text-center"><RiskBadge score={p.risk_score} /></td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400 hidden lg:table-cell">{formatDate(p.updated_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {transferringProject === p.id ? (
                              <div className="flex items-center gap-1">
                                <select
                                  value={transferTargetId}
                                  onChange={(e) => setTransferTargetId(e.target.value)}
                                  className="text-xs border border-gray-300 dark:border-slate-600 rounded px-1 py-1 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-200"
                                >
                                  <option value="">Select user...</option>
                                  {users.filter(u => u.id !== p.owner_id && u.is_active).map(u => (
                                    <option key={u.id} value={u.id}>{u.username}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleTransferProject(p.id)}
                                  disabled={!transferTargetId}
                                  className="px-2 py-1 text-xs text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded disabled:opacity-40"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => { setTransferringProject(null); setTransferTargetId(''); }}
                                  className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  onClick={() => setTransferringProject(p.id)}
                                  className="px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                                  title="Transfer ownership"
                                >
                                  Transfer
                                </button>
                                <button
                                  onClick={() => handleArchiveProject(p.id, !p.is_archived)}
                                  className="px-2 py-1 text-xs text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
                                  title={p.is_archived ? 'Unarchive' : 'Archive'}
                                >
                                  {p.is_archived ? 'Unarchive' : 'Archive'}
                                </button>
                                <button
                                  onClick={() => handleDeleteProject(p.id, p.name)}
                                  className="px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                  title="Delete"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {projects.length === 0 && !projectsLoading && (
                  <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                    {projectSearchQuery ? 'No projects match your search' : 'No projects found'}
                  </div>
                )}

                {projectsHasMore && !projectSearchQuery && (
                  <div className="p-4 text-center border-t border-gray-200 dark:border-slate-700/50">
                    <button
                      onClick={() => {
                        const nextPage = projectPage + 1;
                        setProjectPage(nextPage);
                        fetchProjects(nextPage * PAGE_SIZE, projectSearchQuery);
                      }}
                      disabled={projectsLoading}
                      className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg disabled:opacity-50"
                    >
                      {projectsLoading ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Activity tab */}
        {activeTab === 'activity' && (
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-slate-700/50">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Activity Log</h2>
                  {activityUserFilter && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      Filtered by user
                      <button
                        onClick={() => setActivityUserFilter('')}
                        className="ml-1 hover:text-blue-900 dark:hover:text-blue-200"
                        aria-label="Clear user filter"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportCsv}
                    disabled={exportingCsv}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {exportingCsv ? 'Exporting...' : 'Export CSV'}
                  </button>
                  <SearchInput value={activitySearchQuery} onChange={setActivitySearchQuery} placeholder="Search activity..." />
                </div>
              </div>
            </div>

            {activityLoading && activities.length === 0 ? (
              <LoadingSpinner text="Loading activity..." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700/50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Entity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">Project</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700/50">
                    {filteredActivities.map(a => (
                      <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                              {a.username.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-gray-800 dark:text-slate-100">{a.username}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300">
                            {a.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300 hidden md:table-cell">
                          {a.entity_type && (
                            <span>
                              <span className="text-gray-400 dark:text-slate-500">{a.entity_type}:</span> {a.entity_name || a.entity_id || '-'}
                            </span>
                          )}
                          {!a.entity_type && '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300 hidden sm:table-cell">{a.project_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">{formatDateTime(a.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {filteredActivities.length === 0 && !activityLoading && (
                  <div className="p-8 text-center text-gray-500 dark:text-slate-400">
                    {activitySearchQuery ? 'No activity matches your search' : 'No activity found'}
                  </div>
                )}

                {activityHasMore && !activitySearchQuery && (
                  <div className="p-4 text-center border-t border-gray-200 dark:border-slate-700/50">
                    <button
                      onClick={() => {
                        const nextPage = activityPage + 1;
                        setActivityPage(nextPage);
                        fetchActivity(nextPage * PAGE_SIZE, activityUserFilter);
                      }}
                      disabled={activityLoading}
                      className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg disabled:opacity-50"
                    >
                      {activityLoading ? 'Loading...' : 'Load More'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
});

AdminPage.displayName = 'AdminPage';

// --- Shared sub-components ---

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative max-w-md w-full sm:w-auto">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-slate-700/50 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function LoadingSpinner({ text }: { text: string }) {
  return (
    <div className="p-8 text-center">
      <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
      <div className="text-gray-500 dark:text-slate-400">{text}</div>
    </div>
  );
}

function ToggleSwitch({ checked, disabled, color, ariaLabel, onChange }: {
  checked: boolean;
  disabled: boolean;
  color: 'green' | 'purple';
  ariaLabel: string;
  onChange: () => void;
}) {
  const activeColor = color === 'green' ? 'bg-green-500' : 'bg-purple-500';
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        checked ? activeColor : 'bg-gray-300 dark:bg-slate-600'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      aria-label={ariaLabel}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default AdminPage;
