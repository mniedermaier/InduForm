import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { ReactFlowProvider } from '@xyflow/react';

import type { Project, Zone, Conduit, Asset } from '../types/models';
import { useProject, useDialogs, useKeyboardShortcuts } from '../hooks';
import { useProjectWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../contexts/ToastContext';
import ZoneEditor, { ExportContext } from './ZoneEditor';
import PropertiesPanel from './PropertiesPanel';
import Toolbar from './Toolbar';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import SearchBox from './SearchBox';
import UserMenu from './UserMenu';
import PresenceIndicator from './PresenceIndicator';

// Lazy-loaded dialog components (only loaded when opened)
const AddZoneDialog = lazy(() => import('./AddZoneDialog'));
const AddConduitDialog = lazy(() => import('./AddConduitDialog'));
const AddAssetDialog = lazy(() => import('./AddAssetDialog'));
const ValidationResultsDialog = lazy(() => import('./ValidationResultsDialog'));
const ProjectSettingsDialog = lazy(() => import('./ProjectSettingsDialog'));
const GenerateOutputDialog = lazy(() => import('./GenerateOutputDialog'));
const ComplianceDashboard = lazy(() => import('./ComplianceDashboard'));
const CSVImportDialog = lazy(() => import('./CSVImportDialog'));
const ExportDialog = lazy(() => import('./ExportDialog'));
const RiskDashboard = lazy(() => import('./RiskDashboard'));
const AssetTable = lazy(() => import('./AssetTable'));
const TeamManagementDialog = lazy(() => import('./TeamManagementDialog'));
const ShareProjectDialog = lazy(() => import('./ShareProjectDialog'));
const NmapImportDialog = lazy(() => import('./NmapImportDialog'));
const UserSettingsDialog = lazy(() => import('./UserSettingsDialog'));
const KeyboardShortcutsDialog = lazy(() => import('./KeyboardShortcutsDialog'));
const ComplianceSettingsDialog = lazy(() => import('./ComplianceSettingsDialog'));
const Zone3DEditor = lazy(() => import('./Zone3DEditor'));

interface ProjectEditorProps {
  projectId: string;
  onBackToProjects: () => void;
}

export default function ProjectEditor({ projectId, onBackToProjects }: ProjectEditorProps) {
  const toast = useToast();
  const ws = useProjectWebSocket(projectId);

  // Notify collaborators after each successful save
  const handleSaved = useCallback(() => {
    ws.sendEdit('project', 'update', {});
  }, [ws.sendEdit]);

  const projectHook = useProject(projectId, handleSaved);
  const [dialogs, dialogActions] = useDialogs();

  // Layout state
  const [rearrangeKey, setRearrangeKey] = useState(0);
  const [exportContext, setExportContext] = useState<ExportContext | null>(null);
  const [copiedZone, setCopiedZone] = useState<Zone | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');
  const [riskOverlayEnabled, setRiskOverlayEnabled] = useState(false);
  const [multiSelectedZoneIds, setMultiSelectedZoneIds] = useState<string[]>([]);
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => prev === '2d' ? '3d' : '2d');
  }, []);

  const toggleRiskOverlay = useCallback(() => {
    setRiskOverlayEnabled(prev => !prev);
  }, []);

  // Client-side risk score computation (mirrors backend formula)
  const computeZoneRisks = useCallback((proj: Project): Map<string, { score: number; level: string }> => {
    const risks = new Map<string, { score: number; level: string }>();
    for (const zone of proj.zones) {
      // SL base risk: lower SL-T means higher risk
      const slBaseRisk = ((4 - zone.security_level_target) / 4) * 100;
      // Asset criticality: average criticality of assets
      const avgCriticality = zone.assets.length > 0
        ? zone.assets.reduce((s, a) => s + (a.criticality || 3), 0) / zone.assets.length
        : 3;
      const assetCriticalityRisk = (avgCriticality / 5) * 100;
      // Exposure: number of conduits
      const conduitCount = proj.conduits.filter(c => c.from_zone === zone.id || c.to_zone === zone.id).length;
      const exposureRisk = Math.min(conduitCount * 20, 100);
      // SL gap
      const slC = zone.security_level_capability ?? zone.security_level_target;
      const slGapRisk = Math.max(0, (zone.security_level_target - slC)) * 25;
      // Weighted
      const score = Math.round(slBaseRisk * 0.3 + assetCriticalityRisk * 0.25 + exposureRisk * 0.2 + slGapRisk * 0.25);
      const level = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 40 ? 'medium' : score >= 20 ? 'low' : 'minimal';
      risks.set(zone.id, { score, level });
    }
    return risks;
  }, []);

  // Map remote selections to per-zone usernames (memoized to avoid new Map on every render)
  const remoteSelections = useMemo((): Map<string, string> => {
    const map = new Map<string, string>();
    for (const [userId, entityId] of Object.entries(ws.selections)) {
      if (entityId) {
        const user = ws.presence.find(p => p.user_id === userId);
        if (user) {
          map.set(entityId, user.display_name || user.username);
        }
      }
    }
    return map;
  }, [ws.selections, ws.presence]);

  const {
    project,
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
    save,
    validate,
    undo,
    redo,
    selectZone,
    selectConduit,
    clearSelection,
  } = projectHook;

  const canEdit = permission === 'owner' || permission === 'editor';

  // Show toast on undo/redo
  useEffect(() => {
    if (lastUndoRedoMessage) {
      toast.info(lastUndoRedoMessage, 2500);
    }
  }, [lastUndoRedoMessage]);

  // Auto-open properties panel on mobile when something is selected
  useEffect(() => {
    if (selectedZone || selectedConduit) {
      setPropertiesPanelOpen(true);
    }
  }, [selectedZone, selectedConduit]);

  // Broadcast selection changes to collaborators
  useEffect(() => {
    const entityId = selectedZone?.id ?? selectedConduit?.id ?? null;
    ws.sendSelection(entityId);
  }, [selectedZone, selectedConduit, ws.sendSelection]);

  // Reload project when a remote collaborator makes an edit
  useEffect(() => {
    if (ws.lastEdit) {
      projectHook.reload();
    }
  }, [ws.lastEdit]);

  // Rearrange layout
  const handleRearrangeLayout = useCallback(() => {
    setRearrangeKey(prev => prev + 1);
  }, []);

  // Handle zone position changes from drag
  const handleZonePositionsChange = useCallback((positions: Map<string, { x: number; y: number }>) => {
    if (!project) return;
    const updatedZones = project.zones.map(zone => {
      const pos = positions.get(zone.id);
      if (!pos) return zone;
      return { ...zone, x_position: Math.round(pos.x), y_position: Math.round(pos.y) };
    });
    updateProject({ ...project, zones: updatedZones });
  }, [project, updateProject]);

  // Project metadata update
  const handleUpdateProjectMetadata = useCallback((metadata: Project['project']) => {
    if (!project) return;
    updateProject({ ...project, project: metadata });
    dialogActions.closeProjectSettings();
  }, [project, updateProject, dialogActions]);

  // Zone operations
  const handleAddZone = useCallback((zone: Zone) => {
    if (!project) return;
    updateProject({
      ...project,
      zones: [...project.zones, zone],
    });
    dialogActions.closeAddZone();
  }, [project, updateProject, dialogActions]);

  const handleUpdateZone = useCallback((zone: Zone) => {
    if (!project || !dialogs.editingZone) return;
    updateProject({
      ...project,
      zones: project.zones.map(z => z.id === dialogs.editingZone!.id ? zone : z),
    });
    dialogActions.closeEditZone();
  }, [project, dialogs.editingZone, updateProject, dialogActions]);

  const handleDeleteZone = useCallback((zoneId: string) => {
    if (!project) return;
    const usedByConduits = project.conduits.filter(
      c => c.from_zone === zoneId || c.to_zone === zoneId
    );
    if (usedByConduits.length > 0) {
      alert(`Cannot delete zone: it is used by ${usedByConduits.length} conduit(s). Delete the conduits first.`);
      return;
    }
    updateProject({
      ...project,
      zones: project.zones.filter(z => z.id !== zoneId),
    });
    if (selectedZone?.id === zoneId) clearSelection();
  }, [project, selectedZone, updateProject, clearSelection]);

  // Copy/paste zone
  const handleCopyZone = useCallback(() => {
    if (selectedZone) setCopiedZone(selectedZone);
  }, [selectedZone]);

  const handlePasteZone = useCallback(() => {
    if (!copiedZone || !project) return;
    let newId = `${copiedZone.id}_copy`;
    let counter = 1;
    while (project.zones.some(z => z.id === newId)) {
      newId = `${copiedZone.id}_copy_${counter++}`;
    }
    const newZone: Zone = {
      ...copiedZone,
      id: newId,
      name: `${copiedZone.name} (Copy)`,
      assets: copiedZone.assets.map(a => ({ ...a, id: `${a.id}_copy` })),
    };
    updateProject({
      ...project,
      zones: [...project.zones, newZone],
    });
  }, [copiedZone, project, updateProject]);

  // Conduit operations
  const handleAddConduit = useCallback((conduit: Conduit) => {
    if (!project) return;
    updateProject({
      ...project,
      conduits: [...project.conduits, conduit],
    });
    dialogActions.closeAddConduit();
    dialogActions.setPendingConnection(null);
  }, [project, updateProject, dialogActions]);

  const handleUpdateConduit = useCallback((conduit: Conduit) => {
    if (!project || !dialogs.editingConduit) return;
    updateProject({
      ...project,
      conduits: project.conduits.map(c => c.id === dialogs.editingConduit!.id ? conduit : c),
    });
    dialogActions.closeEditConduit();
  }, [project, dialogs.editingConduit, updateProject, dialogActions]);

  const handleDeleteConduit = useCallback((conduitId: string) => {
    if (!project) return;
    updateProject({
      ...project,
      conduits: project.conduits.filter(c => c.id !== conduitId),
    });
    if (selectedConduit?.id === conduitId) clearSelection();
  }, [project, selectedConduit, updateProject, clearSelection]);

  const handleConnect = useCallback((fromZoneId: string, toZoneId: string) => {
    dialogActions.setPendingConnection({ from: fromZoneId, to: toZoneId });
  }, [dialogActions]);

  // Asset operations
  const handleAddAsset = useCallback((asset: Asset) => {
    if (!dialogs.showAddAsset || !project) return;
    const zoneId = dialogs.showAddAsset.id;
    updateProject({
      ...project,
      zones: project.zones.map(z =>
        z.id === zoneId ? { ...z, assets: [...z.assets, asset] } : z
      ),
    });
    dialogActions.closeAddAsset();
  }, [dialogs.showAddAsset, project, updateProject, dialogActions]);

  const handleDeleteAsset = useCallback((zoneId: string, assetId: string) => {
    if (!project) return;
    updateProject({
      ...project,
      zones: project.zones.map(z =>
        z.id === zoneId ? { ...z, assets: z.assets.filter(a => a.id !== assetId) } : z
      ),
    });
  }, [project, updateProject]);

  const handleUpdateAsset = useCallback((zoneId: string, assetId: string, updatedAsset: Asset) => {
    if (!project) return;
    updateProject({
      ...project,
      zones: project.zones.map(z =>
        z.id === zoneId ? { ...z, assets: z.assets.map(a => a.id === assetId ? updatedAsset : a) } : z
      ),
    });
  }, [project, updateProject]);

  // Inline update handlers
  const handleInlineUpdateZone = useCallback((zoneId: string, updates: Partial<Zone>) => {
    if (!project) return;
    updateProject({
      ...project,
      zones: project.zones.map(z => z.id === zoneId ? { ...z, ...updates } : z),
    });
  }, [project, updateProject]);

  const handleInlineUpdateConduit = useCallback((conduitId: string, updates: Partial<Conduit>) => {
    if (!project) return;
    updateProject({
      ...project,
      conduits: project.conduits.map(c => c.id === conduitId ? { ...c, ...updates } : c),
    });
  }, [project, updateProject]);

  // Bulk operations for multi-select
  const handleBulkDeleteZones = useCallback((zoneIds: string[]) => {
    if (!project) return;
    // Check if any zones are used by conduits
    const usedByConduits = project.conduits.filter(c => zoneIds.includes(c.from_zone) || zoneIds.includes(c.to_zone));
    if (usedByConduits.length > 0) {
      alert(`Cannot delete: ${usedByConduits.length} conduit(s) reference these zones. Delete the conduits first.`);
      return;
    }
    updateProject({
      ...project,
      zones: project.zones.filter(z => !zoneIds.includes(z.id)),
    });
    clearSelection();
    setMultiSelectedZoneIds([]);
  }, [project, updateProject, clearSelection]);

  const handleBulkUpdateZones = useCallback((zoneIds: string[], updates: Partial<Zone>) => {
    if (!project) return;
    updateProject({
      ...project,
      zones: project.zones.map(z => zoneIds.includes(z.id) ? { ...z, ...updates } : z),
    });
  }, [project, updateProject]);

  // CSV Import
  const handleCSVImport = useCallback((zones: Zone[], assets: { zoneId: string; asset: Asset }[]) => {
    if (!project) return;
    let newZones = [...project.zones];
    if (zones.length > 0) {
      newZones = [...newZones, ...zones];
    }
    if (assets.length > 0) {
      newZones = newZones.map(zone => {
        const assetsForZone = assets.filter(a => a.zoneId === zone.id);
        if (assetsForZone.length > 0) {
          return { ...zone, assets: [...zone.assets, ...assetsForZone.map(a => a.asset)] };
        }
        return zone;
      });
    }
    updateProject({ ...project, zones: newZones });
    dialogActions.closeCSVImport();
  }, [project, updateProject, dialogActions]);

  // Quick fix handler
  const handleQuickFix = useCallback((type: string, entityId: string, fix: Record<string, unknown>) => {
    if (!project) return;
    if (type === 'zone') {
      updateProject({
        ...project,
        zones: project.zones.map(z => z.id === entityId ? { ...z, ...fix } : z),
      });
    } else if (type === 'conduit') {
      updateProject({
        ...project,
        conduits: project.conduits.map(c => c.id === entityId ? { ...c, ...fix } : c),
      });
    } else if (type === 'deleteConduit') {
      updateProject({
        ...project,
        conduits: project.conduits.filter(c => c.id !== entityId),
      });
      if (selectedConduit?.id === entityId) clearSelection();
    }
    validate();
  }, [project, updateProject, validate, selectedConduit, clearSelection]);

  // Validate and show results dialog
  const handleValidate = useCallback(async () => {
    await validate();
    dialogActions.openValidationResults();
  }, [validate, dialogActions]);

  // Context menu items
  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    if (!dialogs.contextMenu || !canEdit) return [];

    switch (dialogs.contextMenu.type) {
      case 'zone':
        if (!dialogs.contextMenu.zone) return [];
        return [
          { label: 'Select Zone', icon: '👆', onClick: () => selectZone(dialogs.contextMenu!.zone) },
          { label: 'Edit Zone', icon: '✏️', onClick: () => dialogActions.openEditZone(dialogs.contextMenu!.zone!) },
          { label: 'Add Asset', icon: '➕', onClick: () => dialogActions.openAddAsset(dialogs.contextMenu!.zone!) },
          { label: '', divider: true, onClick: () => {} },
          { label: 'Create Conduit From Here', icon: '→', onClick: () => dialogActions.openAddConduit() },
          { label: '', divider: true, onClick: () => {} },
          {
            label: 'Delete Zone', icon: '🗑', danger: true,
            onClick: () => {
              if (confirm(`Delete zone "${dialogs.contextMenu!.zone!.name}"?`)) {
                handleDeleteZone(dialogs.contextMenu!.zone!.id);
              }
            },
          },
        ];

      case 'conduit':
        if (!dialogs.contextMenu.conduit) return [];
        return [
          { label: 'Select Conduit', icon: '👆', onClick: () => selectConduit(dialogs.contextMenu!.conduit) },
          { label: 'Edit Conduit', icon: '✏️', onClick: () => dialogActions.openEditConduit(dialogs.contextMenu!.conduit!) },
          { label: '', divider: true, onClick: () => {} },
          {
            label: 'Delete Conduit', icon: '🗑', danger: true,
            onClick: () => {
              if (confirm(`Delete conduit "${dialogs.contextMenu!.conduit!.id}"?`)) {
                handleDeleteConduit(dialogs.contextMenu!.conduit!.id);
              }
            },
          },
        ];

      case 'pane':
        return [
          { label: 'Add Zone', icon: '📦', onClick: () => dialogActions.openAddZone() },
          { label: 'Add Conduit', icon: '🔗', onClick: () => dialogActions.openAddConduit(), disabled: project!.zones.length < 2 },
          { label: '', divider: true, onClick: () => {} },
          { label: 'Rearrange Layout', icon: '🔄', onClick: handleRearrangeLayout, disabled: project!.zones.length < 2 },
        ];

      default:
        return [];
    }
  }, [dialogs.contextMenu, canEdit, project, selectZone, selectConduit, dialogActions, handleDeleteZone, handleDeleteConduit, handleRearrangeLayout]);

  // Keyboard shortcuts
  useKeyboardShortcuts(
    {
      onUndo: undo,
      onRedo: redo,
      onSave: save,
      onExport: () => dialogActions.openExportDialog(),
      onCopy: handleCopyZone,
      onPaste: handlePasteZone,
      onDelete: () => {
        if (selectedZone && confirm(`Delete zone "${selectedZone.name}"?`)) {
          handleDeleteZone(selectedZone.id);
        } else if (selectedConduit && confirm(`Delete conduit "${selectedConduit.id}"?`)) {
          handleDeleteConduit(selectedConduit.id);
        }
      },
      onEscape: () => {
        if (dialogActions.closeTopmost()) return true;
        if (selectedZone || selectedConduit) {
          clearSelection();
          return true;
        }
        return false;
      },
      onValidate: handleValidate,
    },
    {
      canUndo,
      canRedo,
      canSave: canEdit && hasChanges && !saving,
      canCopy: !!selectedZone,
      canPaste: !!copiedZone && canEdit,
      canDelete: !!(selectedZone || selectedConduit) && canEdit,
      apiConnected: true,
      selectedZone,
      selectedConduit,
      copiedZone,
    }
  );

  // "?" key to toggle keyboard shortcuts, Ctrl+3 to toggle 3D view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        dialogActions.toggleKeyboardShortcuts();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault();
        toggleViewMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogActions, toggleViewMode]);

  // Loading state
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <img src="/logo.svg" alt="InduForm" className="w-24 h-24 mx-auto mb-4 animate-pulse" />
          <div className="text-gray-600 dark:text-gray-400">Loading project...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !project) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <div className="text-red-600 dark:text-red-400 mb-4">{error || 'Project not found'}</div>
          <button
            onClick={onBackToProjects}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={onBackToProjects}
            className="p-2 md:p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0"
            title="Back to Projects"
            aria-label="Back to Projects"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="flex items-center gap-2 flex-shrink-0">
            <img src="/favicon.svg" alt="InduForm" className="w-7 h-7" />
            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 hidden md:block">InduForm</h1>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400 truncate hidden sm:inline">{project.project.name}</span>
          {permission && (
            <span className={`text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded flex-shrink-0 ${
              permission === 'owner' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
              permission === 'editor' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
              'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
            }`}>
              {permission.charAt(0).toUpperCase() + permission.slice(1)}
            </span>
          )}
          {hasChanges && canEdit && (
            <span className="text-xs bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded flex-shrink-0">
              <span className="hidden sm:inline">Unsaved Changes</span>
              <span className="sm:hidden">*</span>
            </span>
          )}
          {saving && (
            <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded flex-shrink-0">
              Saving...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          {/* Search - full on md+, icon button on mobile */}
          <div className="hidden md:block">
            <SearchBox
              zones={project.zones}
              conduits={project.conduits}
              onSelectZone={selectZone}
              onSelectConduit={selectConduit}
            />
          </div>
          <button
            onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            className="p-2 md:hidden text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            aria-label="Search"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          <div className="hidden md:flex items-center gap-2 text-sm">
            {validationResults.filter(r => r.severity === 'error').length > 0 ? (
              <span className="text-red-600 dark:text-red-400">
                {validationResults.filter(r => r.severity === 'error').length} errors
              </span>
            ) : (
              <span className="text-green-600 dark:text-green-400">Valid</span>
            )}
            {validationResults.filter(r => r.severity === 'warning').length > 0 && (
              <span className="text-yellow-600 dark:text-yellow-400">
                {validationResults.filter(r => r.severity === 'warning').length} warnings
              </span>
            )}
          </div>

          <div className="hidden md:block text-sm text-gray-500 dark:text-gray-400">
            {project.zones.length} zones | {project.conduits.length} conduits
          </div>

          <div className="hidden sm:block">
            <PresenceIndicator
              viewers={ws.presence}
              isConnected={ws.isConnected}
            />
          </div>

          {/* Properties panel toggle - visible on <lg */}
          <button
            onClick={() => setPropertiesPanelOpen(!propertiesPanelOpen)}
            className="p-2 md:p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded lg:hidden"
            title="Toggle properties panel"
            aria-label="Toggle properties panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>

          <button
            onClick={dialogActions.openKeyboardShortcuts}
            className="p-2 md:p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded hidden sm:block"
            title="Keyboard shortcuts (press ?)"
            aria-label="Keyboard shortcuts"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          <UserMenu
            onOpenTeamManagement={dialogActions.openTeamManagement}
            onOpenProfileSettings={dialogActions.openProfileSettings}
          />
        </div>
      </header>

      {/* Mobile search overlay */}
      {mobileSearchOpen && (
        <div className="md:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-2 py-2">
          <SearchBox
            zones={project.zones}
            conduits={project.conduits}
            onSelectZone={(zone) => { selectZone(zone); setMobileSearchOpen(false); }}
            onSelectConduit={(conduit) => { selectConduit(conduit); setMobileSearchOpen(false); }}
          />
        </div>
      )}

      {/* Toolbar */}
      <Toolbar
        onAddZone={dialogActions.openAddZone}
        onAddConduit={dialogActions.openAddConduit}
        onSave={save}
        onValidate={handleValidate}
        onRearrange={handleRearrangeLayout}
        onUndo={undo}
        onRedo={redo}
        onProjectSettings={dialogActions.openProjectSettings}
        onGenerateFirewall={() => dialogActions.openGenerate('firewall')}
        onGenerateReport={() => dialogActions.openGenerate('report')}
        onExport={dialogActions.openExportDialog}
        onComplianceDashboard={dialogActions.openComplianceDashboard}
        onComplianceSettings={dialogActions.openComplianceSettings}
        onCSVImport={dialogActions.openCSVImport}
        onRiskDashboard={dialogActions.openRiskDashboard}
        onAssetInventory={dialogActions.openAssetTable}
        onShare={canEdit ? dialogActions.openShareDialog : undefined}
        onNmapImport={dialogActions.openNmapImport}
        onToggleRiskOverlay={toggleRiskOverlay}
        riskOverlayEnabled={riskOverlayEnabled}
        canUndo={canUndo}
        canRedo={canRedo}
        saving={saving}
        hasChanges={hasChanges}
        apiConnected={true}
        currentFileName={project.project.name}
        zoneCount={project.zones.length}
        copiedZone={!!copiedZone}
        onPaste={handlePasteZone}
        viewMode={viewMode}
        onToggleViewMode={toggleViewMode}
        isValidating={isValidating}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative">
          {viewMode === '2d' ? (
            <ReactFlowProvider>
              <ZoneEditor
                project={project}
                selectedZone={selectedZone}
                selectedConduit={selectedConduit}
                onSelectZone={selectZone}
                onSelectConduit={selectConduit}
                onConnect={canEdit ? handleConnect : undefined}
                onContextMenu={canEdit ? dialogActions.openContextMenu : undefined}
                onExportContextReady={setExportContext}
                onEditZone={canEdit ? dialogActions.openEditZone : undefined}
                onEditConduit={canEdit ? dialogActions.openEditConduit : undefined}
                onZonePositionsChange={canEdit ? handleZonePositionsChange : undefined}
                rearrangeKey={rearrangeKey}
                validationResults={validationResults}
                policyViolations={policyViolations}
                riskOverlayEnabled={riskOverlayEnabled}
                zoneRisks={riskOverlayEnabled ? computeZoneRisks(project) : undefined}
                remoteSelections={remoteSelections}
                onSelectionChange={setMultiSelectedZoneIds}
              />
            </ReactFlowProvider>
          ) : (
            <Suspense fallback={
              <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                <div className="text-center">
                  <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <div className="text-sm text-gray-500 dark:text-gray-400">Loading 3D View...</div>
                </div>
              </div>
            }>
              <Zone3DEditor
                project={project}
                selectedZone={selectedZone}
                selectedConduit={selectedConduit}
                onSelectZone={selectZone}
                onSelectConduit={selectConduit}
              />
            </Suspense>
          )}
        </div>

        {/* Desktop inline panel (lg+) */}
        <PropertiesPanel
          selectedZone={selectedZone}
          selectedConduit={selectedConduit}
          validationResults={validationResults}
          policyViolations={policyViolations}
          project={project}
          onClose={clearSelection}
          onDeleteZone={canEdit ? handleDeleteZone : undefined}
          onEditZone={canEdit ? dialogActions.openEditZone : undefined}
          onDeleteConduit={canEdit ? handleDeleteConduit : undefined}
          onEditConduit={canEdit ? dialogActions.openEditConduit : undefined}
          onAddAsset={canEdit ? dialogActions.openAddAsset : undefined}
          onDeleteAsset={canEdit ? handleDeleteAsset : undefined}
          onSelectZone={selectZone}
          onSelectConduit={selectConduit}
          onQuickFix={canEdit ? handleQuickFix : undefined}
          onInlineUpdateZone={canEdit ? handleInlineUpdateZone : undefined}
          onInlineUpdateConduit={canEdit ? handleInlineUpdateConduit : undefined}
          remoteEditors={remoteSelections}
          multiSelectedZoneIds={multiSelectedZoneIds}
          onBulkDeleteZones={canEdit ? handleBulkDeleteZones : undefined}
          onBulkUpdateZones={canEdit ? handleBulkUpdateZones : undefined}
          apiConnected={true}
        />

        {/* Mobile/tablet overlay panel (<lg) */}
        {propertiesPanelOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/30 z-30 lg:hidden"
              onClick={() => setPropertiesPanelOpen(false)}
            />
            <PropertiesPanel
              selectedZone={selectedZone}
              selectedConduit={selectedConduit}
              validationResults={validationResults}
              policyViolations={policyViolations}
              project={project}
              onClose={clearSelection}
              onDeleteZone={canEdit ? handleDeleteZone : undefined}
              onEditZone={canEdit ? dialogActions.openEditZone : undefined}
              onDeleteConduit={canEdit ? handleDeleteConduit : undefined}
              onEditConduit={canEdit ? dialogActions.openEditConduit : undefined}
              onAddAsset={canEdit ? dialogActions.openAddAsset : undefined}
              onDeleteAsset={canEdit ? handleDeleteAsset : undefined}
              onSelectZone={selectZone}
              onSelectConduit={selectConduit}
              onQuickFix={canEdit ? handleQuickFix : undefined}
              onInlineUpdateZone={canEdit ? handleInlineUpdateZone : undefined}
              onInlineUpdateConduit={canEdit ? handleInlineUpdateConduit : undefined}
              remoteEditors={remoteSelections}
              multiSelectedZoneIds={multiSelectedZoneIds}
              onBulkDeleteZones={canEdit ? handleBulkDeleteZones : undefined}
              onBulkUpdateZones={canEdit ? handleBulkUpdateZones : undefined}
              apiConnected={true}
              isOverlay={true}
              onPanelClose={() => setPropertiesPanelOpen(false)}
            />
          </>
        )}
      </div>

      {/* Dialogs (lazy-loaded) */}
      <Suspense fallback={null}>
      {dialogs.showAddZone && canEdit && (
        <AddZoneDialog
          existingZones={project.zones}
          onAdd={handleAddZone}
          onCancel={dialogActions.closeAddZone}
        />
      )}

      {dialogs.editingZone && canEdit && (
        <AddZoneDialog
          existingZones={project.zones}
          onAdd={handleUpdateZone}
          onCancel={dialogActions.closeEditZone}
          editZone={dialogs.editingZone}
        />
      )}

      {dialogs.showAddConduit && canEdit && (
        <AddConduitDialog
          zones={project.zones}
          existingConduits={project.conduits}
          onAdd={handleAddConduit}
          onCancel={dialogActions.closeAddConduit}
        />
      )}

      {dialogs.pendingConnection && canEdit && (
        <AddConduitDialog
          zones={project.zones}
          existingConduits={project.conduits}
          onAdd={handleAddConduit}
          onCancel={() => dialogActions.setPendingConnection(null)}
          initialFromZone={dialogs.pendingConnection.from}
          initialToZone={dialogs.pendingConnection.to}
        />
      )}

      {dialogs.editingConduit && canEdit && (
        <AddConduitDialog
          zones={project.zones}
          existingConduits={project.conduits}
          onAdd={handleUpdateConduit}
          onCancel={dialogActions.closeEditConduit}
          editConduit={dialogs.editingConduit}
        />
      )}

      {dialogs.showAddAsset && canEdit && (
        <AddAssetDialog
          zone={dialogs.showAddAsset}
          onAdd={handleAddAsset}
          onCancel={dialogActions.closeAddAsset}
        />
      )}

      {dialogs.showValidationResults && (
        <ValidationResultsDialog
          validationResults={validationResults}
          policyViolations={policyViolations}
          project={project}
          onClose={dialogActions.closeValidationResults}
        />
      )}

      {dialogs.showProjectSettings && canEdit && (
        <ProjectSettingsDialog
          metadata={project.project}
          onSave={handleUpdateProjectMetadata}
          onCancel={dialogActions.closeProjectSettings}
        />
      )}

      {dialogs.generateType && (
        <GenerateOutputDialog
          project={project}
          generator={dialogs.generateType}
          onClose={dialogActions.closeGenerate}
        />
      )}

      {dialogs.showComplianceDashboard && (
        <ComplianceDashboard
          project={project}
          validationResults={validationResults}
          policyViolations={policyViolations}
          onClose={dialogActions.closeComplianceDashboard}
        />
      )}

      {dialogs.showCSVImport && canEdit && (
        <CSVImportDialog
          existingZones={project.zones}
          onImport={handleCSVImport}
          onCancel={dialogActions.closeCSVImport}
        />
      )}

      {dialogs.showExportDialog && (
        <ExportDialog
          project={project}
          onClose={dialogActions.closeExportDialog}
          flowViewport={exportContext?.viewport}
          getNodesBounds={exportContext?.getNodesBounds}
        />
      )}

      {dialogs.showRiskDashboard && (
        <RiskDashboard
          project={project}
          onClose={dialogActions.closeRiskDashboard}
        />
      )}

      {dialogs.showAssetTable && (
        <AssetTable
          project={project}
          onClose={dialogActions.closeAssetTable}
          onUpdateAsset={canEdit ? handleUpdateAsset : undefined}
          onDeleteAsset={canEdit ? handleDeleteAsset : undefined}
          onAddAsset={canEdit ? (zoneId, asset) => {
            if (!project) return;
            updateProject({
              ...project,
              zones: project.zones.map(z =>
                z.id === zoneId ? { ...z, assets: [...z.assets, asset] } : z
              ),
            });
          } : undefined}
        />
      )}

      {dialogs.showTeamManagement && (
        <TeamManagementDialog onClose={dialogActions.closeTeamManagement} />
      )}

      {dialogs.showShareDialog && canEdit && (
        <ShareProjectDialog
          projectId={projectId}
          projectName={project.project.name}
          onClose={dialogActions.closeShareDialog}
        />
      )}

      {dialogs.showNmapImport && canEdit && (
        <NmapImportDialog
          projectId={projectId}
          zones={project.zones}
          onClose={dialogActions.closeNmapImport}
          onImportComplete={() => {
            projectHook.reload();
            dialogActions.closeNmapImport();
          }}
        />
      )}

      {dialogs.showProfileSettings && (
        <UserSettingsDialog onClose={dialogActions.closeProfileSettings} />
      )}

      {dialogs.showKeyboardShortcuts && (
        <KeyboardShortcutsDialog onClose={dialogActions.closeKeyboardShortcuts} />
      )}

      {dialogs.showComplianceSettings && (
        <ComplianceSettingsDialog
          enabledStandards={project.project.compliance_standards || ['IEC62443']}
          onClose={dialogActions.closeComplianceSettings}
        />
      )}
      </Suspense>

      {dialogs.contextMenu && (
        <ContextMenu
          x={dialogs.contextMenu.x}
          y={dialogs.contextMenu.y}
          items={getContextMenuItems()}
          onClose={dialogActions.closeContextMenu}
        />
      )}
    </div>
  );
}
