import { useState, useEffect, useCallback } from 'react';

interface Viewer {
  user_id: string;
  username: string;
  display_name: string | null;
  last_seen: string;
}

interface CollaboratorIndicatorProps {
  projectId: string;
}

export default function CollaboratorIndicator({ projectId }: CollaboratorIndicatorProps) {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [showList, setShowList] = useState(false);

  const sendHeartbeat = useCallback(async () => {
    try {
      const token = localStorage.getItem('induform_access_token');
      await fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ project_id: projectId }),
      });
    } catch {
      // Heartbeat failures are expected during transient network issues
    }
  }, [projectId]);

  const fetchPresence = useCallback(async () => {
    try {
      const token = localStorage.getItem('induform_access_token');
      const response = await fetch(`/api/presence/${projectId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setViewers(data.viewers);
      }
    } catch {
      // Presence fetch failures are non-critical
    }
  }, [projectId]);

  const leaveProject = useCallback(async () => {
    try {
      const token = localStorage.getItem('induform_access_token');
      await fetch('/api/presence/leave', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ project_id: projectId }),
      });
    } catch (err) {
      // Ignore errors on leave
    }
  }, [projectId]);

  useEffect(() => {
    // Send initial heartbeat
    sendHeartbeat();
    fetchPresence();

    // Set up intervals for heartbeat and fetching presence
    const heartbeatInterval = setInterval(sendHeartbeat, 30000);
    const presenceInterval = setInterval(fetchPresence, 15000);

    // Leave on unmount
    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(presenceInterval);
      leaveProject();
    };
  }, [sendHeartbeat, fetchPresence, leaveProject]);

  if (viewers.length === 0) {
    return null;
  }

  const getInitial = (viewer: Viewer) => {
    return (viewer.display_name?.[0] || viewer.username[0]).toUpperCase();
  };

  const getColor = (index: number) => {
    const colors = [
      'bg-green-500',
      'bg-purple-500',
      'bg-orange-500',
      'bg-pink-500',
      'bg-cyan-500',
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowList(!showList)}
        className="flex items-center gap-1 px-2 py-1 bg-slate-700/50 rounded-lg hover:bg-slate-700"
      >
        <div className="flex -space-x-2">
          {viewers.slice(0, 3).map((viewer, index) => (
            <div
              key={viewer.user_id}
              className={`w-6 h-6 rounded-full ${getColor(index)} flex items-center justify-center text-xs text-white font-medium border-2 border-slate-800`}
              title={viewer.display_name || viewer.username}
            >
              {getInitial(viewer)}
            </div>
          ))}
          {viewers.length > 3 && (
            <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-xs text-white font-medium border-2 border-slate-800">
              +{viewers.length - 3}
            </div>
          )}
        </div>
        <span className="text-xs text-slate-300 ml-1">
          {viewers.length === 1 ? '1 other viewer' : `${viewers.length} others viewing`}
        </span>
      </button>

      {showList && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-2 z-50">
          <div className="px-3 py-1 text-xs text-slate-400 uppercase tracking-wide">
            Currently Viewing
          </div>
          {viewers.map((viewer, index) => (
            <div key={viewer.user_id} className="px-3 py-2 flex items-center gap-2 hover:bg-slate-700/50">
              <div className={`w-8 h-8 rounded-full ${getColor(index)} flex items-center justify-center text-sm text-white font-medium`}>
                {getInitial(viewer)}
              </div>
              <div>
                <div className="text-sm text-slate-200">
                  {viewer.display_name || viewer.username}
                </div>
                <div className="text-xs text-slate-400">@{viewer.username}</div>
              </div>
              <div className="ml-auto w-2 h-2 rounded-full bg-green-500" title="Online"></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
