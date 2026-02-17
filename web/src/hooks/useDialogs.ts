import { useState, useCallback, useMemo } from 'react';
import type { Zone, Conduit } from '../types/models';
import type { ContextMenuEvent } from '../components/ZoneEditor';

export type FileDialogMode = 'open' | 'new' | 'save-as' | null;
export type GenerateType = 'firewall' | 'vlan' | 'report' | null;

export interface DialogState {
  showAddZone: boolean;
  showAddConduit: boolean;
  showAddAsset: Zone | null;
  fileDialogMode: FileDialogMode;
  pendingConnection: { from: string; to: string } | null;
  editingConduit: Conduit | null;
  editingZone: Zone | null;
  contextMenu: ContextMenuEvent | null;
  showValidationResults: boolean;
  showProjectSettings: boolean;
  generateType: GenerateType;
  showComplianceDashboard: boolean;
  showCSVImport: boolean;
  showExportDialog: boolean;
  showRiskDashboard: boolean;
  showTemplateSelector: boolean;
  showAssetTable: boolean;
  showShareDialog: boolean;
  showTeamManagement: boolean;
  showNmapImport: boolean;
  showProfileSettings: boolean;
  showKeyboardShortcuts: boolean;
  showVersionHistory: boolean;
  showComplianceSettings: boolean;
  showAnalytics: boolean;
  showVulnerabilities: boolean;
  showAttackPaths: boolean;
}

export interface DialogActions {
  openAddZone: () => void;
  closeAddZone: () => void;
  openAddConduit: () => void;
  closeAddConduit: () => void;
  openAddAsset: (zone: Zone) => void;
  closeAddAsset: () => void;
  openFileDialog: (mode: FileDialogMode) => void;
  closeFileDialog: () => void;
  setPendingConnection: (connection: { from: string; to: string } | null) => void;
  openEditConduit: (conduit: Conduit) => void;
  closeEditConduit: () => void;
  openEditZone: (zone: Zone) => void;
  closeEditZone: () => void;
  openContextMenu: (event: ContextMenuEvent) => void;
  closeContextMenu: () => void;
  openValidationResults: () => void;
  closeValidationResults: () => void;
  openProjectSettings: () => void;
  closeProjectSettings: () => void;
  openGenerate: (type: GenerateType) => void;
  closeGenerate: () => void;
  openComplianceDashboard: () => void;
  closeComplianceDashboard: () => void;
  openCSVImport: () => void;
  closeCSVImport: () => void;
  openExportDialog: () => void;
  closeExportDialog: () => void;
  openRiskDashboard: () => void;
  closeRiskDashboard: () => void;
  openTemplateSelector: () => void;
  closeTemplateSelector: () => void;
  openAssetTable: () => void;
  closeAssetTable: () => void;
  openShareDialog: () => void;
  closeShareDialog: () => void;
  openTeamManagement: () => void;
  closeTeamManagement: () => void;
  openNmapImport: () => void;
  closeNmapImport: () => void;
  openProfileSettings: () => void;
  closeProfileSettings: () => void;
  openKeyboardShortcuts: () => void;
  closeKeyboardShortcuts: () => void;
  toggleKeyboardShortcuts: () => void;
  openVersionHistory: () => void;
  closeVersionHistory: () => void;
  openComplianceSettings: () => void;
  closeComplianceSettings: () => void;
  openAnalytics: () => void;
  closeAnalytics: () => void;
  openVulnerabilities: () => void;
  closeVulnerabilities: () => void;
  openAttackPaths: () => void;
  closeAttackPaths: () => void;
  closeAll: () => void;
  closeTopmost: () => boolean; // Returns true if something was closed
}

