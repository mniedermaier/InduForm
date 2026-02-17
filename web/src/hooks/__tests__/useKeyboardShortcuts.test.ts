import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import type { KeyboardShortcutHandlers, KeyboardShortcutState } from '../useKeyboardShortcuts';

function fireKeyDown(key: string, opts: Partial<KeyboardEvent> = {}) {
  window.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, ...opts })
  );
}

describe('useKeyboardShortcuts', () => {
  const handlers: KeyboardShortcutHandlers = {
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onExport: vi.fn(),
    onCopy: vi.fn(),
    onPaste: vi.fn(),
    onDelete: vi.fn(),
    onEscape: vi.fn(() => true),
    onValidate: vi.fn(),
  };

  const baseState: KeyboardShortcutState = {
    canUndo: true,
    canRedo: true,
    canSave: true,
    canCopy: true,
    canPaste: true,
    canDelete: true,
    canAutoLayout: true,
    apiConnected: true,
    selectedZone: { id: 'z1', name: 'Zone 1', type: 'cell', security_level_target: 2, assets: [] },
    selectedConduit: undefined,
    copiedZone: { id: 'z-copy', name: 'Copied', type: 'cell', security_level_target: 2, assets: [] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock navigator.platform for non-Mac
    Object.defineProperty(navigator, 'platform', { value: 'Linux', configurable: true });
  });

  it('Ctrl+Z triggers undo', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('z', { ctrlKey: true });
    expect(handlers.onUndo).toHaveBeenCalledOnce();
  });

  it('Ctrl+Y triggers redo', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('y', { ctrlKey: true });
    expect(handlers.onRedo).toHaveBeenCalledOnce();
  });

  it('Ctrl+Shift+Z triggers redo', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('z', { ctrlKey: true, shiftKey: true });
    expect(handlers.onRedo).toHaveBeenCalledOnce();
  });

  it('Ctrl+S triggers save', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('s', { ctrlKey: true });
    expect(handlers.onSave).toHaveBeenCalledOnce();
  });

  it('Ctrl+Shift+S triggers save as', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('s', { ctrlKey: true, shiftKey: true });
    expect(handlers.onSaveAs).toHaveBeenCalledOnce();
  });

  it('Ctrl+N triggers new', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('n', { ctrlKey: true });
    expect(handlers.onNew).toHaveBeenCalledOnce();
  });

  it('Ctrl+O triggers open', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('o', { ctrlKey: true });
    expect(handlers.onOpen).toHaveBeenCalledOnce();
  });

  it('Ctrl+E triggers export', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('e', { ctrlKey: true });
    expect(handlers.onExport).toHaveBeenCalledOnce();
  });

  it('Ctrl+C triggers copy when zone selected', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('c', { ctrlKey: true });
    expect(handlers.onCopy).toHaveBeenCalledOnce();
  });

  it('Ctrl+C does not trigger copy when no zone selected', () => {
    renderHook(() => useKeyboardShortcuts(handlers, { ...baseState, selectedZone: undefined }));
    fireKeyDown('c', { ctrlKey: true });
    expect(handlers.onCopy).not.toHaveBeenCalled();
  });

  it('Ctrl+V triggers paste when zone is copied', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('v', { ctrlKey: true });
    expect(handlers.onPaste).toHaveBeenCalledOnce();
  });

  it('Ctrl+V does not trigger paste when no zone is copied', () => {
    renderHook(() => useKeyboardShortcuts(handlers, { ...baseState, copiedZone: null }));
    fireKeyDown('v', { ctrlKey: true });
    expect(handlers.onPaste).not.toHaveBeenCalled();
  });

  it('Delete triggers delete when something selected', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('Delete');
    expect(handlers.onDelete).toHaveBeenCalledOnce();
  });

  it('Backspace triggers delete when something selected', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('Backspace');
    expect(handlers.onDelete).toHaveBeenCalledOnce();
  });

  it('Delete does not trigger when nothing selected', () => {
    renderHook(() =>
      useKeyboardShortcuts(handlers, {
        ...baseState,
        selectedZone: undefined,
        selectedConduit: undefined,
      })
    );
    fireKeyDown('Delete');
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it('Escape triggers escape handler', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('Escape');
    expect(handlers.onEscape).toHaveBeenCalledOnce();
  });

  it('F5 triggers validate', () => {
    renderHook(() => useKeyboardShortcuts(handlers, baseState));
    fireKeyDown('F5');
    expect(handlers.onValidate).toHaveBeenCalledOnce();
  });

  it('does not fire when canUndo is false', () => {
    renderHook(() => useKeyboardShortcuts(handlers, { ...baseState, canUndo: false }));
    fireKeyDown('z', { ctrlKey: true });
    expect(handlers.onUndo).not.toHaveBeenCalled();
  });

  it('does not fire when canRedo is false', () => {
    renderHook(() => useKeyboardShortcuts(handlers, { ...baseState, canRedo: false }));
    fireKeyDown('y', { ctrlKey: true });
    expect(handlers.onRedo).not.toHaveBeenCalled();
  });

  it('does not fire when canSave is false', () => {
    renderHook(() => useKeyboardShortcuts(handlers, { ...baseState, canSave: false }));
    fireKeyDown('s', { ctrlKey: true });
    expect(handlers.onSave).not.toHaveBeenCalled();
  });

  it('does not fire new/open/saveAs when apiConnected is false', () => {
    const disconnectedState = { ...baseState, apiConnected: false };
    renderHook(() => useKeyboardShortcuts(handlers, disconnectedState));

    fireKeyDown('n', { ctrlKey: true });
    expect(handlers.onNew).not.toHaveBeenCalled();

    fireKeyDown('o', { ctrlKey: true });
    expect(handlers.onOpen).not.toHaveBeenCalled();

    fireKeyDown('s', { ctrlKey: true, shiftKey: true });
    expect(handlers.onSaveAs).not.toHaveBeenCalled();
  });

  it('cleans up event listener on unmount', () => {
    const spy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useKeyboardShortcuts(handlers, baseState));
    unmount();
    expect(spy).toHaveBeenCalledWith('keydown', expect.any(Function));
    spy.mockRestore();
  });
});
