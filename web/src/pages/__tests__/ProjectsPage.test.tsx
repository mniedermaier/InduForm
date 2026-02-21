import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProjectsPage from '../ProjectsPage';

// Mock fetch for the projects list endpoint
const mockProjects = [
  {
    id: 'proj-1',
    name: 'Test Plant',
    description: 'A test project',
    standard: 'IEC62443',
    owner_id: 'user-1',
    owner_username: 'testuser',
    created_at: '2024-01-01T00:00:00',
    updated_at: '2024-01-02T00:00:00',
    zone_count: 3,
    conduit_count: 2,
    asset_count: 5,
    permission: 'owner',
    risk_score: 35,
    risk_level: 'low',
    compliance_score: 78,
  },
];

// Mock components that rely on complex dependencies
vi.mock('../../components/NetworkBackground', () => ({
  default: () => <div data-testid="network-background" />,
}));

vi.mock('../../components/UserMenu', () => ({
  default: ({ onLogout }: { onLogout?: () => void }) => (
    <div data-testid="user-menu" onClick={onLogout}>
      UserMenu
    </div>
  ),
}));

vi.mock('../../components/NotificationBell', () => ({
  default: () => <div data-testid="notification-bell" />,
}));

vi.mock('../../components/UserSettingsDialog', () => ({
  default: () => <div data-testid="user-settings" />,
}));

vi.mock('../../components/ActivityLogPanel', () => ({
  default: () => <div data-testid="activity-panel" />,
}));

vi.mock('../../components/AnalyticsPanel', () => ({
  Sparkline: () => <svg data-testid="sparkline" />,
}));

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

describe('ProjectsPage', () => {
  const defaultProps = {
    onOpenProject: vi.fn(),
    onOpenTeamManagement: vi.fn(),
    onCreateProject: vi.fn(),
    onShareProject: vi.fn(),
    onOpenAdmin: vi.fn(),
    onOpenGlobalSearch: vi.fn(),
    onOpenRollup: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockProjects),
    }) as unknown as typeof fetch;
  });

  it('renders the page header with InduForm branding', async () => {
    render(<ProjectsPage {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('InduForm')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;
    render(<ProjectsPage {...defaultProps} />);

    // The loading state should be visible
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('displays projects after loading', async () => {
    render(<ProjectsPage {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test Plant')).toBeInTheDocument();
    });
  });

  it('shows error when API fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;

    render(<ProjectsPage {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('renders the new project button', async () => {
    render(<ProjectsPage {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('Test Plant')).toBeInTheDocument();
    });

    expect(screen.getByText('New Project')).toBeInTheDocument();
  });
});
