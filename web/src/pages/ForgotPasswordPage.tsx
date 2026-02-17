import { useState, FormEvent } from 'react';
import ParticleBackground from '../components/ParticleBackground';
import { api, ApiError } from '../api/client';

interface ForgotPasswordPageProps {
  onSwitchToLogin: () => void;
}

export default function ForgotPasswordPage({ onSwitchToLogin }: ForgotPasswordPageProps) {
  const [view, setView] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleRequestReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setIsLoading(true);
    try {
      const data = await api.forgotPassword(email);

      // In development mode, the API returns the reset token directly
      if (data.reset_token) {
        setToken(data.reset_token);
      }

      setSuccessMessage(
        'If an account exists with that email, a password reset link has been generated. ' +
        'Check below for the reset token.'
      );
      setView('reset');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!token.trim()) {
      setError('Reset token is required');
      return;
    }

    if (!newPassword) {
      setError('New password is required');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await api.resetPassword(token, newPassword);

      setSuccessMessage('Password has been reset successfully. You can now sign in with your new password.');
      setToken('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 px-4 py-8 relative overflow-hidden">
      <ParticleBackground />
      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-8">
          <img src="/favicon.svg" alt="InduForm" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white">InduForm</h1>
          <p className="text-blue-200 mt-2">
            IEC 62443 Zone/Conduit Security Editor
          </p>
        </div>

        <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-lg shadow-2xl p-8">
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-6">
            {view === 'request' ? 'Forgot Password' : 'Reset Password'}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-green-700 dark:text-green-300 text-sm">
              {successMessage}
            </div>
          )}

          {view === 'request' ? (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Enter your email address and we will generate a password reset token.
              </p>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={isLoading}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
              >
                {isLoading ? 'Sending...' : 'Send Reset Token'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setView('reset');
                  }}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Already have a reset token?
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label
                  htmlFor="resetToken"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Reset Token
                </label>
                <input
                  type="text"
                  id="resetToken"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-xs"
                  placeholder="Paste your reset token here"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  New Password
                </label>
                <input
                  type="password"
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  disabled={isLoading}
                />
              </div>

              <div>
                <label
                  htmlFor="confirmNewPassword"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Confirm New Password
                </label>
                <input
                  type="password"
                  id="confirmNewPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  disabled={isLoading}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
              >
                {isLoading ? 'Resetting...' : 'Reset Password'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setView('request');
                  }}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                >
                  Request a new token
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            <button
              onClick={onSwitchToLogin}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
