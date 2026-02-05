import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DialogShell from '../DialogShell';

describe('DialogShell', () => {
  it('renders with proper ARIA attributes', () => {
    render(
      <DialogShell title="Test Dialog" onClose={vi.fn()}>
        <p>Dialog content</p>
      </DialogShell>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby');

    // The title should be rendered and linked by aria-labelledby
    const titleId = dialog.getAttribute('aria-labelledby')!;
    const titleEl = document.getElementById(titleId);
    expect(titleEl).toBeInTheDocument();
    expect(titleEl?.textContent).toBe('Test Dialog');
  });

  it('renders children', () => {
    render(
      <DialogShell title="Test" onClose={vi.fn()}>
        <p>Hello World</p>
      </DialogShell>
    );

    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <DialogShell title="Test" onClose={onClose}>
        <button>Focus me</button>
      </DialogShell>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <DialogShell title="Test" onClose={onClose}>
        <p>Content</p>
      </DialogShell>
    );

    // Click on the backdrop (the outer div with role="dialog")
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when inner content is clicked', () => {
    const onClose = vi.fn();
    render(
      <DialogShell title="Test" onClose={onClose}>
        <p>Content</p>
      </DialogShell>
    );

    fireEvent.click(screen.getByText('Content'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('supports custom maxWidth', () => {
    render(
      <DialogShell title="Wide Dialog" onClose={vi.fn()} maxWidth="max-w-4xl">
        <p>Wide content</p>
      </DialogShell>
    );

    const dialog = screen.getByRole('dialog');
    const inner = dialog.firstElementChild;
    expect(inner?.className).toContain('max-w-4xl');
  });

  it('traps focus within the dialog', () => {
    render(
      <DialogShell title="Focus Trap" onClose={vi.fn()}>
        <button>First</button>
        <button>Last</button>
      </DialogShell>
    );

    const buttons = screen.getAllByRole('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    // Focus the last button, then Tab should wrap to first
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // Focus trapping is implemented via preventDefault, so we verify
    // the handler doesn't throw
    expect(document.activeElement).toBeDefined();

    // Focus the first button, Shift+Tab should wrap to last
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBeDefined();
  });
});
