import { memo, useState, useRef, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

interface ToolbarProps {
  onAddZone: () => void;
  onAddConduit: () => void;
  onSave: () => void;
  onValidate: () => void;
  onNewFile?: () => void;
  onOpenFile?: () => void;
  onSaveAs?: () => void;
  onRearrange: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onProjectSettings?: () => void;
  onGenerateFirewall?: () => void;
  onGenerateReport?: () => void;
  onExport?: () => void;
  onOpenRecent?: (filePath: string) => void;
  onComplianceDashboard?: () => void;
  onComplianceSettings?: () => void;
  onCSVImport?: () => void;
  onRiskDashboard?: () => void;
  onNewFromTemplate?: () => void;
  onAssetInventory?: () => void;
  onShare?: () => void;
  onNmapImport?: () => void;
  onVersionHistory?: () => void;
  onToggleRiskOverlay?: () => void;
  riskOverlayEnabled?: boolean;
  versionCount?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  saving: boolean;
  hasChanges: boolean;
  apiConnected: boolean;
  currentFileName?: string;
  zoneCount: number;
  recentFiles?: string[];
  copiedZone?: boolean;
  onPaste?: () => void;
  viewMode?: '2d' | '3d';
  onToggleViewMode?: () => void;
  isValidating?: boolean;
}

interface DropdownItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  shortcut?: string;
  divider?: boolean;
}

