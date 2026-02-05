import { useEffect, useCallback } from 'react';
import type { Zone, Conduit } from '../types/models';

export interface KeyboardShortcutHandlers {
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onNew?: () => void;
  onOpen?: () => void;
  onExport?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onDelete?: () => void;
  onEscape?: () => boolean; // Returns true if handled
  onValidate?: () => void;
}

export interface KeyboardShortcutState {
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
  canCopy: boolean;
  canPaste: boolean;
  canDelete: boolean;
  apiConnected: boolean;
  selectedZone?: Zone;
  selectedConduit?: Conduit;
  copiedZone?: Zone | null;
}

export function useKeyboardShortcuts(
  handlers: KeyboardShortcutHandlers,
  state: KeyboardShortcutState
): void {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Ignore if typing in an input field
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    // Ctrl/Cmd + Z - Undo
    if (modifier && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (state.canUndo && handlers.onUndo) handlers.onUndo();
      return;
    }

    // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z - Redo
    if ((modifier && e.key === 'y') || (modifier && e.key === 'z' && e.shiftKey)) {
      e.preventDefault();
      if (state.canRedo && handlers.onRedo) handlers.onRedo();
      return;
    }

    // Ctrl/Cmd + S - Save
    if (modifier && e.key === 's' && !e.shiftKey) {
      e.preventDefault();
      if (state.canSave && handlers.onSave) handlers.onSave();
      return;
    }

    // Ctrl/Cmd + Shift + S - Save As
    if (modifier && e.key === 's' && e.shiftKey) {
      e.preventDefault();
      if (state.apiConnected && handlers.onSaveAs) handlers.onSaveAs();
      return;
    }

    // Ctrl/Cmd + N - New
    if (modifier && e.key === 'n') {
      e.preventDefault();
      if (state.apiConnected && handlers.onNew) handlers.onNew();
      return;
    }

    // Ctrl/Cmd + O - Open
    if (modifier && e.key === 'o') {
      e.preventDefault();
      if (state.apiConnected && handlers.onOpen) handlers.onOpen();
      return;
    }

    // Ctrl/Cmd + E - Export
    if (modifier && e.key === 'e') {
      e.preventDefault();
      if (handlers.onExport) handlers.onExport();
      return;
    }

    // Ctrl/Cmd + C - Copy
    if (modifier && e.key === 'c') {
      if (state.selectedZone && handlers.onCopy) {
        e.preventDefault();
        handlers.onCopy();
      }
      return;
    }

    // Ctrl/Cmd + V - Paste
    if (modifier && e.key === 'v') {
      if (state.copiedZone && state.apiConnected && handlers.onPaste) {
        e.preventDefault();
        handlers.onPaste();
      }
      return;
    }

    // Delete or Backspace - Delete selected item
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if ((state.selectedZone || state.selectedConduit) && handlers.onDelete) {
        e.preventDefault();
        handlers.onDelete();
      }
      return;
    }

    // Escape - Close dialogs/deselect
    if (e.key === 'Escape') {
      if (handlers.onEscape) {
        const handled = handlers.onEscape();
        if (handled) e.preventDefault();
      }
      return;
    }

    // F5 - Validate
    if (e.key === 'F5') {
      e.preventDefault();
      if (state.apiConnected && handlers.onValidate) handlers.onValidate();
      return;
    }
  }, [handlers, state]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
