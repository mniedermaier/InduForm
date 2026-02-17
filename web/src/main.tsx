import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from './contexts/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'
import './index.css'

async function boot() {
  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    const { enableDemoMode } = await import('./demo/enableDemoMode');
    await enableDemoMode();
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ThemeProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ThemeProvider>
    </React.StrictMode>,
  );
}

boot();
