import { useState, useEffect, useCallback } from 'react';

interface ActivityEntry {
  id: string;
  user_id: string;
  username: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface ActivityLogPanelProps {
  projectId: string;
  onClose: () => void;
}

const ACTION_ICONS: Record<string, string> = {
  created: '✨',
  updated: '📝',
  deleted: '🗑️',
  archived: '📦',
  restored: '📂',
  shared: '🔗',
  commented: '💬',
  zone_added: '➕',
  zone_updated: '📝',
  zone_deleted: '🗑️',
  asset_added: '➕',
  asset_updated: '📝',
  asset_deleted: '🗑️',
  conduit_added: '➕',
  conduit_updated: '📝',
  conduit_deleted: '🗑️',
};

const ACTION_LABELS: Record<string, string> = {
  created: 'created the project',
  updated: 'updated',
  deleted: 'deleted',
  archived: 'archived the project',
  restored: 'restored the project',
  shared: 'shared the project',
  commented: 'commented on',
  zone_added: 'added zone',
  zone_updated: 'updated zone',
  zone_deleted: 'deleted zone',
  asset_added: 'added asset',
  asset_updated: 'updated asset',
  asset_deleted: 'deleted asset',
  conduit_added: 'added conduit',
  conduit_updated: 'updated conduit',
  conduit_deleted: 'deleted conduit',
};

export default function ActivityLogPanel({ projectId, onClose }: ActivityLogPanelProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchActivities = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('induform_access_token');
      const response = await fetch(
        `/api/projects/${projectId}/activity/?page=${page}&page_size=${pageSize}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
        }
      );
      if (response.ok) {
        const data = await response.json();
        setActivities(data.items);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, page]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col border border-gray-200 dark:border-slate-700">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">Activity Log</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  const token = localStorage.getItem('induform_access_token');
                  const response = await fetch(
                    `/api/projects/${projectId}/activity/export`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                  );
                  if (response.ok) {
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `activity_${projectId}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }
                } catch (err) {
                  console.error('Failed to export activity:', err);
                }
              }}
              className="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
              title="Export as CSV"
            >
              Export CSV
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-slate-400">
              <div className="text-3xl mb-2">📋</div>
              <div>No activity recorded yet</div>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map(activity => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg"
                >
                  <span className="text-xl flex-shrink-0">
                    {ACTION_ICONS[activity.action] || '📌'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-700 dark:text-slate-200">
                      <span className="font-medium">{activity.username || 'Unknown user'}</span>
                      {' '}
                      <span className="text-gray-500 dark:text-slate-400">
                        {ACTION_LABELS[activity.action] || activity.action}
                      </span>
                      {activity.entity_name && (
                        <span className="text-gray-700 dark:text-slate-200 font-medium"> {activity.entity_name}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                      {formatTime(activity.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 rounded hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500 dark:text-slate-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 rounded hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