interface DropdownMenuProps {
  label: string;
  items: DropdownItem[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

function DropdownMenu({ label, items, isOpen, onToggle, onClose }: DropdownMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={`px-3 py-1 text-sm rounded hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-200 ${
          isOpen ? 'bg-gray-200 dark:bg-gray-700' : ''
        }`}
      >
        {label}
      </button>
      {isOpen && (
        <div role="menu" aria-label={label} className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[180px] z-50">
          {items.map((item, index) => (
            item.divider ? (
              <div key={index} className="border-t border-gray-200 dark:border-gray-700 my-1" />
            ) : (
              <button
                key={index}
                role="menuitem"
                onClick={() => {
                  if (!item.disabled) {
                    item.onClick();
                    onClose();
                  }
                }}
                disabled={item.disabled}
                className={`w-full px-3 py-2 md:py-1.5 text-sm text-left flex items-center justify-between
                  ${item.disabled
                    ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
              >
                <span>{item.label}</span>
                {item.shortcut && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 ml-4">{item.shortcut}</span>
                )}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  );
}

const Toolbar = memo(({
  onAddZone,
  onAddConduit,
  onSave,
  onValidate,
  onNewFile,
  onOpenFile,
  onSaveAs,
  onRearrange,
  onUndo,
  onRedo,
  onProjectSettings,
  onGenerateFirewall,
  onGenerateReport,
  onExport,
  onOpenRecent,
  onComplianceDashboard,
  onComplianceSettings,
  onCSVImport,
  onRiskDashboard,
  onNewFromTemplate,
  onAssetInventory,
  onShare,
  onNmapImport,
  onVersionHistory,
  onToggleRiskOverlay,
  riskOverlayEnabled = false,
  versionCount = 0,
  canUndo = false,
  canRedo = false,
  saving,
  hasChanges,
  apiConnected,
  currentFileName,
  zoneCount,
  recentFiles = [],
  copiedZone = false,
  onPaste,
  viewMode = '2d',
  onToggleViewMode,
  isValidating = false,
}: ToolbarProps) => {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  const handleToggle = (menu: string) => {
    setOpenMenu(openMenu === menu ? null : menu);
  };

  const handleClose = () => {
    setOpenMenu(null);
  };

  const projectItems: DropdownItem[] = [
    ...(onNewFile ? [{ label: 'New Project', onClick: onNewFile, disabled: !apiConnected, shortcut: 'Ctrl+N' }] : []),
    { label: 'New from Template...', onClick: onNewFromTemplate || (() => {}), disabled: !apiConnected || !onNewFromTemplate },
    ...(onOpenFile ? [{ label: 'Open...', onClick: onOpenFile, disabled: !apiConnected, shortcut: 'Ctrl+O' }] : []),
    ...(recentFiles.length > 0 ? [
      { label: '', onClick: () => {}, divider: true },
      ...recentFiles.slice(0, 5).map(f => ({
        label: f.split('/').pop() || f,
        onClick: () => onOpenRecent?.(f),
        disabled: !apiConnected || !onOpenRecent,
      })),
    ] : []),
    { label: '', onClick: () => {}, divider: true },
    { label: 'Save', onClick: onSave, disabled: !apiConnected || saving || !hasChanges, shortcut: 'Ctrl+S' },
    ...(onSaveAs ? [{ label: 'Save As...', onClick: onSaveAs, disabled: !apiConnected, shortcut: 'Ctrl+Shift+S' }] : []),
    { label: '', onClick: () => {}, divider: true },
    { label: 'Export...', onClick: onExport || (() => {}), disabled: !onExport, shortcut: 'Ctrl+E' },
    { label: 'Import from CSV...', onClick: onCSVImport || (() => {}), disabled: !onCSVImport },
    { label: 'Import from Nmap...', onClick: onNmapImport || (() => {}), disabled: !onNmapImport || !apiConnected },
    { label: '', onClick: () => {}, divider: true },
    { label: 'Share...', onClick: onShare || (() => {}), disabled: !onShare || !apiConnected },
    { label: `Version History${versionCount > 0 ? ` (${versionCount})` : ''}`, onClick: onVersionHistory || (() => {}), disabled: !onVersionHistory || !apiConnected },
    { label: 'Project Settings...', onClick: onProjectSettings || (() => {}), disabled: !apiConnected || !onProjectSettings },
  ];

  const editItems: DropdownItem[] = [
    { label: 'Undo', onClick: onUndo || (() => {}), disabled: !canUndo, shortcut: 'Ctrl+Z' },
    { label: 'Redo', onClick: onRedo || (() => {}), disabled: !canRedo, shortcut: 'Ctrl+Y' },
    { label: '', onClick: () => {}, divider: true },
    { label: 'Paste Zone', onClick: onPaste || (() => {}), disabled: !copiedZone || !onPaste, shortcut: 'Ctrl+V' },
    { label: '', onClick: () => {}, divider: true },
    { label: 'Rearrange Layout', onClick: onRearrange, disabled: zoneCount < 2 },
  ];

  const addItems: DropdownItem[] = [
    { label: 'Zone', onClick: onAddZone, disabled: !apiConnected },
    { label: 'Conduit', onClick: onAddConduit, disabled: !apiConnected },
  ];

  const toolsItems: DropdownItem[] = [
    { label: 'Validate', onClick: onValidate, disabled: !apiConnected, shortcut: 'F5' },
    { label: 'Compliance Dashboard', onClick: onComplianceDashboard || (() => {}), disabled: !onComplianceDashboard },
    { label: 'Compliance Settings...', onClick: onComplianceSettings || (() => {}), disabled: !onComplianceSettings },
    { label: 'Risk Assessment', onClick: onRiskDashboard || (() => {}), disabled: !onRiskDashboard },
    { label: 'Asset Inventory', onClick: onAssetInventory || (() => {}), disabled: !onAssetInventory },
    { label: '', onClick: () => {}, divider: true },
    { label: 'Generate Firewall Rules', onClick: onGenerateFirewall || (() => {}), disabled: !apiConnected || !onGenerateFirewall },
    { label: 'Generate Compliance Report', onClick: onGenerateReport || (() => {}), disabled: !apiConnected || !onGenerateReport },
  ];

  const viewItems: DropdownItem[] = [
    { label: viewMode === '2d' ? '3D View' : '2D View', onClick: onToggleViewMode || (() => {}), disabled: !onToggleViewMode, shortcut: 'Ctrl+3' },
    { label: '', onClick: () => {}, divider: true },
    { label: riskOverlayEnabled ? 'Hide Risk Overlay' : 'Show Risk Overlay', onClick: onToggleRiskOverlay || (() => {}), disabled: !onToggleRiskOverlay },
    { label: '', onClick: () => {}, divider: true },
    { label: theme === 'dark' ? 'Light Mode' : 'Dark Mode', onClick: toggleTheme },
  ];

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // All menu groups for mobile slide-out
  const mobileMenuGroups = [
    { label: 'Project', items: projectItems },
    { label: 'Edit', items: editItems },
    { label: 'Add', items: addItems },
    { label: 'Tools', items: toolsItems },
    { label: 'View', items: viewItems },
  ];

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      {/* Hamburger button — visible on <md */}
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="p-2 md:hidden text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
        aria-label="Open menu"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile slide-out menu */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed left-0 top-0 h-full w-64 bg-white dark:bg-gray-800 shadow-xl z-50 overflow-y-auto md:hidden">
            <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
              <span className="font-semibold text-gray-800 dark:text-gray-100">Menu</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Close menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {mobileMenuGroups.map((group) => (
              <div key={group.label} className="border-b border-gray-100 dark:border-gray-700">
                <div className="px-3 pt-3 pb-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {group.label}
                </div>
                {group.items.map((item, index) => (
                  item.divider ? (
                    <div key={index} className="border-t border-gray-100 dark:border-gray-700 my-1" />
                  ) : (
                    <button
                      key={index}
                      onClick={() => {
                        if (!item.disabled) {
                          item.onClick();
                          setMobileMenuOpen(false);
                        }
                      }}
                      disabled={item.disabled}
                      className={`w-full px-4 py-2.5 text-sm text-left flex items-center justify-between
                        ${item.disabled
                          ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 ml-4">{item.shortcut}</span>
                      )}
                    </button>
                  )
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Desktop menu bar — hidden on <md */}
      <div className="hidden md:flex items-center gap-1">
        <DropdownMenu
          label="Project"
          items={projectItems}
          isOpen={openMenu === 'project'}
          onToggle={() => handleToggle('project')}
          onClose={handleClose}
        />
        <DropdownMenu
          label="Edit"
          items={editItems}
          isOpen={openMenu === 'edit'}
          onToggle={() => handleToggle('edit')}
          onClose={handleClose}
        />
        <DropdownMenu
          label="Add"
          items={addItems}
          isOpen={openMenu === 'add'}
          onToggle={() => handleToggle('add')}
          onClose={handleClose}
        />
        <DropdownMenu
          label="Tools"
          items={toolsItems}
          isOpen={openMenu === 'tools'}
          onToggle={() => handleToggle('tools')}
          onClose={handleClose}
        />
        <DropdownMenu
          label="View"
          items={viewItems}
          isOpen={openMenu === 'view'}
          onToggle={() => handleToggle('view')}
          onClose={handleClose}
        />
      </div>

      <div className="flex-1" />

      {/* Validating indicator */}
      {isValidating && (
        <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 px-2">
          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="hidden sm:inline">Validating...</span>
        </div>
      )}

      {/* Current file indicator */}
      {currentFileName && (
        <div className="hidden sm:block text-xs text-gray-500 dark:text-gray-400 px-2">
          {currentFileName}
          {hasChanges && ' *'}
        </div>
      )}
    </div>
  );
});

Toolbar.displayName = 'Toolbar';

export default Toolbar;
