import { useState, useCallback, useMemo, useEffect } from 'react';
import type { Project, Zone, Conduit, ValidationResult, PolicyViolation } from '../types/models';
import { api } from '../api/client';

const MAX_HISTORY = 50;
const AUTO_SAVE_INTERVAL = 30000;

let tabIdCounter = 0;
const generateTabId = () => `tab-${++tabIdCounter}`;

// Sample project for when API is not available
export const sampleProject: Project = {
  version: '1.0',
  project: {
    name: 'Sample Manufacturing Plant',
    description: 'Demo project - Connect to API for real data',
    compliance_standards: ['IEC62443'],
  },
  zones: [
    {
      id: 'enterprise',
      name: 'Enterprise Network',
      type: 'enterprise',
      security_level_target: 1,
      assets: [],
    },
    {
      id: 'dmz',
      name: 'Site DMZ',
      type: 'dmz',
      security_level_target: 3,
      parent_zone: 'enterprise',
      assets: [
        { id: 'historian', name: 'Historian', type: 'historian', ip_address: '10.1.1.10' },
      ],
    },
    {
      id: 'cell_01',
      name: 'Assembly Cell 01',
      type: 'cell',
      security_level_target: 2,
      assets: [
        { id: 'plc_01', name: 'Main PLC', type: 'plc', ip_address: '10.10.1.10' },
      ],
    },
  ],
  conduits: [
    {
      id: 'enterprise_to_dmz',
      from_zone: 'enterprise',
      to_zone: 'dmz',
      requires_inspection: true,
      flows: [
        { protocol: 'https', port: 443, direction: 'bidirectional' },
      ],
    },
    {
      id: 'dmz_to_cell',
      from_zone: 'dmz',
      to_zone: 'cell_01',
      requires_inspection: false,
      flows: [
        { protocol: 'opcua', port: 4840, direction: 'bidirectional' },
      ],
    },
  ],
};

export interface TabState {
  id: string;
  project: Project;
  originalProject: Project;
  validationResults: ValidationResult[];
  policyViolations: PolicyViolation[];
  selectedZone?: Zone;
  selectedConduit?: Conduit;
  filePath: string;
  fileName: string;
  history: Project[];
  historyIndex: number;
}

export interface TabInfo {
  id: string;
  fileName: string;
  projectName: string;
  hasChanges: boolean;
  filePath: string;
}

