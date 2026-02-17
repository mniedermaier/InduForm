import { memo, useState, useRef, useEffect, type ReactNode } from 'react';
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
  onAutoLayout?: () => void;
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
  onYamlImport?: () => void;
  onVersionHistory?: () => void;
  onAnalytics?: () => void;
  onVulnerabilities?: () => void;
  onAttackPaths?: () => void;
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
  icon?: ReactNode;
}

interface DropdownMenuProps {
  label: string;
  icon?: ReactNode;
  items: DropdownItem[];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

function DropdownMenu({ label, icon, items, isOpen, onToggle, onClose }: DropdownMenuProps) {
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
        className={`px-3 py-1 text-sm rounded hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-200 flex items-center gap-1.5 ${
          isOpen ? 'bg-gray-200 dark:bg-gray-700' : ''
        }`}
      >
        {icon && <span className="w-4 h-4 opacity-70">{icon}</span>}
        {label}
      </button>
      {isOpen && (
        <div role="menu" aria-label={label} className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[200px] z-50">
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
                <span className="flex items-center gap-2">
                  {item.icon && <span className="w-4 h-4 opacity-60 flex-shrink-0">{item.icon}</span>}
                  {item.label}
                </span>
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

// Vertical divider between menu groups
function MenuDivider() {
  return <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />;
}

// Menu bar icons (small inline SVGs)
const icons = {
  file: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  edit: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  plus: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
    </svg>
  ),
  analyze: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  generate: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  view: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
};

const Toolbar = memo(({
  onAddZone,
  onAddConduit,
  onSave,
  onValidate,
  onNewFile,
  onOpenFile,
  onSaveAs,
  onRearrange,
  onAutoLayout,
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
  onYamlImport,
  onVersionHistory,
  onAnalytics,
  onVulnerabilities,
  onAttackPaths,
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

  const fileItems: DropdownItem[] = [
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
    { label: 'Import from YAML...', onClick: onYamlImport || (() => {}), disabled: !onYamlImport || !apiConnected },
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
    { label: 'Auto Layout (Purdue)', onClick: onAutoLayout || (() => {}), disabled: zoneCount < 2 || !onAutoLayout, shortcut: 'Ctrl+L' },
  ];

  const addItems: DropdownItem[] = [
    { label: 'Zone', onClick: onAddZone, disabled: !apiConnected },
    { label: 'Conduit', onClick: onAddConduit, disabled: !apiConnected },
  ];

  const analyzeItems: DropdownItem[] = [
    { label: 'Validate', onClick: onValidate, disabled: !apiConnected, shortcut: 'F5' },
    { label: 'Risk Assessment', onClick: onRiskDashboard || (() => {}), disabled: !onRiskDashboard },
    { label: 'Attack Paths', onClick: onAttackPaths || (() => {}), disabled: !onAttackPaths },
    { label: '', onClick: () => {}, divider: true },
    { label: 'Gap Analysis Dashboard', onClick: onComplianceDashboard || (() => {}), disabled: !onComplianceDashboard },
    { label: 'Compliance Settings...', onClick: onComplianceSettings || (() => {}), disabled: !onComplianceSettings },
    { label: '', onClick: () => {}, divider: true },
    { label: 'Vulnerabilities', onClick: onVulnerabilities || (() => {}), disabled: !onVulnerabilities },
  ];

  const generateItems: DropdownItem[] = [
    { label: 'Firewall Rules', onClick: onGenerateFirewall || (() => {}), disabled: !apiConnected || !onGenerateFirewall },
    { label: 'PDF Report', onClick: onExport || (() => {}), disabled: !onExport },
    { label: 'Text Summary Report', onClick: onGenerateReport || (() => {}), disabled: !apiConnected || !onGenerateReport },
  ];

  const viewItems: DropdownItem[] = [
    { label: viewMode === '2d' ? '3D View' : '2D View', onClick: onToggleViewMode || (() => {}), disabled: !onToggleViewMode, shortcut: 'Ctrl+3' },
    { label: '', onClick: () => {}, divider: true },
    { label: riskOverlayEnabled ? 'Hide Risk Overlay' : 'Show Risk Overlay', onClick: onToggleRiskOverlay || (() => {}), disabled: !onToggleRiskOverlay },
    { label: 'Analytics', onClick: onAnalytics || (() => {}), disabled: !onAnalytics },
    { label: 'Asset Inventory', onClick: onAssetInventory || (() => {}), disabled: !onAssetInventory },
    { label: '', onClick: () => {}, divider: true },
    { label: theme === 'dark' ? 'Light Mode' : 'Dark Mode', onClick: toggleTheme },
  ];

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // All menu groups for mobile slide-out
  const mobileMenuGroups = [
    { label: 'File', items: fileItems },
    { label: 'Edit', items: editItems },
    { label: 'Add', items: addItems },
    { label: 'Analyze', items: analyzeItems },
    { label: 'Generate', items: generateItems },
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
        {/* File + Edit group */}
        <DropdownMenu
          label="File"
          icon={icons.file}
          items={fileItems}
          isOpen={openMenu === 'file'}
          onToggle={() => handleToggle('file')}
          onClose={handleClose}
        />
        <DropdownMenu
          label="Edit"
          icon={icons.edit}
          items={editItems}
          isOpen={openMenu === 'edit'}
          onToggle={() => handleToggle('edit')}
          onClose={handleClose}
        />

        <MenuDivider />

        {/* Add group */}
        <DropdownMenu
          label="Add"
          icon={icons.plus}
          items={addItems}
          isOpen={openMenu === 'add'}
          onToggle={() => handleToggle('add')}
          onClose={handleClose}
        />

        <MenuDivider />

        {/* Analyze + Generate group */}
        <DropdownMenu
          label="Analyze"
          icon={icons.analyze}
          items={analyzeItems}
          isOpen={openMenu === 'analyze'}
          onToggle={() => handleToggle('analyze')}
          onClose={handleClose}
        />
        <DropdownMenu
          label="Generate"
          icon={icons.generate}
          items={generateItems}
          isOpen={openMenu === 'generate'}
          onToggle={() => handleToggle('generate')}
          onClose={handleClose}
        />

        <MenuDivider />

        {/* View group */}
        <DropdownMenu
          label="View"
          icon={icons.view}
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
