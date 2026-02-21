import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Project, Zone, Conduit, ValidationResult, PolicyViolation } from '../types/models';

const MAX_HISTORY = 50;
const AUTO_SAVE_DEBOUNCE = 1000;

export interface UseProjectResult {
  // State
  project: Project | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  permission: 'owner' | 'editor' | 'viewer' | null;

  // Validation
  validationResults: ValidationResult[];
  policyViolations: PolicyViolation[];
  isValidating: boolean;

  // Selection
  selectedZone: Zone | undefined;
  selectedConduit: Conduit | undefined;

  // Derived state
  hasChanges: boolean;
  canUndo: boolean;
  canRedo: boolean;

  // Undo/Redo message for toast
  lastUndoRedoMessage: string | null;

  // Actions
  updateProject: (newProject: Project) => void;
  save: () => Promise<void>;
  validate: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  selectZone: (zone: Zone | undefined) => void;
  selectConduit: (conduit: Conduit | undefined) => void;
  clearSelection: () => void;
  reload: () => Promise<void>;
}

interface ProjectState {
  current: Project;
  original: Project;
  history: Project[];
  historyIndex: number;
}

export function useProject(projectId: string | null, onSaved?: () => void): UseProjectResult {
  const [projectState, setProjectState] = useState<ProjectState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<'owner' | 'editor' | 'viewer' | null>(null);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [policyViolations, setPolicyViolations] = useState<PolicyViolation[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [selectedZone, setSelectedZone] = useState<Zone | undefined>();
  const [selectedConduit, setSelectedConduit] = useState<Conduit | undefined>();

  const [lastUndoRedoMessage, setLastUndoRedoMessage] = useState<string | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');

  // Refs to avoid stale closures in debounced save
  const projectStateRef = useRef(projectState);
  projectStateRef.current = projectState;

  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  // Get auth token
  const getToken = () => localStorage.getItem('induform_access_token');

  // Load project
  const loadProject = useCallback(async () => {
    if (!projectId) {
      setProjectState(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!response.ok) {
        throw new Error('Failed to load project');
      }

      const data = await response.json();
      const project: Project = data.project;

      setProjectState({
        current: project,
        original: project,
        history: [project],
        historyIndex: 0,
      });
      setPermission(data.permission);
      lastSavedRef.current = JSON.stringify(project);

      // Initial validation
      await validateProject(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
      setProjectState(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- validateProject is a plain function that uses only state setters and getToken; adding it would cause infinite reloads
  }, [projectId]);

  // Validate project
  const validateProject = async (project: Project) => {
    try {
      setIsValidating(true);
      const [validationRes, policiesRes] = await Promise.all([
        fetch('/api/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify(project),
        }),
        fetch('/api/policies', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify(project),
        }),
      ]);

      if (validationRes.ok) {
        const validation = await validationRes.json();
        setValidationResults(validation.results || []);
      }

      if (policiesRes.ok) {
        const policies = await policiesRes.json();
        setPolicyViolations(policies || []);
      }
    } catch {
      // Validation errors are displayed in the validation panel
    } finally {
      setIsValidating(false);
    }
  };

  // Save project to database — reads from ref to avoid stale closure
  const saveProject = useCallback(async () => {
    const state = projectStateRef.current;
    if (!projectId || !state || permission === 'viewer') return;

    const currentJson = JSON.stringify(state.current);
    if (currentJson === lastSavedRef.current) return;

    try {
      setSaving(true);

      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: currentJson,
      });

      if (!response.ok) {
        throw new Error('Failed to save project');
      }

      lastSavedRef.current = currentJson;
      setProjectState(prev => prev ? { ...prev, original: prev.current } : null);
      onSavedRef.current?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save project');
    } finally {
      setSaving(false);
    }
  }, [projectId, permission]);

  // Update project with history tracking
  const updateProject = useCallback((newProject: Project) => {
    setProjectState(prev => {
      if (!prev) return null;

      const newHistory = prev.history.slice(0, prev.historyIndex + 1);
      newHistory.push(newProject);

      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }

      return {
        current: newProject,
        original: prev.original,
        history: newHistory,
        historyIndex: newHistory.length - 1,
      };
    });

    // Clear any pending save and schedule a new one
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveProject();
    }, AUTO_SAVE_DEBOUNCE);
  }, [saveProject]);

  // Describe the diff between two project states
  const describeChange = useCallback((from: Project, to: Project): string => {
    const parts: string[] = [];
    const zoneDiff = to.zones.length - from.zones.length;
    const conduitDiff = to.conduits.length - from.conduits.length;
    const assetsBefore = from.zones.reduce((s, z) => s + z.assets.length, 0);
    const assetsAfter = to.zones.reduce((s, z) => s + z.assets.length, 0);
    const assetDiff = assetsAfter - assetsBefore;

    if (zoneDiff > 0) parts.push(`${zoneDiff} zone(s) added`);
    else if (zoneDiff < 0) parts.push(`${Math.abs(zoneDiff)} zone(s) removed`);
    if (conduitDiff > 0) parts.push(`${conduitDiff} conduit(s) added`);
    else if (conduitDiff < 0) parts.push(`${Math.abs(conduitDiff)} conduit(s) removed`);
    if (assetDiff > 0) parts.push(`${assetDiff} asset(s) added`);
    else if (assetDiff < 0) parts.push(`${Math.abs(assetDiff)} asset(s) removed`);

    if (parts.length === 0) {
      // Check for property changes
      const changedZones = to.zones.filter(z => {
        const old = from.zones.find(oz => oz.id === z.id);
        return old && JSON.stringify(old) !== JSON.stringify(z);
      });
      if (changedZones.length > 0) parts.push(`${changedZones.length} zone(s) modified`);
      const changedConduits = to.conduits.filter(c => {
        const old = from.conduits.find(oc => oc.id === c.id);
        return old && JSON.stringify(old) !== JSON.stringify(c);
      });
      if (changedConduits.length > 0) parts.push(`${changedConduits.length} conduit(s) modified`);
    }

    return parts.length > 0 ? parts.join(', ') : 'changes reverted';
  }, []);

  // Undo
  const undo = useCallback(() => {
    setProjectState(prev => {
      if (!prev || prev.historyIndex <= 0) return prev;

      const newIndex = prev.historyIndex - 1;
      const msg = describeChange(prev.current, prev.history[newIndex]);
      setLastUndoRedoMessage(`Undo: ${msg}`);
      return {
        ...prev,
        current: prev.history[newIndex],
        historyIndex: newIndex,
      };
    });
    setSelectedZone(undefined);
    setSelectedConduit(undefined);
  }, [describeChange]);

  // Redo
  const redo = useCallback(() => {
    setProjectState(prev => {
      if (!prev || prev.historyIndex >= prev.history.length - 1) return prev;

      const newIndex = prev.historyIndex + 1;
      const msg = describeChange(prev.current, prev.history[newIndex]);
      setLastUndoRedoMessage(`Redo: ${msg}`);
      return {
        ...prev,
        current: prev.history[newIndex],
        historyIndex: newIndex,
      };
    });
    setSelectedZone(undefined);
    setSelectedConduit(undefined);
  }, [describeChange]);

  // Selection
  const selectZone = useCallback((zone: Zone | undefined) => {
    setSelectedZone(zone);
    if (zone) setSelectedConduit(undefined);
  }, []);

  const selectConduit = useCallback((conduit: Conduit | undefined) => {
    setSelectedConduit(conduit);
    if (conduit) setSelectedZone(undefined);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedZone(undefined);
    setSelectedConduit(undefined);
  }, []);

  // Manual validation trigger — reads from ref to avoid recreating on every projectState change
  const validate = useCallback(async () => {
    const state = projectStateRef.current;
    if (state) {
      await validateProject(state.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads projectState from ref; validateProject is a plain function with stable behavior
  }, []);

  // Reload project without unmounting (no loading spinner)
  const reload = useCallback(async () => {
    if (!projectId) return;
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      const project: Project = data.project;

      setProjectState(prev => {
        if (!prev) return prev;
        // Merge remote data without resetting history
        return {
          ...prev,
          current: project,
          original: project,
        };
      });
      setPermission(data.permission);
      lastSavedRef.current = JSON.stringify(project);
    } catch {
      // Silently ignore reload errors — the user can still work locally
    }
  }, [projectId]);

  // Load on mount or projectId change
  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Validate on project change (debounced)
  const currentProject = projectState?.current;
  useEffect(() => {
    if (!currentProject) return;

    const timeout = setTimeout(() => {
      validateProject(currentProject);
    }, 500);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- validateProject is a plain function with stable behavior; only re-validate when the current project data changes
  }, [currentProject]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Derived state — memoize hasChanges to avoid double JSON.stringify on every render
  const hasChanges = useMemo(
    () => projectState
      ? JSON.stringify(projectState.current) !== JSON.stringify(projectState.original)
      : false,
    [projectState]
  );
  const canUndo = projectState ? projectState.historyIndex > 0 : false;
  const canRedo = projectState ? projectState.historyIndex < projectState.history.length - 1 : false;

  return {
    project: projectState?.current ?? null,
    loading,
    saving,
    error,
    permission,
    validationResults,
    policyViolations,
    isValidating,
    selectedZone,
    selectedConduit,
    hasChanges,
    canUndo,
    canRedo,
    lastUndoRedoMessage,
    updateProject,
    save: saveProject,
    validate,
    undo,
    redo,
    selectZone,
    selectConduit,
    clearSelection,
    reload,
  };
}
