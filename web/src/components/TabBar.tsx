import { memo } from 'react';

export interface TabInfo {
  id: string;
  fileName: string;
  projectName: string;
  hasChanges: boolean;
  filePath: string;
}

interface TabBarProps {
  tabs: TabInfo[];
  activeTabId: string;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
}

const TabBar = memo(({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
}: TabBarProps) => {
  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onCloseTab(tabId);
  };

  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700 overflow-x-auto overflow-y-hidden scrollbar-none">
      <div className="flex items-center min-w-0 flex-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`
              group flex items-center gap-2 px-4 py-2 text-sm border-r border-gray-300 dark:border-gray-700
              min-w-[120px] max-w-[200px] transition-colors
              ${activeTabId === tab.id
                ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-b-2 border-b-blue-500 -mb-px'
                : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }
            `}
          >
            <div className="flex-1 min-w-0 text-left">
              <div className="truncate font-medium">
                {tab.projectName}
                {tab.hasChanges && <span className="text-orange-500 ml-1">*</span>}
              </div>
              <div className="truncate text-xs text-gray-400 dark:text-gray-500">{tab.fileName}</div>
            </div>
            <button
              onClick={(e) => handleClose(e, tab.id)}
              className={`
                p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors
                ${tab.hasChanges ? 'text-orange-500' : 'text-gray-400'}
                opacity-0 group-hover:opacity-100
                ${activeTabId === tab.id ? 'opacity-100' : ''}
              `}
              title={tab.hasChanges ? 'Close (unsaved changes)' : 'Close'}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </button>
        ))}
      </div>

      {/* Add tab button */}
      <button
        onClick={onAddTab}
        className="flex items-center justify-center w-8 h-8 mx-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        title="Open project"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
});

TabBar.displayName = 'TabBar';

export default TabBar;
