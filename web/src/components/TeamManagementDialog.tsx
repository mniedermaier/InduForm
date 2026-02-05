import { memo, useState, useEffect, useCallback } from 'react';
import DialogShell from './DialogShell';

interface TeamMember {
  user_id: string;
  username: string;
  email: string;
  display_name: string | null;
  role: string;
  joined_at: string;
}

interface Team {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  member_count?: number;
  your_role?: string;
  members?: TeamMember[];
}

interface TeamManagementDialogProps {
  onClose: () => void;
}

const API_BASE = '/api';

async function fetchWithAuth<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('induform_access_token');
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

const TeamManagementDialog = memo(({ onClose }: TeamManagementDialogProps) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create team form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [creating, setCreating] = useState(false);

  // Add member form
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberId, setNewMemberId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'member' | 'admin'>('member');
  const [adding, setAdding] = useState(false);

  // Load teams
  useEffect(() => {
    const loadTeams = async () => {
      try {
        setLoading(true);
        const data = await fetchWithAuth<Team[]>('/teams/');
        setTeams(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load teams');
      } finally {
        setLoading(false);
      }
    };

    loadTeams();
  }, []);

  // Load team details
  const loadTeamDetails = useCallback(async (teamId: string) => {
    try {
      const team = await fetchWithAuth<Team>(`/teams/${teamId}`);
      setSelectedTeam(team);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    }
  }, []);

  // Create team
  const handleCreateTeam = useCallback(async () => {
    if (!newTeamName.trim()) {
      setError('Team name is required');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const team = await fetchWithAuth<Team>('/teams/', {
        method: 'POST',
        body: JSON.stringify({
          name: newTeamName.trim(),
          description: newTeamDescription.trim() || null,
        }),
      });

      setTeams((prev) => [...prev, team]);
      setNewTeamName('');
      setNewTeamDescription('');
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setCreating(false);
    }
  }, [newTeamName, newTeamDescription]);

  // Delete team
  const handleDeleteTeam = useCallback(async (teamId: string) => {
    if (!confirm('Are you sure you want to delete this team?')) return;

    try {
      await fetchWithAuth(`/teams/${teamId}`, { method: 'DELETE' });
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
      if (selectedTeam?.id === teamId) {
        setSelectedTeam(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team');
    }
  }, [selectedTeam]);

  // Add member
  const handleAddMember = useCallback(async () => {
    if (!selectedTeam || !newMemberId.trim()) {
      setError('Please enter a user ID');
      return;
    }

    try {
      setAdding(true);
      setError(null);

      const member = await fetchWithAuth<TeamMember>(`/teams/${selectedTeam.id}/members`, {
        method: 'POST',
        body: JSON.stringify({
          user_id: newMemberId.trim(),
          role: newMemberRole,
        }),
      });

      setSelectedTeam((prev) =>
        prev ? { ...prev, members: [...(prev.members || []), member] } : null
      );
      setNewMemberId('');
      setShowAddMember(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAdding(false);
    }
  }, [selectedTeam, newMemberId, newMemberRole]);

  // Remove member
  const handleRemoveMember = useCallback(
    async (userId: string) => {
      if (!selectedTeam) return;
      if (!confirm('Are you sure you want to remove this member?')) return;

      try {
        await fetchWithAuth(`/teams/${selectedTeam.id}/members/${userId}`, {
          method: 'DELETE',
        });

        setSelectedTeam((prev) =>
          prev
            ? { ...prev, members: (prev.members || []).filter((m) => m.user_id !== userId) }
            : null
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove member');
      }
    },
    [selectedTeam]
  );

  return (
    <DialogShell title={selectedTeam ? selectedTeam.name : 'My Teams'} onClose={onClose} maxWidth="max-w-2xl">
        <div className="max-h-[calc(80vh-4rem)] flex flex-col">
        {selectedTeam && (
          <div className="px-4 pb-2 -mt-2">
            <button
              onClick={() => setSelectedTeam(null)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
            >
              Back to list
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
              {error}
              <button onClick={() => setError(null)} className="ml-2 underline">
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : selectedTeam ? (
            // Team detail view
            <div className="space-y-4">
              {selectedTeam.description && (
                <p className="text-gray-600 dark:text-gray-400">{selectedTeam.description}</p>
              )}

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Members ({selectedTeam.members?.length || 0})
                </h3>
                {(selectedTeam.your_role === 'owner' || selectedTeam.your_role === 'admin') && (
                  <button
                    onClick={() => setShowAddMember(true)}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    + Add Member
                  </button>
                )}
              </div>

              {showAddMember && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded space-y-3">
                  <input
                    type="text"
                    value={newMemberId}
                    onChange={(e) => setNewMemberId(e.target.value)}
                    placeholder="Enter user ID"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                  />
                  <div className="flex gap-3">
                    <select
                      value={newMemberRole}
                      onChange={(e) => setNewMemberRole(e.target.value as 'member' | 'admin')}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={handleAddMember}
                      disabled={adding}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400"
                    >
                      {adding ? 'Adding...' : 'Add'}
                    </button>
                    <button
                      onClick={() => setShowAddMember(false)}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {(selectedTeam.members || []).map((member) => (
                  <div
                    key={member.user_id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded"
                  >
                    <div>
                      <div className="font-medium text-gray-800 dark:text-gray-100">
                        {member.display_name || member.username}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {member.email} - {member.role}
                      </div>
                    </div>
                    {selectedTeam.your_role === 'owner' && member.role !== 'owner' && (
                      <button
                        onClick={() => handleRemoveMember(member.user_id)}
                        className="text-red-600 dark:text-red-400 text-sm hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Teams list view
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 dark:text-gray-400">
                  {teams.length} team{teams.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  + Create Team
                </button>
              </div>

              {showCreateForm && (
                <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded space-y-3">
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="Team name"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    value={newTeamDescription}
                    onChange={(e) => setNewTeamDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={handleCreateTeam}
                      disabled={creating}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400"
                    >
                      {creating ? 'Creating...' : 'Create'}
                    </button>
                    <button
                      onClick={() => setShowCreateForm(false)}
                      className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {teams.length === 0 ? (
                <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                  You're not a member of any teams yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {teams.map((team) => (
                    <div
                      key={team.id}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                      onClick={() => loadTeamDetails(team.id)}
                    >
                      <div>
                        <div className="font-medium text-gray-800 dark:text-gray-100">
                          {team.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {team.member_count} member{team.member_count !== 1 ? 's' : ''} - Your
                          role: {team.your_role}
                        </div>
                      </div>
                      {team.your_role === 'owner' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTeam(team.id);
                          }}
                          className="text-red-600 dark:text-red-400 text-sm hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
    </DialogShell>
  );
});

TeamManagementDialog.displayName = 'TeamManagementDialog';

export default TeamManagementDialog;
