import { useState, useEffect, useCallback } from 'react';
import DialogShell from './DialogShell';

interface AccessGrant {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_username: string | null;
  team_id: string | null;
  team_name: string | null;
  permission: string;
  granted_at: string;
}

interface User {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
}

interface Team {
  id: string;
  name: string;
}

interface ShareProjectDialogProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export default function ShareProjectDialog({ projectId, projectName, onClose }: ShareProjectDialogProps) {
  const [accessList, setAccessList] = useState<AccessGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New share form
  const [shareType, setShareType] = useState<'user' | 'team'>('user');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<(User | Team)[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<User | Team | null>(null);
  const [permission, setPermission] = useState<'editor' | 'viewer'>('viewer');
  const [sharing, setSharing] = useState(false);

  const [allUsers, setAllUsers] = useState<User[]>([]);

  const getToken = () => localStorage.getItem('induform_access_token');

  // Load current access list and all users when dialog opens
  const loadAccess = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/projects/${projectId}/access`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (response.ok) {
        const data = await response.json();
        setAccessList(data);
      }
    } catch (err) {
      setError('Failed to load access list');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadAllUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/users/', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAllUsers(data);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }, []);

  useEffect(() => {
    loadAccess();
    loadAllUsers();
  }, [loadAccess, loadAllUsers]);

  // Search users or teams — filter locally from pre-fetched list for users,
  // or call API for teams. Show all users when query is empty.
  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (shareType === 'user') {
      // Filter from the pre-fetched user list, excluding those who already have access
      const existingUserIds = new Set(accessList.map(a => a.user_id).filter(Boolean));
      const filtered = allUsers.filter(u => {
        if (existingUserIds.has(u.id)) return false;
        if (!query) return true;
        const q = query.toLowerCase();
        return u.username.toLowerCase().includes(q)
          || u.email.toLowerCase().includes(q)
          || (u.display_name?.toLowerCase().includes(q) ?? false);
      });
      setSearchResults(filtered);
      return;
    }

    // Team search via API
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const response = await fetch(`/api/teams/?search=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
      }
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  // Grant access
  const handleShare = async () => {
    if (!selectedEntity) return;

    try {
      setSharing(true);
      setError(null);

      const body = shareType === 'user'
        ? { user_id: selectedEntity.id, permission }
        : { team_id: selectedEntity.id, permission };

      const response = await fetch(`/api/projects/${projectId}/access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Failed to share');
      }

      // Reset form and reload
      setSelectedEntity(null);
      setSearchQuery('');
      setSearchResults([]);
      await loadAccess();
      await loadAllUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setSharing(false);
    }
  };

  // Revoke access
  const handleRevoke = async (accessId: string) => {
    if (!confirm('Are you sure you want to revoke this access?')) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/access/${accessId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (response.ok) {
        await loadAccess();
      }
    } catch (err) {
      setError('Failed to revoke access');
    }
  };

  return (
    <DialogShell title={`Share "${projectName}"`} onClose={onClose} maxWidth="max-w-lg">
        <div className="max-h-[calc(80vh-4rem)] flex flex-col">
        <div className="px-4 pb-2 -mt-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Invite users or teams to collaborate on this project
          </p>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Share form */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => { setShareType('user'); setSelectedEntity(null); setSearchResults([]); }}
                className={`px-3 py-1.5 text-sm rounded-lg ${
                  shareType === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
                }`}
              >
                User
              </button>
              <button
                onClick={() => { setShareType('team'); setSelectedEntity(null); setSearchResults([]); }}
                className={`px-3 py-1.5 text-sm rounded-lg ${
                  shareType === 'team'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200'
                }`}
              >
                Team
              </button>
            </div>

            {!selectedEntity ? (
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onFocus={() => { if (shareType === 'user') handleSearch(searchQuery); }}
                  placeholder={shareType === 'user' ? 'Search by email or username...' : 'Search teams...'}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                />

                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto z-10">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => {
                          setSelectedEntity(result);
                          setSearchResults([]);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        {'email' in result ? (
                          <div>
                            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                              {result.display_name || result.username}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{result.email}</div>
                          </div>
                        ) : (
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                            {result.name}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <div>
                  {'email' in selectedEntity ? (
                    <div>
                      <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                        {selectedEntity.display_name || selectedEntity.username}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{selectedEntity.email}</div>
                    </div>
                  ) : (
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {selectedEntity.name}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedEntity(null)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 mt-3">
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as 'editor' | 'viewer')}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              >
                <option value="viewer">Viewer - Can view only</option>
                <option value="editor">Editor - Can edit</option>
              </select>

              <button
                onClick={handleShare}
                disabled={!selectedEntity || sharing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {sharing ? 'Sharing...' : 'Share'}
              </button>
            </div>
          </div>

          {/* Current access list */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              People with access
            </h3>

            {loading ? (
              <div className="text-center py-4 text-gray-500">Loading...</div>
            ) : accessList.length === 0 ? (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                Only you have access to this project
              </div>
            ) : (
              <div className="space-y-2">
                {accessList.map((access) => (
                  <div
                    key={access.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-sm font-medium text-gray-600 dark:text-gray-300">
                        {access.user_id ? (
                          (access.user_username?.[0] || '?').toUpperCase()
                        ) : (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                          {access.user_id ? (access.user_username || access.user_email) : access.team_name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {access.user_id ? 'User' : 'Team'} • {access.permission}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRevoke(access.id)}
                      className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Done
          </button>
        </div>
        </div>
    </DialogShell>
  );
}