export function useDialogs(): [DialogState, DialogActions] {
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddConduit, setShowAddConduit] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState<Zone | null>(null);
  const [fileDialogMode, setFileDialogMode] = useState<FileDialogMode>(null);
  const [pendingConnection, setPendingConnection] = useState<{ from: string; to: string } | null>(null);
  const [editingConduit, setEditingConduit] = useState<Conduit | null>(null);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuEvent | null>(null);
  const [showValidationResults, setShowValidationResults] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [generateType, setGenerateType] = useState<GenerateType>(null);
  const [showComplianceDashboard, setShowComplianceDashboard] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showRiskDashboard, setShowRiskDashboard] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showAssetTable, setShowAssetTable] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [showNmapImport, setShowNmapImport] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showComplianceSettings, setShowComplianceSettings] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showVulnerabilities, setShowVulnerabilities] = useState(false);
  const [showAttackPaths, setShowAttackPaths] = useState(false);

  const state: DialogState = useMemo(() => ({
    showAddZone,
    showAddConduit,
    showAddAsset,
    fileDialogMode,
    pendingConnection,
    editingConduit,
    editingZone,
    contextMenu,
    showValidationResults,
    showProjectSettings,
    generateType,
    showComplianceDashboard,
    showCSVImport,
    showExportDialog,
    showRiskDashboard,
    showTemplateSelector,
    showAssetTable,
    showShareDialog,
    showTeamManagement,
    showNmapImport,
    showProfileSettings,
    showKeyboardShortcuts,
    showVersionHistory,
    showComplianceSettings,
    showAnalytics,
    showVulnerabilities,
    showAttackPaths,
  }), [
    showAddZone, showAddConduit, showAddAsset, fileDialogMode,
    pendingConnection, editingConduit, editingZone, contextMenu,
    showValidationResults, showProjectSettings, generateType,
    showComplianceDashboard, showCSVImport, showExportDialog,
    showRiskDashboard, showTemplateSelector, showAssetTable,
    showShareDialog, showTeamManagement, showNmapImport, showProfileSettings,
    showKeyboardShortcuts, showVersionHistory, showComplianceSettings,
    showAnalytics, showVulnerabilities, showAttackPaths,
  ]);

  const closeTopmost = useCallback((): boolean => {
    if (showAttackPaths) { setShowAttackPaths(false); return true; }
    if (showVulnerabilities) { setShowVulnerabilities(false); return true; }
    if (showAnalytics) { setShowAnalytics(false); return true; }
    if (showComplianceSettings) { setShowComplianceSettings(false); return true; }
    if (showKeyboardShortcuts) { setShowKeyboardShortcuts(false); return true; }
    if (showVersionHistory) { setShowVersionHistory(false); return true; }
    if (showAddZone) { setShowAddZone(false); return true; }
    if (showAddConduit) { setShowAddConduit(false); return true; }
    if (editingZone) { setEditingZone(null); return true; }
    if (editingConduit) { setEditingConduit(null); return true; }
    if (showAddAsset) { setShowAddAsset(null); return true; }
    if (fileDialogMode) { setFileDialogMode(null); return true; }
    if (showValidationResults) { setShowValidationResults(false); return true; }
    if (showExportDialog) { setShowExportDialog(false); return true; }
    if (showRiskDashboard) { setShowRiskDashboard(false); return true; }
    if (showTemplateSelector) { setShowTemplateSelector(false); return true; }
    if (showAssetTable) { setShowAssetTable(false); return true; }
    if (showShareDialog) { setShowShareDialog(false); return true; }
    if (showTeamManagement) { setShowTeamManagement(false); return true; }
    if (showNmapImport) { setShowNmapImport(false); return true; }
    if (showProfileSettings) { setShowProfileSettings(false); return true; }
    if (showProjectSettings) { setShowProjectSettings(false); return true; }
    if (generateType) { setGenerateType(null); return true; }
    if (showComplianceDashboard) { setShowComplianceDashboard(false); return true; }
    if (showCSVImport) { setShowCSVImport(false); return true; }
    if (pendingConnection) { setPendingConnection(null); return true; }
    if (contextMenu) { setContextMenu(null); return true; }
    return false;
  }, [
    showAttackPaths, showVulnerabilities, showAnalytics, showComplianceSettings, showKeyboardShortcuts,
    showVersionHistory, showAddZone, showAddConduit,
    editingZone, editingConduit,
    showAddAsset, fileDialogMode, showValidationResults, showExportDialog,
    showRiskDashboard, showTemplateSelector, showAssetTable, showShareDialog,
    showTeamManagement, showNmapImport, showProfileSettings, showProjectSettings, generateType,
    showComplianceDashboard, showCSVImport, pendingConnection, contextMenu,
  ]);

  const closeAll = useCallback(() => {
    setShowAddZone(false);
    setShowAddConduit(false);
    setShowAddAsset(null);
    setFileDialogMode(null);
    setPendingConnection(null);
    setEditingConduit(null);
    setEditingZone(null);
    setContextMenu(null);
    setShowValidationResults(false);
    setShowProjectSettings(false);
    setGenerateType(null);
    setShowComplianceDashboard(false);
    setShowCSVImport(false);
    setShowExportDialog(false);
    setShowRiskDashboard(false);
    setShowTemplateSelector(false);
    setShowAssetTable(false);
    setShowShareDialog(false);
    setShowTeamManagement(false);
    setShowNmapImport(false);
    setShowProfileSettings(false);
    setShowKeyboardShortcuts(false);
    setShowVersionHistory(false);
    setShowComplianceSettings(false);
    setShowAnalytics(false);
    setShowVulnerabilities(false);
    setShowAttackPaths(false);
  }, []);

  const actions: DialogActions = useMemo(() => ({
    openAddZone: () => setShowAddZone(true),
    closeAddZone: () => setShowAddZone(false),
    openAddConduit: () => setShowAddConduit(true),
    closeAddConduit: () => setShowAddConduit(false),
    openAddAsset: (zone: Zone) => setShowAddAsset(zone),
    closeAddAsset: () => setShowAddAsset(null),
    openFileDialog: (mode: FileDialogMode) => setFileDialogMode(mode),
    closeFileDialog: () => setFileDialogMode(null),
    setPendingConnection,
    openEditConduit: (conduit: Conduit) => setEditingConduit(conduit),
    closeEditConduit: () => setEditingConduit(null),
    openEditZone: (zone: Zone) => setEditingZone(zone),
    closeEditZone: () => setEditingZone(null),
    openContextMenu: (event: ContextMenuEvent) => setContextMenu(event),
    closeContextMenu: () => setContextMenu(null),
    openValidationResults: () => setShowValidationResults(true),
    closeValidationResults: () => setShowValidationResults(false),
    openProjectSettings: () => setShowProjectSettings(true),
    closeProjectSettings: () => setShowProjectSettings(false),
    openGenerate: (type: GenerateType) => setGenerateType(type),
    closeGenerate: () => setGenerateType(null),
    openComplianceDashboard: () => setShowComplianceDashboard(true),
    closeComplianceDashboard: () => setShowComplianceDashboard(false),
    openCSVImport: () => setShowCSVImport(true),
    closeCSVImport: () => setShowCSVImport(false),
    openExportDialog: () => setShowExportDialog(true),
    closeExportDialog: () => setShowExportDialog(false),
    openRiskDashboard: () => setShowRiskDashboard(true),
    closeRiskDashboard: () => setShowRiskDashboard(false),
    openTemplateSelector: () => setShowTemplateSelector(true),
    closeTemplateSelector: () => setShowTemplateSelector(false),
    openAssetTable: () => setShowAssetTable(true),
    closeAssetTable: () => setShowAssetTable(false),
    openShareDialog: () => setShowShareDialog(true),
    closeShareDialog: () => setShowShareDialog(false),
    openTeamManagement: () => setShowTeamManagement(true),
    closeTeamManagement: () => setShowTeamManagement(false),
    openNmapImport: () => setShowNmapImport(true),
    closeNmapImport: () => setShowNmapImport(false),
    openProfileSettings: () => setShowProfileSettings(true),
    closeProfileSettings: () => setShowProfileSettings(false),
    openKeyboardShortcuts: () => setShowKeyboardShortcuts(true),
    closeKeyboardShortcuts: () => setShowKeyboardShortcuts(false),
    toggleKeyboardShortcuts: () => setShowKeyboardShortcuts(prev => !prev),
    openVersionHistory: () => setShowVersionHistory(true),
    closeVersionHistory: () => setShowVersionHistory(false),
    openComplianceSettings: () => setShowComplianceSettings(true),
    closeComplianceSettings: () => setShowComplianceSettings(false),
    openAnalytics: () => setShowAnalytics(true),
    closeAnalytics: () => setShowAnalytics(false),
    openVulnerabilities: () => setShowVulnerabilities(true),
    closeVulnerabilities: () => setShowVulnerabilities(false),
    openAttackPaths: () => setShowAttackPaths(true),
    closeAttackPaths: () => setShowAttackPaths(false),
    closeAll,
    closeTopmost,
  }), [closeAll, closeTopmost]);

  return [state, actions];
}
