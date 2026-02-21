import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import RollupDashboardPage from '../RollupDashboardPage';
import type { RollupDashboardData } from '../../types/models';

// Mock the API client
const mockGetRollupDashboard = vi.fn();
vi.mock('../../api/client', () => ({
  api: {
    getRollupDashboard: (...args: unknown[]) => mockGetRollupDashboard(...args),
  },
}));

// Mock NetworkBackground (uses canvas)
vi.mock('../../components/NetworkBackground', () => ({
  default: () => <div data-testid="network-background" />,
}));

// Mock UserMenu
vi.mock('../../components/UserMenu', () => ({
  default: () => <div data-testid="user-menu" />,
}));

// Mock ToastContext
vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

const MOCK_DATA: RollupDashboardData = {
  total_projects: 3,
  total_zones: 12,
  total_assets: 45,
  total_conduits: 8,
  avg_compliance: 72.5,
  compliance_distribution: { high: 1, medium: 1, low: 1, unknown: 0 },
  avg_risk: 42.0,
  risk_distribution: { critical: 0, high: 1, medium: 1, low: 1, minimal: 0, unknown: 0 },
  worst_compliance: [
    { id: 'p1', name: 'Plant Alpha', score: 45.0 },
    { id: 'p2', name: 'Plant Beta', score: 65.0 },
  ],
  worst_risk: [
    { id: 'p2', name: 'Plant Beta', score: 78.0 },
  ],
  trends: [
    { date: '2024-01-01', avg_compliance: 70.0, avg_risk: 45.0, total_zones: 10, total_assets: 40, total_conduits: 7 },
    { date: '2024-01-02', avg_compliance: 72.5, avg_risk: 42.0, total_zones: 12, total_assets: 45, total_conduits: 8 },
  ],
  projects: [
    {
      id: 'p1', name: 'Plant Alpha', description: 'Alpha desc', updated_at: '2024-01-02T12:00:00',
      zone_count: 5, asset_count: 20, conduit_count: 3,
      compliance_score: 45.0, risk_score: 30.0,
      compliance_sparkline: [40, 42, 45], risk_sparkline: [35, 32, 30],
    },
    {
      id: 'p2', name: 'Plant Beta', description: 'Beta desc', updated_at: '2024-01-02T13:00:00',
      zone_count: 4, asset_count: 15, conduit_count: 3,
      compliance_score: 65.0, risk_score: 78.0,
      compliance_sparkline: [60, 63, 65], risk_sparkline: [80, 79, 78],
    },
    {
      id: 'p3', name: 'Plant Gamma', description: null, updated_at: '2024-01-02T14:00:00',
      zone_count: 3, asset_count: 10, conduit_count: 2,
      compliance_score: 95.0, risk_score: 10.0,
      compliance_sparkline: [90, 92, 95], risk_sparkline: [15, 12, 10],
    },
  ],
};

// Helper: wait for the dashboard to finish loading by checking for a stat label
async function waitForLoaded() {
  await waitFor(() => {
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });
}

describe('RollupDashboardPage', () => {
  const defaultProps = {
    onBackToProjects: vi.fn(),
    onOpenProject: vi.fn(),
    onOpenTeamManagement: vi.fn(),
    onOpenAdmin: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRollupDashboard.mockResolvedValue(MOCK_DATA);
  });

  it('shows loading state initially', () => {
    mockGetRollupDashboard.mockReturnValue(new Promise(() => {})); // never resolves
    render(<RollupDashboardPage {...defaultProps} />);

    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
  });

  it('renders stat cards after loading', async () => {
    render(<RollupDashboardPage {...defaultProps} />);

    await waitForLoaded();

    // Labels appear in stat cards and table headers, so use getAllByText
    expect(screen.getAllByText('Zones').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Assets').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Conduits').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the projects table', async () => {
    render(<RollupDashboardPage {...defaultProps} />);

    await waitForLoaded();

    const table = screen.getByRole('table');
    const tableScope = within(table);
    expect(tableScope.getByText('Plant Alpha')).toBeInTheDocument();
    expect(tableScope.getByText('Plant Beta')).toBeInTheDocument();
    expect(tableScope.getByText('Plant Gamma')).toBeInTheDocument();
  });

  it('calls onBackToProjects when back button is clicked', async () => {
    render(<RollupDashboardPage {...defaultProps} />);

    await waitForLoaded();

    const backButton = screen.getByLabelText('Back to projects');
    fireEvent.click(backButton);
    expect(defaultProps.onBackToProjects).toHaveBeenCalled();
  });

  it('calls onOpenProject when a project row is clicked', async () => {
    render(<RollupDashboardPage {...defaultProps} />);

    await waitForLoaded();

    const table = screen.getByRole('table');
    const tableScope = within(table);
    fireEvent.click(tableScope.getByText('Plant Alpha'));
    expect(defaultProps.onOpenProject).toHaveBeenCalledWith('p1');
  });

  it('shows error state when API fails', async () => {
    mockGetRollupDashboard.mockRejectedValue(new Error('Network error'));

    render(<RollupDashboardPage {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('changes time range when selector is clicked', async () => {
    render(<RollupDashboardPage {...defaultProps} />);

    await waitForLoaded();

    // Click 7d button
    fireEvent.click(screen.getByText('7d'));
    expect(mockGetRollupDashboard).toHaveBeenCalledWith(7);
  });

  it('has accessible loading state with role=status', () => {
    mockGetRollupDashboard.mockReturnValue(new Promise(() => {}));
    render(<RollupDashboardPage {...defaultProps} />);

    const loadingEl = screen.getByRole('status');
    expect(loadingEl).toBeInTheDocument();
  });

  it('renders sort headers with aria-sort', async () => {
    render(<RollupDashboardPage {...defaultProps} />);

    await waitForLoaded();

    const complianceHeader = screen.getByLabelText('Sort by Compliance');
    expect(complianceHeader).toHaveAttribute('aria-sort');
  });
});
