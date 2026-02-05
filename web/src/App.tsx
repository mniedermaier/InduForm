import { useState, useEffect } from 'react';

import type { Project } from './types/models';
import { setAuthErrorCallback } from './api/client';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import TeamManagementDialog from './components/TeamManagementDialog';
import CreateProjectDialog from './components/CreateProjectDialog';
import ShareProjectDialog from './components/ShareProjectDialog';
import ProjectEditor from './components/ProjectEditor';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ProjectsPage from './pages/ProjectsPage';

// Auth wrapper that handles login/register flow and navigation
function AuthWrapper() {
  const { isAuthenticated, isLoading: authLoading, logout, refreshToken } = useAuth();
  const toast = useToast();
  const [authPage, setAuthPage] = useState<'login' | 'register'>('login');
  const [currentView, setCurrentView] = useState<'projects' | 'editor'>('projects');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [showTeamManagement, setShowTeamManagement] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [shareProject, setShareProject] = useState<{ id: string; name: string } | null>(null);

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

  // Show login/register if not authenticated
  if (!isAuthenticated) {
    if (authPage === 'register') {
      return <RegisterPage onSwitchToLogin={() => setAuthPage('login')} />;
    }
    return <LoginPage onSwitchToRegister={() => setAuthPage('register')} />;
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

  // Show projects landing page
  if (currentView === 'projects') {
    return (
      <>
        <ProjectsPage
          onOpenProject={handleOpenProject}
          onOpenTeamManagement={() => setShowTeamManagement(true)}
          onCreateProject={() => setShowCreateProject(true)}
          onShareProject={(id, name) => setShareProject({ id, name })}
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
      </>
    );
  }

  // Show project editor
  return (
    <ProjectEditor
      projectId={currentProjectId!}
      onBackToProjects={handleBackToProjects}
    />
  );
}

// Main App wrapper with AuthProvider and ToastProvider
function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ErrorBoundary>
          <AuthWrapper />
        </ErrorBoundary>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
