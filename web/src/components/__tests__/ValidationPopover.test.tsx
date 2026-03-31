import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import ValidationPopover from '../ValidationPopover';
import type { ValidationResult, PolicyViolation } from '../../types/models';

const mockValidationResults: ValidationResult[] = [
  {
    severity: 'error',
    code: 'E001',
    message: 'Zone has no assets defined',
    recommendation: 'Add at least one asset to the zone',
  },
  {
    severity: 'warning',
    code: 'W002',
    message: 'Security level target exceeds capability',
  },
];

const mockPolicyViolations: PolicyViolation[] = [
  {
    rule_id: 'POL-001',
    rule_name: 'Min SL Policy',
    severity: 'high',
    message: 'Zone does not meet minimum security level',
    affected_entities: ['zone-1'],
    remediation: 'Increase security level to at least SL 2',
  },
];

// Wrapper component to provide a valid triggerRef
function TestWrapper({
  validationResults = mockValidationResults,
  policyViolations = mockPolicyViolations,
  entityName = 'Test Zone',
  onClose = vi.fn(),
  onEdit,
}: {
  validationResults?: ValidationResult[];
  policyViolations?: PolicyViolation[];
  entityName?: string;
  onClose?: () => void;
  onEdit?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef}>Trigger</button>
      <ValidationPopover
        validationResults={validationResults}
        policyViolations={policyViolations}
        entityName={entityName}
        onClose={onClose}
        triggerRef={triggerRef}
        onEdit={onEdit}
      />
    </>
  );
}

describe('ValidationPopover', () => {
  it('renders validation results with severity badges', () => {
    render(<TestWrapper />);
    expect(screen.getByText('ERROR')).toBeInTheDocument();
    expect(screen.getByText('WARNING')).toBeInTheDocument();
    expect(screen.getByText('Zone has no assets defined')).toBeInTheDocument();
    expect(screen.getByText('Security level target exceeds capability')).toBeInTheDocument();
  });

  it('renders policy violations', () => {
    render(<TestWrapper />);
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('Min SL Policy')).toBeInTheDocument();
    expect(screen.getByText('Zone does not meet minimum security level')).toBeInTheDocument();
    expect(screen.getByText('Increase security level to at least SL 2')).toBeInTheDocument();
  });

  it('shows entity name in header', () => {
    render(<TestWrapper entityName="My Production Zone" />);
    expect(screen.getByText('Issues for My Production Zone')).toBeInTheDocument();
  });

  it('shows Edit button when onEdit is provided', () => {
    const onEdit = vi.fn();
    render(<TestWrapper onEdit={onEdit} />);
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('does not show Edit button when onEdit is not provided', () => {
    render(<TestWrapper />);
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    render(<TestWrapper onClose={onClose} />);
    // The close button renders the × character
    const closeButton = screen.getByText('\u00d7');
    closeButton.click();
    expect(onClose).toHaveBeenCalled();
  });

  it('renders recommendation text when present', () => {
    render(<TestWrapper />);
    expect(screen.getByText('Add at least one asset to the zone')).toBeInTheDocument();
  });

  it('renders validation codes', () => {
    render(<TestWrapper />);
    expect(screen.getByText('E001')).toBeInTheDocument();
    expect(screen.getByText('W002')).toBeInTheDocument();
  });

  it('returns null when there are no issues', () => {
    const { container } = render(
      <TestWrapper validationResults={[]} policyViolations={[]} />
    );
    // The popover should not render (only the trigger button)
    expect(screen.queryByText(/Issues for/)).not.toBeInTheDocument();
    // Only the trigger button should be present
    expect(container.querySelector('button')).toHaveTextContent('Trigger');
  });
});
