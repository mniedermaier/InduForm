import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type ThemePreference = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: ResolvedTheme;
  preference: ThemePreference;
  toggleTheme: () => void;
  setTheme: (theme: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem('induform-theme') as ThemePreference | null;
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return 'system';
  });

  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    if (preference === 'system') return getSystemTheme();
    return preference;
  });

  // Resolve theme when preference changes
  useEffect(() => {
    if (preference === 'system') {
      setResolved(getSystemTheme());
    } else {
      setResolved(preference);
    }
  }, [preference]);

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    if (preference !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setResolved(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [preference]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (resolved === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('induform-theme', preference);
  }, [resolved, preference]);

  const toggleTheme = () => {
    // Toggle cycles: light -> dark -> light (ignores system in toggle)
    setPreference(prev => {
      if (prev === 'system') return resolved === 'dark' ? 'light' : 'dark';
      return prev === 'light' ? 'dark' : 'light';
    });
  };

  const setTheme = (newTheme: ThemePreference) => {
    setPreference(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme: resolved, preference, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
