import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjectWebSocket } from '../useWebSocket';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    // Auto-connect after microtask
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000, _reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

// Assign mock to global
const originalWebSocket = (globalThis as any).WebSocket;

// Mock localStorage
const mockStorage: Record<string, string> = {
  induform_access_token: 'test-jwt-token',
};

vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, value: string) => { mockStorage[key] = value; },
  removeItem: (key: string) => { delete mockStorage[key]; },
});

describe('useProjectWebSocket', () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as any).WebSocket = vi.fn((url: string) => {
      mockWs = new MockWebSocket(url);
      return mockWs;
    });
    ((globalThis as any).WebSocket as any).OPEN = MockWebSocket.OPEN;
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as any).WebSocket = originalWebSocket;
  });

  it('connects when projectId is provided', async () => {
    const { result } = renderHook(() => useProjectWebSocket('project-1'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(result.current.isConnected).toBe(true);
    expect(mockWs.url).toContain('/ws/projects/project-1');
    expect(mockWs.url).toContain('token=test-jwt-token');
  });

  it('does not connect when projectId is null', () => {
    const { result } = renderHook(() => useProjectWebSocket(null));
    expect(result.current.isConnected).toBe(false);
  });

  it('handles presence messages', async () => {
    const { result } = renderHook(() => useProjectWebSocket('project-1'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      mockWs.onmessage?.({
        data: JSON.stringify({
          type: 'presence',
          viewers: [{ user_id: 'u1', username: 'alice' }],
        }),
      });
    });

    expect(result.current.presence).toHaveLength(1);
    expect(result.current.presence[0].username).toBe('alice');
  });

  it('handles selection messages', async () => {
    const { result } = renderHook(() => useProjectWebSocket('project-1'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      mockWs.onmessage?.({
        data: JSON.stringify({
          type: 'selection',
          user_id: 'u2',
          username: 'bob',
          entity_id: 'zone-1',
        }),
      });
    });

    expect(result.current.selections['u2']).toBe('zone-1');
  });

  it('handles edit messages', async () => {
    const { result } = renderHook(() => useProjectWebSocket('project-1'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      mockWs.onmessage?.({
        data: JSON.stringify({
          type: 'edit',
          user_id: 'u2',
          username: 'bob',
          entity: 'zone',
          action: 'update',
          data: {},
          timestamp: '2024-01-01T00:00:00Z',
        }),
      });
    });

    expect(result.current.lastEdit).not.toBeNull();
    expect(result.current.lastEdit?.entity).toBe('zone');
  });

  it('queues edit messages when disconnected', async () => {
    const { result } = renderHook(() => useProjectWebSocket('project-1'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    // Simulate disconnect
    mockWs.readyState = MockWebSocket.CLOSED;

    act(() => {
      result.current.sendEdit('zone', 'update', { id: 'z1' });
    });

    // Message should be queued, not sent
    expect(mockWs.sent).toHaveLength(0);
  });

  it('sends selection immediately when connected', async () => {
    const { result } = renderHook(() => useProjectWebSocket('project-1'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    act(() => {
      result.current.sendSelection('zone-1');
    });

    expect(mockWs.sent).toHaveLength(1);
    const msg = JSON.parse(mockWs.sent[0]);
    expect(msg.type).toBe('selection');
    expect(msg.entity_id).toBe('zone-1');
  });

  it('disconnects cleanly on unmount', async () => {
    const { result, unmount } = renderHook(() => useProjectWebSocket('project-1'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(result.current.isConnected).toBe(true);

    unmount();

    expect(mockWs.readyState).toBe(MockWebSocket.CLOSED);
  });
});
