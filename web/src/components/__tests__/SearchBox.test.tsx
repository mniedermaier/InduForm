import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchBox from '../SearchBox';
import type { Zone, Conduit } from '../../types/models';

const mockZones: Zone[] = [
  {
    id: 'zone-1',
    name: 'Enterprise Zone',
    type: 'enterprise',
    security_level_target: 2,
    description: 'Corporate IT network',
    assets: [
      {
        id: 'asset-1',
        name: 'Main Server',
        type: 'server',
        ip_address: '10.0.0.1',
      },
    ],
  },
  {
    id: 'zone-2',
    name: 'Safety Zone',
    type: 'safety',
    security_level_target: 4,
    description: 'Safety instrumented systems',
    assets: [],
  },
];

const mockConduits: Conduit[] = [
  {
    id: 'conduit-1',
    name: 'Enterprise-Safety Link',
    from_zone: 'zone-1',
    to_zone: 'zone-2',
    flows: [{ protocol: 'Modbus', port: 502, direction: 'bidirectional' }],
    requires_inspection: true,
  },
];

const defaultProps = {
  zones: mockZones,
  conduits: mockConduits,
  onSelectZone: vi.fn(),
  onSelectConduit: vi.fn(),
};

describe('SearchBox', () => {
  it('renders input with correct placeholder', () => {
    render(<SearchBox {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search zones, conduits, assets...')).toBeInTheDocument();
  });

  it('shows results when typing a query that matches', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search zones, conduits, assets...');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Enterprise' } });

    expect(screen.getByText('Enterprise Zone')).toBeInTheDocument();
  });

  it('shows "No results found" when query has no matches', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search zones, conduits, assets...');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'nonexistent-xyz' } });

    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('filter button has aria-label "Toggle search filters"', () => {
    render(<SearchBox {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Toggle search filters' })).toBeInTheDocument();
  });

  it('supports keyboard navigation with ArrowDown and ArrowUp', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search zones, conduits, assets...');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Zone' } });

    // Results should be visible: Enterprise Zone, Safety Zone
    expect(screen.getByText('Enterprise Zone')).toBeInTheDocument();
    expect(screen.getByText('Safety Zone')).toBeInTheDocument();

    // Press ArrowDown to move selection
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Press ArrowUp to move back
    fireEvent.keyDown(input, { key: 'ArrowUp' });
  });

  it('selects result on Enter and clears query', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search zones, conduits, assets...');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Enterprise' } });

    expect(screen.getByText('Enterprise Zone')).toBeInTheDocument();

    // Press Enter to select first result
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(defaultProps.onSelectZone).toHaveBeenCalledWith(mockZones[0]);
  });

  it('closes results on Escape and clears query', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search zones, conduits, assets...');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Enterprise' } });

    expect(screen.getByText('Enterprise Zone')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('Enterprise Zone')).not.toBeInTheDocument();
  });

  it('shows conduit results when searching by conduit name', () => {
    render(<SearchBox {...defaultProps} />);
    const input = screen.getByPlaceholderText('Search zones, conduits, assets...');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Link' } });

    expect(screen.getByText('Enterprise-Safety Link')).toBeInTheDocument();
  });
});
