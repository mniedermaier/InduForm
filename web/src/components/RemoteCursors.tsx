import { memo } from 'react';
import type { RemoteCursor } from '../hooks/useWebSocket';
import { getUserColor } from './PresenceIndicator';

interface RemoteCursorsProps {
  cursors: Record<string, RemoteCursor>;
}

const RemoteCursors = memo(({ cursors }: RemoteCursorsProps) => {
  const cursorList = Object.values(cursors);

  if (cursorList.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
      {cursorList.map((cursor) => (
        <div
          key={cursor.user_id}
          className="absolute transition-all duration-100 ease-out"
          style={{
            left: cursor.x,
            top: cursor.y,
            transform: 'translate(-2px, -2px)',
          }}
        >
          {/* Cursor arrow */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill={getUserColor(cursor.user_id)}
            style={{
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
            }}
          >
            <path d="M0 0L16 6L8 8L6 16L0 0Z" />
          </svg>

          {/* Username label */}
          <div
            className="absolute top-4 left-3 px-1.5 py-0.5 rounded text-xs font-medium text-white whitespace-nowrap"
            style={{
              backgroundColor: getUserColor(cursor.user_id),
              boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
            }}
          >
            {cursor.username}
          </div>
        </div>
      ))}
    </div>
  );
});

RemoteCursors.displayName = 'RemoteCursors';

export default RemoteCursors;
