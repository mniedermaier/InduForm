import { useState, useEffect, useCallback } from 'react';

import type { Project } from './types/models';
import { setAuthErrorCallback } from './api/client';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import TeamManagementDialog from './components/TeamManagementDialog';
import CreateProjectDialog from './components/CreateProjectDialog';
import ShareProjectDialog from './components/ShareProjectDialog';
import GlobalSearchDialog from './components/GlobalSearchDialog';
import ProjectEditor from './components/ProjectEditor';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ProjectsPage from './pages/ProjectsPage';
import AdminPage from './pages/AdminPage';

// Auth wrapper that handles login/register flow and navigation
function AuthWrapper() {
  const { isAuthenticated, isLoading: authLoading, logout, refreshToken } = useAuth();
  const toast = useToast();
  const [authPage, setAuthPage] = useState<'login' | 'register' | 'forgot-password'>('login');
  const [currentView, setCurrentView] = useState<'projects' | 'editor' | 'admin'>('projects');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [shareProject, setShareProject] = useState<{ id: string; name: string } | null>(null);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);

  // Global Ctrl+K shortcut to open search
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === 'k') {
        e.preventDefault();
        setShowGlobalSearch(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthenticated]);

  const handleOpenGlobalSearch = useCallback(() => {
    setShowGlobalSearch(true);
  }, []);

  // Set up auth error callback
  useEffect(() => {
    setAuthErrorCallback(async () => {
      const success = await refreshToken();
      if (!success) {
        toast.warning('Session expired. Please log in again.');
        logout();
      }
    });

    return () => setAuthErrorCallback(null);
  }, [refreshToken, logout, toast]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <img src="/logo.svg" alt="InduForm" className="w-24 h-24 mx-auto mb-4 animate-pulse" />
          <div className="text-gray-600 dark:text-gray-400">Loading...</div>
        </div>
      </div>
    );
  }

  // Show login/register/forgot-password if not authenticated
  if (!isAuthenticated) {
    if (authPage === 'register') {
      return <RegisterPage onSwitchToLogin={() => setAuthPage('login')} />;
    }
    if (authPage === 'forgot-password') {
      return <ForgotPasswordPage onSwitchToLogin={() => setAuthPage('login')} />;
    }
    return (
      <LoginPage
        onSwitchToRegister={() => setAuthPage('register')}
        onSwitchToForgotPassword={() => setAuthPage('forgot-password')}
      />
    );
  }

  const handleOpenProject = (projectId: string) => {
    setCurrentProjectId(projectId);
    setCurrentView('editor');
  };

  const handleBackToProjects = () => {
    setCurrentView('projects');
    setCurrentProjectId(null);
  };

  const handleCreateProject = async (name: string, description: string, templateProject?: Project) => {
    const token = localStorage.getItem('induform_access_token');

    try {
      // First create the project
      const response = await fetch('/api/projects/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, description }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create project');
      }

      const project = await response.json();

      // If template provided, update the project with template data
      if (templateProject) {
        const updateResponse = await fetch(`/api/projects/${project.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...templateProject,
            project: {
              ...templateProject.project,
              name,
              description,
            },
          }),
        });

        if (!updateResponse.ok) {
          toast.warning('Project created, but template could not be applied');
        }
      }

      setShowCreateProject(false);
      toast.success(`Project "${name}" created successfully`);
      handleOpenProject(project.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create project');
      throw err;
    }
  };

  // Show admin page
  if (currentView === 'admin') {
    return (
      <AdminPage onBackToProjects={handleBackToProjects} />
    );
  }

  // Show projects landing page
  if (currentView === 'projects') {
    return (
      <>
        <ProjectsPage
          onOpenProject={handleOpenProject}
          onOpenTeamManagement={() => setShowTeamManagement(true)}
          onCreateProject={() => setShowCreateProject(true)}
          onShareProject={(id, name) => setShareProject({ id, name })}
          onOpenAdmin={() => setCurrentView('admin')}
          onOpenGlobalSearch={handleOpenGlobalSearch}
        />

        {showTeamManagement && (
          <TeamManagementDialog onClose={() => setShowTeamManagement(false)} />
        )}

        {showCreateProject && (
          <CreateProjectDialog
            onClose={() => setShowCreateProject(false)}
            onCreate={handleCreateProject}
          />
        )}

        {shareProject && (
          <ShareProjectDialog
            projectId={shareProject.id}
            projectName={shareProject.name}
            onClose={() => setShareProject(null)}
          />
        )}

        {showGlobalSearch && (
          <GlobalSearchDialog
            onClose={() => setShowGlobalSearch(false)}
            onNavigateToProject={handleOpenProject}
          />
        )}
      </>
    );
  }

  // Show project editor
  return (
    <>
      <ProjectEditor
        projectId={currentProjectId!}
        onBackToProjects={handleBackToProjects}
        onOpenGlobalSearch={handleOpenGlobalSearch}
        onOpenAdmin={() => setCurrentView('admin')}
      />

      {showGlobalSearch && (
        <GlobalSearchDialog
          onClose={() => setShowGlobalSearch(false)}
          onNavigateToProject={handleOpenProject}
        />
      )}
    </>
  );
}

import DemoBanner from './components/DemoBanner';

// Main App wrapper with AuthProvider and ToastProvider
function App() {
  return (
    <ToastProvider>
      {import.meta.env.VITE_DEMO_MODE === 'true' && <DemoBanner />}
      <AuthProvider>
        <ErrorBoundary>
          <AuthWrapper />
        </ErrorBoundary>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
