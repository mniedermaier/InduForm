import { useState, useEffect, useCallback } from 'react';
import { api, VersionSummary, VersionDiff } from '../api/client';

interface VersionHistoryPanelProps {
  projectId: string;
  onClose: () => void;
  onRestore: (versionId: string) => void;
}

export default function VersionHistoryPanel({
  projectId,
  onClose,
  onRestore,
}: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [compareVersion, setCompareVersion] = useState<string | null>(null);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [newVersionDescription, setNewVersionDescription] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listVersions(projectId);
      setVersions(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load versions');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleCompare = useCallback(async () => {
    if (!selectedVersion || !compareVersion) return;
    try {
      setDiffLoading(true);
      const diffResult = await api.compareVersions(projectId, selectedVersion, compareVersion);
      setDiff(diffResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compare versions');
    } finally {
      setDiffLoading(false);
    }
  }, [projectId, selectedVersion, compareVersion]);

  useEffect(() => {
    if (selectedVersion && compareVersion) {
      handleCompare();
    } else {
      setDiff(null);
    }
  }, [selectedVersion, compareVersion, handleCompare]);

  const handleRestore = async (versionId: string) => {
    if (!confirm('Restore project to this version? Current state will be saved as a backup.')) {
      return;
    }

    try {
      setRestoring(true);
      await api.restoreVersion(projectId, versionId);
      onRestore(versionId);
      fetchVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore version');
    } finally {
      setRestoring(false);
    }
  };

  const handleCreateVersion = async () => {
    try {
      setCreatingVersion(true);
      await api.createVersion(projectId, newVersionDescription || undefined);
      setNewVersionDescription('');
      setShowCreateForm(false);
      fetchVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create version');
    } finally {
      setCreatingVersion(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-slate-800 shadow-xl border-l border-slate-700 z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-lg font-semibold text-white">Version History</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white rounded"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Create Version Button */}
      <div className="p-4 border-b border-slate-700">
        {showCreateForm ? (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Version description (optional)"
              value={newVersionDescription}
              onChange={(e) => setNewVersionDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateVersion}
                disabled={creatingVersion}
                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
              >
                {creatingVersion && (
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                )}
                Save Version
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewVersionDescription('');
                }}
                className="px-3 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Snapshot
          </button>
        )}
      </div>

      {/* Version List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
            <div className="text-slate-400 text-sm">Loading versions...</div>
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <div className="text-red-400 text-sm mb-2">{error}</div>
            <button
              onClick={fetchVersions}
              className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg hover:bg-slate-600 text-sm"
            >
              Retry
            </button>
          </div>
        ) : versions.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-2">📝</div>
            <div className="text-slate-300 mb-1">No versions yet</div>
            <div className="text-sm text-slate-400">
              Create a snapshot to save the current project state
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {versions.map((version) => (
              <div
                key={version.id}
                className={`p-4 hover:bg-slate-700/50 cursor-pointer transition-colors ${
                  selectedVersion === version.id ? 'bg-blue-900/30 border-l-2 border-blue-500' : ''
                } ${compareVersion === version.id ? 'bg-purple-900/30 border-l-2 border-purple-500' : ''}`}
                onClick={() => {
                  if (selectedVersion === version.id) {
                    setSelectedVersion(null);
                  } else if (compareVersion === version.id) {
                    setCompareVersion(null);
                  } else if (selectedVersion && !compareVersion) {
                    setCompareVersion(version.id);
                  } else {
                    setSelectedVersion(version.id);
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white">
                        Version {version.version_number}
                      </span>
                      {selectedVersion === version.id && (
                        <span className="px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded">
                          Selected
                        </span>
                      )}
                      {compareVersion === version.id && (
                        <span className="px-1.5 py-0.5 text-xs bg-purple-600 text-white rounded">
                          Compare
                        </span>
                      )}
                    </div>
                    {version.description && (
                      <p className="text-sm text-slate-300 mb-1">{version.description}</p>
                    )}
                    <div className="text-xs text-slate-400">
                      {formatDate(version.created_at)}
                      {version.created_by_username && (
                        <span> by {version.created_by_username}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRestore(version.id);
                    }}
                    disabled={restoring}
                    className="px-2 py-1 text-xs bg-slate-600 text-slate-200 rounded hover:bg-slate-500 disabled:opacity-50"
                    title="Restore to this version"
                  >
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Diff Panel */}
      {diff && (
        <div className="border-t border-slate-700 p-4 bg-slate-850 max-h-64 overflow-y-auto">
          <h3 className="text-sm font-medium text-white mb-3">Changes</h3>
          {diffLoading ? (
            <div className="text-center py-4">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              {/* Zones */}
              {(diff.summary.zones_added > 0 || diff.summary.zones_removed > 0 || diff.summary.zones_modified > 0) && (
                <div>
                  <div className="text-slate-400 mb-1">Zones</div>
                  <div className="space-y-1">
                    {diff.zones.added.map((z) => (
                      <div key={z.id} className="text-green-400">+ {z.name}</div>
                    ))}
                    {diff.zones.removed.map((z) => (
                      <div key={z.id} className="text-red-400">- {z.name}</div>
                    ))}
                    {diff.zones.modified.map((z) => (
                      <div key={z.id}>
                        <div className="text-yellow-400">~ {z.name}</div>
                        {z.changes && Object.entries(z.changes).map(([field, change]) => (
                          <div key={field} className="text-slate-400 ml-4">
                            {field}: <span className="text-red-400">{String(change.from)}</span>
                            {' → '}
                            <span className="text-green-400">{String(change.to)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assets */}
              {(diff.summary.assets_added > 0 || diff.summary.assets_removed > 0 || diff.summary.assets_modified > 0) && (
                <div>
                  <div className="text-slate-400 mb-1">Assets</div>
                  <div className="space-y-1">
                    {diff.assets.added.map((a) => (
                      <div key={`${a.zone_id}:${a.id}`} className="text-green-400">+ {a.name}</div>
                    ))}
                    {diff.assets.removed.map((a) => (
                      <div key={`${a.zone_id}:${a.id}`} className="text-red-400">- {a.name}</div>
                    ))}
                    {diff.assets.modified.map((a) => (
                      <div key={`${a.zone_id}:${a.id}`}>
                        <div className="text-yellow-400">~ {a.name}</div>
                        {a.changes && Object.entries(a.changes).map(([field, change]) => (
                          <div key={field} className="text-slate-400 ml-4">
                            {field}: <span className="text-red-400">{String(change.from)}</span>
                            {' → '}
                            <span className="text-green-400">{String(change.to)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conduits */}
              {(diff.summary.conduits_added > 0 || diff.summary.conduits_removed > 0 || diff.summary.conduits_modified > 0) && (
                <div>
                  <div className="text-slate-400 mb-1">Conduits</div>
                  <div className="space-y-1">
                    {diff.conduits.added.map((c) => (
                      <div key={c.id} className="text-green-400">+ {c.from_zone} → {c.to_zone}</div>
                    ))}
                    {diff.conduits.removed.map((c) => (
                      <div key={c.id} className="text-red-400">- {c.from_zone} → {c.to_zone}</div>
                    ))}
                    {diff.conduits.modified.map((c) => (
                      <div key={c.id}>
                        <div className="text-yellow-400">~ {c.id}</div>
                        {c.changes && Object.entries(c.changes).map(([field, change]) => (
                          <div key={field} className="text-slate-400 ml-4">
                            {field}: <span className="text-red-400">{String(change.from)}</span>
                            {' → '}
                            <span className="text-green-400">{String(change.to)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No changes */}
              {diff.summary.zones_added === 0 &&
                diff.summary.zones_removed === 0 &&
                diff.summary.zones_modified === 0 &&
                diff.summary.assets_added === 0 &&
                diff.summary.assets_removed === 0 &&
                diff.summary.assets_modified === 0 &&
                diff.summary.conduits_added === 0 &&
                diff.summary.conduits_removed === 0 &&
                diff.summary.conduits_modified === 0 && (
                  <div className="text-slate-400">No differences found</div>
                )}
            </div>
          )}
        </div>
      )}

      {/* Help text */}
      {selectedVersion && !compareVersion && (
        <div className="p-3 bg-slate-900 border-t border-slate-700 text-xs text-slate-400 text-center">
          Click another version to compare
        </div>
      )}
    </div>
  );
}
