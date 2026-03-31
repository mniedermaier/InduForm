import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DemoBanner from '../DemoBanner';

describe('DemoBanner', () => {
  it('renders the demo banner text', () => {
    render(<DemoBanner />);
    expect(screen.getByText(/Limited Demo/)).toBeInTheDocument();
  });

  it('has a GitHub link with secure attributes', () => {
    render(<DemoBanner />);
    const link = screen.getByRole('link', { name: /View on GitHub/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('href', 'https://github.com/mniedermaier/InduForm');
  });

  it('renders a spacer div for layout offset', () => {
    const { container } = render(<DemoBanner />);
    // The spacer is the second child: a div with h-8 class
    const spacer = container.querySelector('.h-8');
    expect(spacer).toBeInTheDocument();
  });
});
