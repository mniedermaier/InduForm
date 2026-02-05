import { useState, useEffect, useRef, useCallback } from 'react';

export interface PresenceUser {
  user_id: string;
  username: string;
  display_name?: string | null;
}

export interface CursorPosition {
  x: number;
  y: number;
}

export interface RemoteCursor extends CursorPosition {
  user_id: string;
  username: string;
}

export interface EditEvent {
  user_id: string;
  username: string;
  entity: string;
  action: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface SelectionEvent {
  user_id: string;
  username: string;
  entity_id: string | null;
}

interface WebSocketMessage {
  type: string;
  [key: string]: unknown;
}

export function useProjectWebSocket(projectId: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [cursors, setCursors] = useState<Record<string, RemoteCursor>>({});
  const [selections, setSelections] = useState<Record<string, string | null>>({});
  const [lastEdit, setLastEdit] = useState<EditEvent | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const messageQueueRef = useRef<string[]>([]);

  const connect = useCallback(() => {
    if (!projectId) return;

    const token = localStorage.getItem('induform_access_token');
    if (!token) return;

    // Construct WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/projects/${projectId}?token=${token}`;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttempts.current = 0;
        // Flush queued messages
        while (messageQueueRef.current.length > 0) {
          const msg = messageQueueRef.current.shift()!;
          ws.send(msg);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        socketRef.current = null;

        // If token expired (4001), try refreshing the token before reconnecting
        if (event.code === 4001) {
          fetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('induform_refresh_token') || token}`,
            },
          })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (data?.access_token) {
                localStorage.setItem('induform_access_token', data.access_token);
                reconnectAttempts.current = 0;
                connect();
              }
            })
            .catch(() => {});
          return;
        }

        // Reconnect unless intentionally closed
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          reconnectTimeoutRef.current = window.setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'presence':
              setPresence((message.viewers as PresenceUser[]) || []);
              break;

            case 'cursor':
              setCursors((prev) => ({
                ...prev,
                [message.user_id as string]: {
                  x: (message.position as CursorPosition)?.x || 0,
                  y: (message.position as CursorPosition)?.y || 0,
                  user_id: message.user_id as string,
                  username: message.username as string,
                },
              }));
              break;

            case 'selection':
              setSelections((prev) => ({
                ...prev,
                [message.user_id as string]: message.entity_id as string | null,
              }));
              break;

            case 'edit':
              setLastEdit({
                user_id: message.user_id as string,
                username: message.username as string,
                entity: message.entity as string,
                action: message.action as string,
                data: message.data as Record<string, unknown>,
                timestamp: message.timestamp as string,
              });
              break;

            case 'pong':
              // Heartbeat response, no action needed
              break;

            case 'error':
              console.error('WebSocket error:', message.message);
              break;
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      socketRef.current = ws;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  }, [projectId]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close(1000, 'Intentional disconnect');
      socketRef.current = null;
    }

    setIsConnected(false);
    setPresence([]);
    setCursors({});
    setSelections({});
  }, []);

  // Connect when projectId changes
  useEffect(() => {
    if (projectId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [projectId, connect, disconnect]);

  // Heartbeat to keep connection alive
  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({ type: 'ping', timestamp: Date.now() })
        );
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isConnected]);

  // Clear stale cursors
  useEffect(() => {
    const interval = setInterval(() => {
      setCursors((prev) => {
        const activeUserIds = new Set(presence.map((p) => p.user_id));
        const updated: Record<string, RemoteCursor> = {};
        for (const [userId, cursor] of Object.entries(prev)) {
          if (activeUserIds.has(userId)) {
            updated[userId] = cursor;
          }
        }
        return updated;
      });

      setSelections((prev) => {
        const activeUserIds = new Set(presence.map((p) => p.user_id));
        const updated: Record<string, string | null> = {};
        for (const [userId, selection] of Object.entries(prev)) {
          if (activeUserIds.has(userId)) {
            updated[userId] = selection;
          }
        }
        return updated;
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [presence]);

  // Queue-aware send: delivers immediately if connected, queues otherwise
  const safeSend = useCallback((msg: string, queue: boolean = false) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(msg);
    } else if (queue) {
      messageQueueRef.current.push(msg);
    }
  }, []);

  const sendCursor = useCallback((position: CursorPosition) => {
    // Cursors are ephemeral — no need to queue
    safeSend(JSON.stringify({ type: 'cursor', position }));
  }, [safeSend]);

  const sendSelection = useCallback((entityId: string | null) => {
    // Queue selection so it's sent after reconnect
    safeSend(JSON.stringify({ type: 'selection', entity_id: entityId }), true);
  }, [safeSend]);

  const sendEdit = useCallback(
    (entity: string, action: string, data: Record<string, unknown>) => {
      // Queue edits so collaborators receive them after reconnect
      safeSend(JSON.stringify({ type: 'edit', entity, action, data }), true);
    },
    [safeSend]
  );

  return {
    isConnected,
    presence,
    cursors,
    selections,
    lastEdit,
    sendCursor,
    sendSelection,
    sendEdit,
    connect,
    disconnect,
  };
}
