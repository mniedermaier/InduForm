import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProjectTabs, sampleProject } from '../useProjectTabs';
import type { TabState } from '../useProjectTabs';

// Mock fetch globally
const mockFetch = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = mockFetch;

// Mock localStorage
const mockStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, value: string) => { mockStorage[key] = value; },
  removeItem: (key: string) => { delete mockStorage[key]; },
});

// Mock confirm
vi.stubGlobal('confirm', vi.fn(() => true));

// Mock alert
vi.stubGlobal('alert', vi.fn());

function mockApiSuccess() {
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('/validate') || url.includes('/policies')) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    return {
      ok: true,
      json: async () => ({
        project: sampleProject,
        file_path: '/tmp/test.yaml',
        validation: { results: [] },
        policy_violations: [],
        permission: 'owner',
      }),
    };
  });
}

function mockApiFailure() {
  mockFetch.mockRejectedValue(new Error('API unavailable'));
}

function makeTab(overrides: Partial<TabState> = {}): TabState {
  return {
    id: 'tab-test',
    project: sampleProject,
    originalProject: sampleProject,
    validationResults: [],
    policyViolations: [],
    filePath: '/tmp/test.yaml',
    fileName: 'test.yaml',
    history: [sampleProject],
    historyIndex: 0,
    ...overrides,
  };
}

describe('useProjectTabs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  it('falls back to sample project when API fails', async () => {
    mockApiFailure();

    const { result } = renderHook(() => useProjectTabs());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.apiConnected).toBe(false);
    expect(result.current.project).toEqual(sampleProject);
    expect(result.current.error).toBeTruthy();
  });

  it('loads project from API on mount', async () => {
    mockApiSuccess();

    const { result } = renderHook(() => useProjectTabs());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.project).toBeDefined();
    expect(result.current.tabs.length).toBeGreaterThanOrEqual(1);
  });

  it('tracks hasChanges correctly', async () => {
    mockApiSuccess();

    const { result } = renderHook(() => useProjectTabs());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // No changes initially
    expect(result.current.hasChanges).toBe(false);

    // Make a change
    const modified = {
      ...result.current.project,
      project: { ...result.current.project.project, name: 'Modified Name' },
    };
    act(() => result.current.updateProject(modified));

    expect(result.current.hasChanges).toBe(true);
  });

  it('supports undo and redo', async () => {
    mockApiSuccess();

    const { result } = renderHook(() => useProjectTabs());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const original = result.current.project;

    // Make a change
    const modified = {
      ...original,
      project: { ...original.project, name: 'Changed' },
    };
    act(() => result.current.updateProject(modified));

    expect(result.current.project.project.name).toBe('Changed');
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    // Undo
    act(() => result.current.undo());
    expect(result.current.project.project.name).toBe(original.project.name);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    // Redo
    act(() => result.current.redo());
    expect(result.current.project.project.name).toBe('Changed');
  });

  it('supports zone selection', async () => {
    mockApiSuccess();

    const { result } = renderHook(() => useProjectTabs());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const zone = result.current.project.zones[0];
    act(() => result.current.selectZone(zone));
    expect(result.current.selectedZone).toEqual(zone);

    act(() => result.current.clearSelection());
    expect(result.current.selectedZone).toBeUndefined();
  });

  it('clears zone when conduit is selected', async () => {
    mockApiSuccess();

    const { result } = renderHook(() => useProjectTabs());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const zone = result.current.project.zones[0];
    act(() => result.current.selectZone(zone));
    expect(result.current.selectedZone).toBeDefined();

    const conduit = result.current.project.conduits[0];
    if (conduit) {
      act(() => result.current.selectConduit(conduit));
      expect(result.current.selectedZone).toBeUndefined();
      expect(result.current.selectedConduit).toBeDefined();
    }
  });

  it('manages tabs: add and select', async () => {
    mockApiSuccess();

    const { result } = renderHook(() => useProjectTabs());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const initialCount = result.current.tabs.length;
    const newTab = makeTab({ id: 'new-tab', fileName: 'new.yaml', filePath: '/tmp/new.yaml' });

    act(() => result.current.addTab(newTab));
    expect(result.current.tabs.length).toBe(initialCount + 1);
    expect(result.current.activeTabId).toBe('new-tab');
  });

  it('closes tabs', async () => {
    mockApiSuccess();

    const { result } = renderHook(() => useProjectTabs());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Add a second tab
    const newTab = makeTab({ id: 'tab-2', fileName: 'second.yaml', filePath: '/tmp/second.yaml' });
    act(() => result.current.addTab(newTab));

    const countBefore = result.current.tabs.length;
    act(() => result.current.closeTab('tab-2'));
    expect(result.current.tabs.length).toBe(countBefore - 1);
  });

  it('provides tabInfos with metadata', async () => {
    mockApiSuccess();

    const { result } = renderHook(() => useProjectTabs());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.tabInfos.length).toBeGreaterThanOrEqual(1);
    const info = result.current.tabInfos[0];
    expect(info).toHaveProperty('id');
    expect(info).toHaveProperty('fileName');
    expect(info).toHaveProperty('projectName');
    expect(info).toHaveProperty('hasChanges');
  });
});
