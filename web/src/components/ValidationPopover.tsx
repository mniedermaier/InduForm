import { memo, useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ValidationResult, PolicyViolation } from '../types/models';

interface ValidationPopoverProps {
  validationResults: ValidationResult[];
  policyViolations: PolicyViolation[];
  entityName: string;
  onClose: () => void;
  /** Ref to the trigger element used to position the popover */
  triggerRef: React.RefObject<HTMLElement | null>;
  /** Callback to open the entity's editor dialog for quick fixing */
  onEdit?: () => void;
}

const SEVERITY_STYLES: Record<string, { badge: string; border: string }> = {
  error: {
    badge: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
    border: 'border-l-red-500',
  },
  warning: {
    badge: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
    border: 'border-l-yellow-500',
  },
  info: {
    badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
    border: 'border-l-blue-500',
  },
  critical: {
    badge: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
    border: 'border-l-red-500',
  },
  high: {
    badge: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
    border: 'border-l-orange-500',
  },
  medium: {
    badge: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
    border: 'border-l-yellow-500',
  },
  low: {
    badge: 'bg-gray-100 dark:bg-gray-600 text-gray-800 dark:text-gray-200',
    border: 'border-l-gray-400',
  },
};

const ValidationPopover = memo(({
  validationResults,
  policyViolations,
  entityName,
  onClose,
  triggerRef,
  onEdit,
}: ValidationPopoverProps) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Position popover relative to trigger element
  useLayoutEffect(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = 288; // w-72 = 18rem = 288px

    // Place below the trigger, right-aligned
    let left = rect.right - popoverWidth;
    const top = rect.bottom + 8;

    // Keep within viewport
    if (left < 8) left = 8;
    if (left + popoverWidth > window.innerWidth - 8) {
      left = window.innerWidth - popoverWidth - 8;
    }

    setPos({ top, left });
  }, [triggerRef]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    // Delay adding listeners so the opening click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, triggerRef]);

  const totalIssues = validationResults.length + policyViolations.length;
  if (totalIssues === 0) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="w-72 max-h-64 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-gray-800 px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">
          Issues for {entityName}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); onClose(); }}
              className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors"
            >
              Edit
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Validation results */}
      <div className="p-2 space-y-1.5">
        {validationResults.map((result, idx) => {
          const styles = SEVERITY_STYLES[result.severity] || SEVERITY_STYLES.info;
          return (
            <div key={`v-${idx}`} className={`border-l-2 ${styles.border} pl-2 py-1`}>
              <div className="flex items-center gap-1.5">
                <span className={`px-1.5 py-0 text-[10px] font-medium rounded ${styles.badge}`}>
                  {result.severity.toUpperCase()}
                </span>
                <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">{result.code}</span>
              </div>
              <div className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 leading-tight">
                {result.message}
              </div>
              {result.recommendation && (
                <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 italic leading-tight">
                  {result.recommendation}
                </div>
              )}
            </div>
          );
        })}

        {/* Policy violations */}
        {policyViolations.map((violation, idx) => {
          const styles = SEVERITY_STYLES[violation.severity] || SEVERITY_STYLES.medium;
          return (
            <div key={`p-${idx}`} className={`border-l-2 ${styles.border} pl-2 py-1`}>
              <div className="flex items-center gap-1.5">
                <span className={`px-1.5 py-0 text-[10px] font-medium rounded ${styles.badge}`}>
                  {violation.severity.toUpperCase()}
                </span>
                <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">{violation.rule_id}</span>
                <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">{violation.rule_name}</span>
              </div>
              <div className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 leading-tight">
                {violation.message}
              </div>
              {violation.remediation && (
                <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 italic leading-tight">
                  {violation.remediation}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
});

ValidationPopover.displayName = 'ValidationPopover';

export default ValidationPopover;
