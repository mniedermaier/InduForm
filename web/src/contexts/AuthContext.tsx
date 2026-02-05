import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface User {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  created_at: string;
  is_active: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (emailOrUsername: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = '/api';

// Token storage keys
const ACCESS_TOKEN_KEY = 'induform_access_token';
const REFRESH_TOKEN_KEY = 'induform_refresh_token';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  // Get stored tokens
  const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);
  const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY);

  // Store tokens
  const setTokens = (accessToken: string, refreshToken: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  };

  // Clear tokens
  const clearTokens = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  };

  // Fetch current user
  const fetchCurrentUser = useCallback(async (): Promise<User | null> => {
    const token = getAccessToken();
    if (!token) return null;

    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        return await response.json();
      }

      // If unauthorized, try to refresh
      if (response.status === 401) {
        const refreshed = await refreshTokenInternal();
        if (refreshed) {
          const newToken = getAccessToken();
          const retryResponse = await fetch(`${API_BASE}/auth/me`, {
            headers: {
              Authorization: `Bearer ${newToken}`,
            },
          });
          if (retryResponse.ok) {
            return await retryResponse.json();
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }, []);

  // Internal refresh token function
  const refreshTokenInternal = async (): Promise<boolean> => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (response.ok) {
        const data: TokenResponse = await response.json();
        setTokens(data.access_token, data.refresh_token);
        return true;
      }

      // Refresh failed, clear tokens
      clearTokens();
      return false;
    } catch {
      clearTokens();
      return false;
    }
  };

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      const user = await fetchCurrentUser();
      setState({
        user,
        isAuthenticated: !!user,
        isLoading: false,
        error: null,
      });
    };

    initAuth();
  }, [fetchCurrentUser]);

  // Login
  const login = async (emailOrUsername: string, password: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email_or_username: emailOrUsername,
          password,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Login failed');
      }

      const data: TokenResponse = await response.json();
      setTokens(data.access_token, data.refresh_token);

      const user = await fetchCurrentUser();
      setState({
        user,
        isAuthenticated: !!user,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Login failed',
      }));
      throw err;
    }
  };

  // Register
  const register = async (
    email: string,
    username: string,
    password: string,
    displayName?: string
  ) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          username,
          password,
          display_name: displayName,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Registration failed');
      }

      // Auto-login after registration
      await login(email, password);
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Registration failed',
      }));
      throw err;
    }
  };

  // Logout
  const logout = () => {
    clearTokens();
    setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  };

  // Public refresh token
  const refreshToken = async (): Promise<boolean> => {
    const success = await refreshTokenInternal();
    if (success) {
      const user = await fetchCurrentUser();
      setState((prev) => ({
        ...prev,
        user,
        isAuthenticated: !!user,
      }));
    } else {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    }
    return success;
  };

  // Refresh user data (after profile update)
  const refreshUser = async () => {
    const user = await fetchCurrentUser();
    if (user) {
      setState((prev) => ({ ...prev, user }));
    }
  };

  // Clear error
  const clearError = () => {
    setState((prev) => ({ ...prev, error: null }));
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        refreshToken,
        refreshUser,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper function to get auth header for API calls
export function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

// Export token key for use in API client
export { ACCESS_TOKEN_KEY };
