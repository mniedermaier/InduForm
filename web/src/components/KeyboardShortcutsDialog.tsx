import { memo } from 'react';
import DialogShell from './DialogShell';

interface KeyboardShortcutsDialogProps {
  onClose: () => void;
}

interface ShortcutCategory {
  title: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';

const shortcutCategories: ShortcutCategory[] = [
  {
    title: 'File Operations',
    shortcuts: [
      { keys: [modKey, 'S'], description: 'Save project' },
      { keys: [modKey, 'Shift', 'S'], description: 'Save project as...' },
      { keys: [modKey, 'N'], description: 'New project' },
      { keys: [modKey, 'O'], description: 'Open project' },
      { keys: [modKey, 'E'], description: 'Export project' },
    ],
  },
  {
    title: 'Edit Operations',
    shortcuts: [
      { keys: [modKey, 'Z'], description: 'Undo' },
      { keys: [modKey, 'Y'], description: 'Redo' },
      { keys: [modKey, 'Shift', 'Z'], description: 'Redo (alternative)' },
      { keys: [modKey, 'C'], description: 'Copy selected zone' },
      { keys: [modKey, 'V'], description: 'Paste zone' },
      { keys: ['Delete'], description: 'Delete selected item' },
      { keys: ['Backspace'], description: 'Delete selected item' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Escape'], description: 'Close dialog / Deselect' },
      { keys: ['F5'], description: 'Validate project' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
    ],
  },
];

function KeyboardShortcutsDialog({ onClose }: KeyboardShortcutsDialogProps) {
  return (
    <DialogShell title="Keyboard Shortcuts" onClose={onClose} maxWidth="max-w-lg">
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-4rem)]">
          {shortcutCategories.map((category, categoryIndex) => (
            <div key={categoryIndex} className={categoryIndex > 0 ? 'mt-6' : ''}>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">{category.title}</h3>
              <div className="space-y-2">
                {category.shortcuts.map((shortcut, shortcutIndex) => (
                  <div
                    key={shortcutIndex}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <span key={keyIndex}>
                          <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-600 shadow-sm">
                            {key}
                          </kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="text-gray-400 dark:text-gray-500 mx-0.5">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded border border-gray-300 dark:border-gray-600">?</kbd> to toggle this dialog
          </p>
        </div>
    </DialogShell>
  );
}

export default memo(KeyboardShortcutsDialog);