export interface UseProjectTabsResult {
  // State
  tabs: TabState[];
  activeTabId: string;
  activeTab: TabState | undefined;
  tabInfos: TabInfo[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  apiConnected: boolean;
  recentFiles: string[];

  // Derived from active tab
  project: Project;
  validationResults: ValidationResult[];
  policyViolations: PolicyViolation[];
  selectedZone: Zone | undefined;
  selectedConduit: Conduit | undefined;
  currentFilePath: string;
  currentFileName: string;
  hasChanges: boolean;
  canUndo: boolean;
  canRedo: boolean;

  // Tab actions
  selectTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  openRecentFile: (filePath: string) => Promise<void>;

  // Selection
  selectZone: (zone: Zone | undefined) => void;
  selectConduit: (conduit: Conduit | undefined) => void;
  clearSelection: () => void;

  // Project modifications
  updateProject: (newProject: Project, additionalUpdates?: Partial<TabState>) => void;
  updateActiveTab: (updates: Partial<TabState>) => void;

  // History
  undo: () => void;
  redo: () => void;

  // File operations
  save: () => Promise<void>;
  openFile: (filePath: string, name: string) => Promise<void>;
  newFile: (filename: string) => Promise<void>;
  saveAs: (filename: string) => Promise<void>;
  confirmUnsavedChanges: () => boolean;

  // Setters for loading/error states
  setLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;
  setError: (error: string | null) => void;
  addTab: (tab: TabState) => void;
}

export function useProjectTabs(): UseProjectTabsResult {
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [recentFiles, setRecentFiles] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('induform-recent-files');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Get active tab
  const activeTab = useMemo(
    () => tabs.find(t => t.id === activeTabId),
    [tabs, activeTabId]
  );

  // Derived state from active tab
  const project = activeTab?.project ?? sampleProject;
  const validationResults = activeTab?.validationResults ?? [];
  const policyViolations = activeTab?.policyViolations ?? [];
  const selectedZone = activeTab?.selectedZone;
  const selectedConduit = activeTab?.selectedConduit;
  const currentFilePath = activeTab?.filePath ?? '';
  const currentFileName = activeTab?.fileName ?? '';
  const hasChanges = activeTab
    ? JSON.stringify(activeTab.project) !== JSON.stringify(activeTab.originalProject)
    : false;
  const canUndo = activeTab ? activeTab.historyIndex > 0 : false;
  const canRedo = activeTab ? activeTab.historyIndex < activeTab.history.length - 1 : false;

  // Tab infos for TabBar
  const tabInfos: TabInfo[] = useMemo(
    () => tabs.map(tab => ({
      id: tab.id,
      fileName: tab.fileName,
      projectName: tab.project.project.name,
      hasChanges: JSON.stringify(tab.project) !== JSON.stringify(tab.originalProject),
      filePath: tab.filePath,
    })),
    [tabs]
  );

  // Create a new tab with project data
  const createTab = useCallback((
    proj: Project,
    filePath: string,
    validation: ValidationResult[],
    violations: PolicyViolation[]
  ): TabState => ({
    id: generateTabId(),
    project: proj,
    originalProject: proj,
    validationResults: validation,
    policyViolations: violations,
    filePath,
    fileName: filePath.split('/').pop() || '',
    history: [proj],
    historyIndex: 0,
  }), []);

  // Add file to recent files
  const addToRecentFiles = useCallback((filePath: string) => {
    if (!filePath) return;
    setRecentFiles(prev => {
      const filtered = prev.filter(f => f !== filePath);
      return [filePath, ...filtered].slice(0, 10);
    });
  }, []);

  // Save recent files to localStorage
  useEffect(() => {
    localStorage.setItem('induform-recent-files', JSON.stringify(recentFiles));
  }, [recentFiles]);

  // Load initial project from API
  useEffect(() => {
    const loadProject = async () => {
      try {
        const response = await api.getProject();
        const newTab = createTab(
          response.project,
          response.file_path,
          response.validation.results,
          response.policy_violations
        );
        setTabs([newTab]);
        setActiveTabId(newTab.id);
        setApiConnected(true);
        setError(null);
      } catch (err) {
        // API not available, fall back to sample data
        const demoTab: TabState = {
          id: generateTabId(),
          project: sampleProject,
          originalProject: sampleProject,
          validationResults: [],
          policyViolations: [],
          filePath: '',
          fileName: 'Demo Project',
          history: [sampleProject],
          historyIndex: 0,
        };
        setTabs([demoTab]);
        setActiveTabId(demoTab.id);
        setError('API not connected - showing sample data');
        setApiConnected(false);
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [createTab]);

  // Validate project when it changes
  useEffect(() => {
    if (!apiConnected || !activeTab) return;

    const validateProject = async () => {
      try {
        const [validation, violations] = await Promise.all([
          api.validate(activeTab.project),
          api.checkPolicies(activeTab.project),
        ]);
        setTabs(prev => prev.map(tab =>
          tab.id === activeTabId
            ? { ...tab, validationResults: validation.results, policyViolations: violations }
            : tab
        ));
      } catch (err) {
        console.error('Validation error:', err);
      }
    };

    const debounce = setTimeout(validateProject, 500);
    return () => clearTimeout(debounce);
  }, [activeTab?.project, apiConnected, activeTab, activeTabId]);

  // Auto-save effect
  useEffect(() => {
    if (!apiConnected || !activeTab || !hasChanges) return;

    const autoSave = setInterval(async () => {
      if (activeTab.filePath) {
        try {
          await api.saveProject(activeTab.project);
          setTabs(prev => prev.map(tab =>
            tab.id === activeTabId
              ? { ...tab, originalProject: activeTab.project }
              : tab
          ));
          // Auto-save succeeded
        } catch (err) {
          console.error('Auto-save error:', err);
        }
      }
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(autoSave);
  }, [apiConnected, activeTab, hasChanges, activeTabId]);

  // Update active tab helper
  const updateActiveTab = useCallback((updates: Partial<TabState>) => {
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId ? { ...tab, ...updates } : tab
    ));
  }, [activeTabId]);

  // Update project with history tracking
  const updateProject = useCallback((newProject: Project, additionalUpdates?: Partial<TabState>) => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(tab => {
      if (tab.id !== activeTabId) return tab;

      const newHistory = tab.history.slice(0, tab.historyIndex + 1);
      newHistory.push(newProject);

      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }

      return {
        ...tab,
        project: newProject,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        ...additionalUpdates,
      };
    }));
  }, [activeTabId]);

  // Undo
  const undo = useCallback(() => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(tab => {
      if (tab.id !== activeTabId || tab.historyIndex <= 0) return tab;

      const newIndex = tab.historyIndex - 1;
      return {
        ...tab,
        project: tab.history[newIndex],
        historyIndex: newIndex,
        selectedZone: undefined,
        selectedConduit: undefined,
      };
    }));
  }, [activeTabId]);

  // Redo
  const redo = useCallback(() => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(tab => {
      if (tab.id !== activeTabId || tab.historyIndex >= tab.history.length - 1) return tab;

      const newIndex = tab.historyIndex + 1;
      return {
        ...tab,
        project: tab.history[newIndex],
        historyIndex: newIndex,
        selectedZone: undefined,
        selectedConduit: undefined,
      };
    }));
  }, [activeTabId]);

  // Selection
  const selectZone = useCallback((zone: Zone | undefined) => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? { ...tab, selectedZone: zone, ...(zone !== undefined ? { selectedConduit: undefined } : {}) }
        : tab
    ));
  }, [activeTabId]);

  const selectConduit = useCallback((conduit: Conduit | undefined) => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? { ...tab, selectedConduit: conduit, ...(conduit !== undefined ? { selectedZone: undefined } : {}) }
        : tab
    ));
  }, [activeTabId]);

  const clearSelection = useCallback(() => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? { ...tab, selectedZone: undefined, selectedConduit: undefined }
        : tab
    ));
  }, [activeTabId]);

  // Tab management
  const selectTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  const closeTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    const tabHasChanges = JSON.stringify(tab.project) !== JSON.stringify(tab.originalProject);
    if (tabHasChanges) {
      if (!confirm(`"${tab.project.project.name}" has unsaved changes. Close anyway?`)) {
        return;
      }
    }

    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId && newTabs.length > 0) {
        const closedIndex = prev.findIndex(t => t.id === tabId);
        const newActiveIndex = Math.min(closedIndex, newTabs.length - 1);
        setActiveTabId(newTabs[newActiveIndex].id);
      }
      return newTabs;
    });
  }, [tabs, activeTabId]);

  const addTab = useCallback((tab: TabState) => {
    setTabs(prev => [...prev, tab]);
    setActiveTabId(tab.id);
  }, []);

  // File operations
  const save = useCallback(async () => {
    if (!apiConnected || !activeTab) return;
    setSaving(true);
    try {
      await api.saveProject(activeTab.project);
      updateActiveTab({ originalProject: activeTab.project });
    } catch (err) {
      console.error('Save error:', err);
      alert('Failed to save project');
    } finally {
      setSaving(false);
    }
  }, [apiConnected, activeTab, updateActiveTab]);

  const openFile = useCallback(async (filePath: string, name: string) => {
    const existingTab = tabs.find(t => t.filePath === filePath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    try {
      setLoading(true);
      const response = await api.openFile({ path: filePath, name, project_name: null });
      const newTab = createTab(
        response.project,
        response.file_path,
        response.validation.results,
        response.policy_violations
      );
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
      addToRecentFiles(response.file_path);
    } catch (err) {
      console.error('Open file error:', err);
      alert('Failed to open file');
    } finally {
      setLoading(false);
    }
  }, [tabs, createTab, addToRecentFiles]);

  const openRecentFile = useCallback(async (filePath: string) => {
    const existingTab = tabs.find(t => t.filePath === filePath);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return;
    }

    try {
      setLoading(true);
      const response = await api.openFile({
        path: filePath,
        name: filePath.split('/').pop() || '',
        project_name: null
      });
      const newTab = createTab(
        response.project,
        response.file_path,
        response.validation.results,
        response.policy_violations
      );
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
      addToRecentFiles(response.file_path);
    } catch (err) {
      console.error('Open recent file error:', err);
      alert('Failed to open file. It may have been moved or deleted.');
      setRecentFiles(prev => prev.filter(f => f !== filePath));
    } finally {
      setLoading(false);
    }
  }, [tabs, createTab, addToRecentFiles]);

  const newFile = useCallback(async (filename: string) => {
    try {
      setLoading(true);
      const response = await api.newFile(filename);
      const newTab = createTab(
        response.project,
        response.file_path,
        response.validation.results,
        response.policy_violations
      );
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    } catch (err: unknown) {
      console.error('New file error:', err);
      alert(err instanceof Error ? err.message : 'Failed to create file');
    } finally {
      setLoading(false);
    }
  }, [createTab]);

  const saveAs = useCallback(async (filename: string) => {
    if (!activeTab) return;

    try {
      setSaving(true);
      const response = await api.saveAs(activeTab.project, filename);
      updateActiveTab({
        filePath: response.path,
        fileName: response.filename,
        originalProject: activeTab.project,
      });
    } catch (err: unknown) {
      console.error('Save as error:', err);
      alert(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  }, [activeTab, updateActiveTab]);

  const confirmUnsavedChanges = useCallback(() => {
    if (activeTab) {
      const tabHasChanges = JSON.stringify(activeTab.project) !== JSON.stringify(activeTab.originalProject);
      if (tabHasChanges) {
        return confirm('You have unsaved changes. Do you want to continue without saving?');
      }
    }
    return true;
  }, [activeTab]);

  return {
    tabs,
    activeTabId,
    activeTab,
    tabInfos,
    loading,
    saving,
    error,
    apiConnected,
    recentFiles,
    project,
    validationResults,
    policyViolations,
    selectedZone,
    selectedConduit,
    currentFilePath,
    currentFileName,
    hasChanges,
    canUndo,
    canRedo,
    selectTab,
    closeTab,
    openRecentFile,
    selectZone,
    selectConduit,
    clearSelection,
    updateProject,
    updateActiveTab,
    undo,
    redo,
    save,
    openFile,
    newFile,
    saveAs,
    confirmUnsavedChanges,
    setLoading,
    setSaving,
    setError,
    addTab,
  };
}
