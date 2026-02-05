import { useEffect, useRef, useCallback, memo } from 'react';

interface DialogShellProps {
  /** Dialog title shown in the header and used for aria-labelledby */
  title: string;
  /** Called when the dialog should close (Escape key, backdrop click) */
  onClose: () => void;
  /** Maximum width class (default: max-w-md) */
  maxWidth?: string;
  children: React.ReactNode;
}

/**
 * Accessible dialog wrapper with focus trapping, Escape-to-close,
 * backdrop click-to-close, and proper ARIA attributes.
 *
 * Usage:
 *   <DialogShell title="Add Zone" onClose={handleClose}>
 *     <form>...</form>
 *   </DialogShell>
 */
const DialogShell = memo(({ title, onClose, maxWidth = 'max-w-md', children }: DialogShellProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2, 8)}`).current;

  // Focus trap
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== 'Tab' || !dialogRef.current) return;

      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Auto-focus first focusable element on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const first = dialogRef.current.querySelector<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
        );
        first?.focus();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={dialogRef}
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full ${maxWidth} mx-4`}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2
            id={titleId}
            className="text-lg font-semibold text-gray-800 dark:text-gray-100"
          >
            {title}
          </h2>
        </div>
        {children}
      </div>
    </div>
  );
});

DialogShell.displayName = 'DialogShell';

export default DialogShell;
