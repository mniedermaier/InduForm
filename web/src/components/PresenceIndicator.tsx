import { memo } from 'react';
import type { PresenceUser } from '../hooks/useWebSocket';

interface PresenceIndicatorProps {
  viewers: PresenceUser[];
  isConnected: boolean;
}

function getUserColor(userId: string): string {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(username: string, displayName?: string | null): string {
  const name = displayName || username;
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const PresenceIndicator = memo(({ viewers, isConnected }: PresenceIndicatorProps) => {
  if (!isConnected || viewers.length === 0) return null;

  return (
    <div className="flex -space-x-1.5">
      {viewers.map((v) => (
        <div
          key={v.user_id}
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold border-2 border-slate-800 cursor-default"
          style={{ backgroundColor: getUserColor(v.user_id) }}
          title={v.display_name || v.username}
        >
          {getInitials(v.username, v.display_name)}
        </div>
      ))}
    </div>
  );
});

PresenceIndicator.displayName = 'PresenceIndicator';

export default PresenceIndicator;
// eslint-disable-next-line react-refresh/only-export-components -- intentional: utility functions used by other components alongside the default export
export { getUserColor, getInitials };
