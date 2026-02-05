import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProject } from '../useProject';

// Mock fetch globally
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

// Mock localStorage
const mockStorage: Record<string, string> = { induform_access_token: 'test-token' };
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, value: string) => { mockStorage[key] = value; },
  removeItem: (key: string) => { delete mockStorage[key]; },
});

const MOCK_PROJECT = {
  version: '1.0',
  project: { name: 'Test Project', compliance_standards: ['IEC62443' as const] },
  zones: [
    { id: 'zone1', name: 'Zone 1', type: 'cell' as const, security_level_target: 2, assets: [] },
  ],
  conduits: [],
};

function mockValidationSuccess() {
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('/validate') || url.includes('/policies')) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    return { ok: true, json: async () => ({ project: MOCK_PROJECT, permission: 'owner' }) };
  });
}

describe('useProject', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads a project on mount', async () => {
    mockValidationSuccess();

    const { result } = renderHook(() => useProject('project-1'));

    // Initially loading
    expect(result.current.loading).toBe(true);

    // Wait for load to complete
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.project).not.toBeNull();
    expect(result.current.project?.zones).toHaveLength(1);
    expect(result.current.permission).toBe('owner');
  });

  it('returns null project when no projectId', async () => {
    const { result } = renderHook(() => useProject(null));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.project).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('tracks undo/redo history', async () => {
    mockValidationSuccess();

    const { result } = renderHook(() => useProject('project-1'));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    // Make a change
    act(() => {
      result.current.updateProject({
        ...MOCK_PROJECT,
        zones: [
          ...MOCK_PROJECT.zones,
          { id: 'zone2', name: 'Zone 2', type: 'cell' as const, security_level_target: 2, assets: [] },
        ],
      });
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.project?.zones).toHaveLength(2);

    // Undo
    act(() => {
      result.current.undo();
    });

    expect(result.current.project?.zones).toHaveLength(1);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    // Redo
    act(() => {
      result.current.redo();
    });

    expect(result.current.project?.zones).toHaveLength(2);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('sets lastUndoRedoMessage on undo/redo', async () => {
    mockValidationSuccess();

    const { result } = renderHook(() => useProject('project-1'));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Add a zone
    act(() => {
      result.current.updateProject({
        ...MOCK_PROJECT,
        zones: [
          ...MOCK_PROJECT.zones,
          { id: 'zone2', name: 'Zone 2', type: 'cell' as const, security_level_target: 2, assets: [] },
        ],
      });
    });

    // Undo — should produce a message
    act(() => {
      result.current.undo();
    });

    expect(result.current.lastUndoRedoMessage).toMatch(/Undo:/);
  });

  it('detects hasChanges correctly', async () => {
    mockValidationSuccess();

    const { result } = renderHook(() => useProject('project-1'));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.hasChanges).toBe(false);

    act(() => {
      result.current.updateProject({
        ...MOCK_PROJECT,
        zones: [
          ...MOCK_PROJECT.zones,
          { id: 'zone2', name: 'Zone 2', type: 'cell' as const, security_level_target: 2, assets: [] },
        ],
      });
    });

    expect(result.current.hasChanges).toBe(true);
  });

  it('reload does not set loading=true', async () => {
    mockValidationSuccess();

    const { result } = renderHook(() => useProject('project-1'));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.loading).toBe(false);

    // Reload
    await act(async () => {
      result.current.reload();
      await vi.runAllTimersAsync();
    });

    // Should never have gone to loading=true
    expect(result.current.loading).toBe(false);
  });

  it('manages zone selection', async () => {
    mockValidationSuccess();

    const { result } = renderHook(() => useProject('project-1'));

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.selectedZone).toBeUndefined();

    act(() => {
      result.current.selectZone(MOCK_PROJECT.zones[0] as any);
    });

    expect(result.current.selectedZone?.id).toBe('zone1');

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedZone).toBeUndefined();
  });
});
