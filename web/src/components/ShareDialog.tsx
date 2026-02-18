import { memo, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import type { ProjectAccess, Team } from '../api/client';

interface ShareDialogProps {
  projectId: string;
  projectName: string;
  isOwner: boolean;
  onClose: () => void;
}

const ShareDialog = memo(({ projectId, projectName, isOwner, onClose }: ShareDialogProps) => {
  const [accessList, setAccessList] = useState<ProjectAccess[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New share form
  const [shareType, setShareType] = useState<'user' | 'team'>('user');
  const [userId, setUserId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [permission, setPermission] = useState<'viewer' | 'editor'>('viewer');
  const [sharing, setSharing] = useState(false);

  // Load access list and teams
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [access, userTeams] = await Promise.all([
          api.listProjectAccess(projectId),
          api.listTeams(),
        ]);
        setAccessList(access);
        setTeams(userTeams);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };

    if (isOwner) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [projectId, isOwner]);

  const handleShare = useCallback(async () => {
    if (shareType === 'user' && !userId.trim()) {
      setError('Please enter a user ID');
      return;
    }
    if (shareType === 'team' && !teamId) {
      setError('Please select a team');
      return;
    }

    try {
      setSharing(true);
      setError(null);

      const body: { user_id?: string; team_id?: string; permission: string } = { permission };
      if (shareType === 'user') {
        body.user_id = userId.trim();
      } else {
        body.team_id = teamId;
      }

      const newAccess = await api.grantAccess(projectId, body);

      setAccessList((prev) => [...prev, newAccess]);
      setUserId('');
      setTeamId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setSharing(false);
    }
  }, [projectId, shareType, userId, teamId, permission]);

  const handleRevoke = useCallback(
    async (accessId: string) => {
      if (!confirm('Are you sure you want to revoke this access?')) return;

      try {
        await api.revokeAccess(projectId, accessId);
        setAccessList((prev) => prev.filter((a) => a.id !== accessId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to revoke access');
      }
    },
    [projectId]
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Share "{projectName}"
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            &#10005;
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {!isOwner ? (
            <p className="text-gray-600 dark:text-gray-400">
              Only the project owner can manage sharing settings.
            </p>
          ) : loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : (
            <>
              {/* Share form */}
              <div className="space-y-3">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="shareType"
                      value="user"
                      checked={shareType === 'user'}
                      onChange={() => setShareType('user')}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-200">User</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="shareType"
                      value="team"
                      checked={shareType === 'team'}
                      onChange={() => setShareType('team')}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-200">Team</span>
                  </label>
                </div>

                {shareType === 'user' ? (
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="Enter user ID"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  />
                ) : (
                  <select
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  >
                    <option value="">Select a team...</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                )}

                <div className="flex gap-3 items-center">
                  <select
                    value={permission}
                    onChange={(e) => setPermission(e.target.value as 'viewer' | 'editor')}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                  >
                    <option value="viewer">Can View</option>
                    <option value="editor">Can Edit</option>
                  </select>

                  <button
                    onClick={handleShare}
                    disabled={sharing}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg"
                  >
                    {sharing ? 'Sharing...' : 'Share'}
                  </button>
                </div>
              </div>

              {/* Current access list */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  People with access
                </h3>

                {accessList.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No one else has access to this project yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {accessList.map((access) => (
                      <div
                        key={access.id}
                        className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded"
                      >
                        <div>
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                            {access.user_username || access.team_name || 'Unknown'}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {access.user_email ||
                              (access.team_id ? 'Team' : '')} - {access.permission}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRevoke(access.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});

ShareDialog.displayName = 'ShareDialog';

export default ShareDialog;
