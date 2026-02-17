import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LoginPage from '../LoginPage';

// Mock the AuthContext
const mockLogin = vi.fn();
const mockClearError = vi.fn();

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    isLoading: false,
    error: null,
    clearError: mockClearError,
  }),
}));

// Mock ParticleBackground since it uses canvas
vi.mock('../../components/ParticleBackground', () => ({
  default: () => <div data-testid="particle-background" />,
}));

describe('LoginPage', () => {
  const mockSwitchToRegister = vi.fn();
  const mockSwitchToForgotPassword = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the login form', () => {
    render(<LoginPage onSwitchToRegister={mockSwitchToRegister} onSwitchToForgotPassword={mockSwitchToForgotPassword} />);

    expect(screen.getByRole('heading', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email or Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('shows validation error when email is empty', async () => {
    render(<LoginPage onSwitchToRegister={mockSwitchToRegister} onSwitchToForgotPassword={mockSwitchToForgotPassword} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(screen.getByText('Email or username is required')).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('shows validation error when password is empty', async () => {
    render(<LoginPage onSwitchToRegister={mockSwitchToRegister} onSwitchToForgotPassword={mockSwitchToForgotPassword} />);

    fireEvent.change(screen.getByLabelText('Email or Username'), {
      target: { value: 'user@test.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('calls login with correct credentials on submit', async () => {
    mockLogin.mockResolvedValue(undefined);

    render(<LoginPage onSwitchToRegister={mockSwitchToRegister} onSwitchToForgotPassword={mockSwitchToForgotPassword} />);

    fireEvent.change(screen.getByLabelText('Email or Username'), {
      target: { value: 'user@test.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(mockLogin).toHaveBeenCalledWith('user@test.com', 'password123');
  });

  it('has a link to switch to register page', () => {
    render(<LoginPage onSwitchToRegister={mockSwitchToRegister} onSwitchToForgotPassword={mockSwitchToForgotPassword} />);

    fireEvent.click(screen.getByText('Create one'));
    expect(mockSwitchToRegister).toHaveBeenCalled();
  });

  it('has a link to switch to forgot password page', () => {
    render(<LoginPage onSwitchToRegister={mockSwitchToRegister} onSwitchToForgotPassword={mockSwitchToForgotPassword} />);

    fireEvent.click(screen.getByText('Forgot password?'));
    expect(mockSwitchToForgotPassword).toHaveBeenCalled();
  });

  it('displays the InduForm branding', () => {
    render(<LoginPage onSwitchToRegister={mockSwitchToRegister} onSwitchToForgotPassword={mockSwitchToForgotPassword} />);

    expect(screen.getByText('InduForm')).toBeInTheDocument();
    expect(screen.getByText('IEC 62443 Zone/Conduit Security Editor')).toBeInTheDocument();
  });
});
