import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDialogs } from '../useDialogs';

describe('useDialogs', () => {
  it('initializes with all dialogs closed', () => {
    const { result } = renderHook(() => useDialogs());
    const [state] = result.current;

    expect(state.showAddZone).toBe(false);
    expect(state.showAddConduit).toBe(false);
    expect(state.showAddAsset).toBeNull();
    expect(state.fileDialogMode).toBeNull();
    expect(state.pendingConnection).toBeNull();
    expect(state.editingConduit).toBeNull();
    expect(state.editingZone).toBeNull();
    expect(state.contextMenu).toBeNull();
    expect(state.showValidationResults).toBe(false);
    expect(state.showProjectSettings).toBe(false);
    expect(state.generateType).toBeNull();
    expect(state.showComplianceDashboard).toBe(false);
    expect(state.showCSVImport).toBe(false);
    expect(state.showExportDialog).toBe(false);
    expect(state.showRiskDashboard).toBe(false);
    expect(state.showTemplateSelector).toBe(false);
    expect(state.showAssetTable).toBe(false);
    expect(state.showShareDialog).toBe(false);
    expect(state.showTeamManagement).toBe(false);
    expect(state.showNmapImport).toBe(false);
    expect(state.showProfileSettings).toBe(false);
    expect(state.showKeyboardShortcuts).toBe(false);
    expect(state.showVersionHistory).toBe(false);
    expect(state.showComplianceSettings).toBe(false);
  });

  it('opens and closes add zone dialog', () => {
    const { result } = renderHook(() => useDialogs());

    act(() => result.current[1].openAddZone());
    expect(result.current[0].showAddZone).toBe(true);

    act(() => result.current[1].closeAddZone());
    expect(result.current[0].showAddZone).toBe(false);
  });

  it('opens and closes add conduit dialog', () => {
    const { result } = renderHook(() => useDialogs());

    act(() => result.current[1].openAddConduit());
    expect(result.current[0].showAddConduit).toBe(true);

    act(() => result.current[1].closeAddConduit());
    expect(result.current[0].showAddConduit).toBe(false);
  });

  it('opens add asset with zone data and closes', () => {
    const { result } = renderHook(() => useDialogs());
    const zone = { id: 'z1', name: 'Zone 1', type: 'cell' as const, security_level_target: 2, assets: [] };

    act(() => result.current[1].openAddAsset(zone));
    expect(result.current[0].showAddAsset).toEqual(zone);

    act(() => result.current[1].closeAddAsset());
    expect(result.current[0].showAddAsset).toBeNull();
  });

  it('opens file dialog in different modes', () => {
    const { result } = renderHook(() => useDialogs());

    act(() => result.current[1].openFileDialog('open'));
    expect(result.current[0].fileDialogMode).toBe('open');

    act(() => result.current[1].openFileDialog('new'));
    expect(result.current[0].fileDialogMode).toBe('new');

    act(() => result.current[1].closeFileDialog());
    expect(result.current[0].fileDialogMode).toBeNull();
  });

  it('opens and closes generate dialog', () => {
    const { result } = renderHook(() => useDialogs());

    act(() => result.current[1].openGenerate('firewall'));
    expect(result.current[0].generateType).toBe('firewall');

    act(() => result.current[1].openGenerate('vlan'));
    expect(result.current[0].generateType).toBe('vlan');

    act(() => result.current[1].closeGenerate());
    expect(result.current[0].generateType).toBeNull();
  });

  it('toggles keyboard shortcuts', () => {
    const { result } = renderHook(() => useDialogs());

    act(() => result.current[1].toggleKeyboardShortcuts());
    expect(result.current[0].showKeyboardShortcuts).toBe(true);

    act(() => result.current[1].toggleKeyboardShortcuts());
    expect(result.current[0].showKeyboardShortcuts).toBe(false);
  });

  it('opens and closes boolean dialogs', () => {
    const { result } = renderHook(() => useDialogs());
    const boolDialogs = [
      ['openValidationResults', 'closeValidationResults', 'showValidationResults'],
      ['openProjectSettings', 'closeProjectSettings', 'showProjectSettings'],
      ['openComplianceDashboard', 'closeComplianceDashboard', 'showComplianceDashboard'],
      ['openCSVImport', 'closeCSVImport', 'showCSVImport'],
      ['openExportDialog', 'closeExportDialog', 'showExportDialog'],
      ['openRiskDashboard', 'closeRiskDashboard', 'showRiskDashboard'],
      ['openTemplateSelector', 'closeTemplateSelector', 'showTemplateSelector'],
      ['openAssetTable', 'closeAssetTable', 'showAssetTable'],
      ['openShareDialog', 'closeShareDialog', 'showShareDialog'],
      ['openTeamManagement', 'closeTeamManagement', 'showTeamManagement'],
      ['openNmapImport', 'closeNmapImport', 'showNmapImport'],
      ['openProfileSettings', 'closeProfileSettings', 'showProfileSettings'],
      ['openKeyboardShortcuts', 'closeKeyboardShortcuts', 'showKeyboardShortcuts'],
      ['openVersionHistory', 'closeVersionHistory', 'showVersionHistory'],
      ['openComplianceSettings', 'closeComplianceSettings', 'showComplianceSettings'],
    ] as const;

    for (const [openFn, closeFn, stateKey] of boolDialogs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      act(() => (result.current[1] as any)[openFn]());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.current[0] as any)[stateKey]).toBe(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      act(() => (result.current[1] as any)[closeFn]());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((result.current[0] as any)[stateKey]).toBe(false);
    }
  });

  it('closeAll closes everything', () => {
    const { result } = renderHook(() => useDialogs());

    // Open several dialogs
    act(() => {
      result.current[1].openAddZone();
      result.current[1].openProjectSettings();
      result.current[1].openGenerate('firewall');
    });

    expect(result.current[0].showAddZone).toBe(true);
    expect(result.current[0].showProjectSettings).toBe(true);

    act(() => result.current[1].closeAll());

    expect(result.current[0].showAddZone).toBe(false);
    expect(result.current[0].showProjectSettings).toBe(false);
    expect(result.current[0].generateType).toBeNull();
  });

  it('closeTopmost closes the most recently opened dialog', () => {
    const { result } = renderHook(() => useDialogs());

    act(() => result.current[1].openAddZone());
    act(() => result.current[1].openKeyboardShortcuts());

    // closeTopmost should close keyboard shortcuts first (it's higher priority)
    let closed: boolean = false;
    act(() => { closed = result.current[1].closeTopmost(); });
    expect(closed).toBe(true);
    expect(result.current[0].showKeyboardShortcuts).toBe(false);
    expect(result.current[0].showAddZone).toBe(true);

    // Close the remaining dialog
    act(() => { closed = result.current[1].closeTopmost(); });
    expect(closed).toBe(true);
    expect(result.current[0].showAddZone).toBe(false);

    // Nothing left to close
    act(() => { closed = result.current[1].closeTopmost(); });
    expect(closed).toBe(false);
  });

  it('sets pending connection and clears it', () => {
    const { result } = renderHook(() => useDialogs());
    const conn = { from: 'z1', to: 'z2' };

    act(() => result.current[1].setPendingConnection(conn));
    expect(result.current[0].pendingConnection).toEqual(conn);

    act(() => result.current[1].setPendingConnection(null));
    expect(result.current[0].pendingConnection).toBeNull();
  });

  it('opens and closes edit zone dialog', () => {
    const { result } = renderHook(() => useDialogs());
    const zone = { id: 'z1', name: 'Zone 1', type: 'cell' as const, security_level_target: 2, assets: [] };

    act(() => result.current[1].openEditZone(zone));
    expect(result.current[0].editingZone).toEqual(zone);

    act(() => result.current[1].closeEditZone());
    expect(result.current[0].editingZone).toBeNull();
  });

  it('opens and closes edit conduit dialog', () => {
    const { result } = renderHook(() => useDialogs());
    const conduit = {
      id: 'c1',
      from_zone: 'z1',
      to_zone: 'z2',
      flows: [],
      requires_inspection: false,
    };

    act(() => result.current[1].openEditConduit(conduit));
    expect(result.current[0].editingConduit).toEqual(conduit);

    act(() => result.current[1].closeEditConduit());
    expect(result.current[0].editingConduit).toBeNull();
  });
});
