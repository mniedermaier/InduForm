import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Toolbar from '../Toolbar';
import { ThemeProvider } from '../../contexts/ThemeContext';

// Mock matchMedia for ThemeContext
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock localStorage for ThemeContext
const localStorageMock = {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn().mockReturnValue(null),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const defaultProps = {
  onAddZone: vi.fn(),
  onAddConduit: vi.fn(),
  onSave: vi.fn(),
  onValidate: vi.fn(),
  onRearrange: vi.fn(),
  saving: false,
  hasChanges: true,
  apiConnected: true,
  zoneCount: 2,
};

function renderToolbar(overrides = {}) {
  return render(
    <ThemeProvider>
      <Toolbar {...defaultProps} {...overrides} />
    </ThemeProvider>
  );
}

describe('Toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all menu labels in the desktop menu bar', () => {
    renderToolbar();
    const labels = ['File', 'Edit', 'Add', 'Analyze', 'Generate', 'View'];
    for (const label of labels) {
      // Each label appears as a button with aria-haspopup
      const buttons = screen.getAllByRole('button', { name: label });
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('clicking a menu button toggles the dropdown open/closed', () => {
    renderToolbar();
    const fileButtons = screen.getAllByRole('button', { name: 'File' });
    // Use the desktop button (one with aria-haspopup)
    const fileButton = fileButtons.find(btn => btn.getAttribute('aria-haspopup') === 'menu')!;
    expect(fileButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(fileButton);
    expect(fileButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(fileButton);
    expect(fileButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('menu items are disabled when apiConnected is false', () => {
    renderToolbar({ apiConnected: false });
    // Open the Add menu
    const addButtons = screen.getAllByRole('button', { name: 'Add' });
    const addButton = addButtons.find(btn => btn.getAttribute('aria-haspopup') === 'menu')!;
    fireEvent.click(addButton);

    // Zone and Conduit items should be disabled
    const zoneItem = screen.getByRole('menuitem', { name: /Zone/ });
    expect(zoneItem).toBeDisabled();
    const conduitItem = screen.getByRole('menuitem', { name: /Conduit/ });
    expect(conduitItem).toBeDisabled();
  });

  it('save menu item is disabled when hasChanges is false', () => {
    renderToolbar({ hasChanges: false });
    // Open File menu
    const fileButtons = screen.getAllByRole('button', { name: 'File' });
    const fileButton = fileButtons.find(btn => btn.getAttribute('aria-haspopup') === 'menu')!;
    fireEvent.click(fileButton);

    // "Save" menu item (accessible name includes shortcut text "SaveCtrl+S")
    const saveItems = screen.getAllByRole('menuitem').filter(
      el => el.textContent?.includes('Save') && !el.textContent?.includes('As')
    );
    expect(saveItems.length).toBeGreaterThanOrEqual(1);
    expect(saveItems[0]).toBeDisabled();
  });

  it('shows current file name', () => {
    renderToolbar({ currentFileName: 'my-project.json' });
    expect(screen.getByText(/my-project\.json/)).toBeInTheDocument();
  });

  it('shows "Validating..." indicator when isValidating is true', () => {
    renderToolbar({ isValidating: true });
    expect(screen.getByText('Validating...')).toBeInTheDocument();
  });

  it('hamburger menu button has aria-label "Open menu"', () => {
    renderToolbar();
    const hamburger = screen.getByRole('button', { name: 'Open menu' });
    expect(hamburger).toBeInTheDocument();
  });
});
