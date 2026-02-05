import { useState, useEffect, useMemo } from 'react';
import { api, TemplateInfo } from '../api/client';
import type { Project } from '../types/models';
import DialogShell from './DialogShell';

const BUILTIN_TEMPLATE_ICONS: Record<string, string> = {
  'builtin:purdue-model': '🏭',
  'builtin:manufacturing-plant': '🔧',
  'builtin:water-treatment': '💧',
  'builtin:power-substation': '⚡',
};

const CATEGORY_ICONS: Record<string, string> = {
  'manufacturing': '🔧',
  'utility': '💧',
  'reference': '📐',
  'custom': '📁',
};

interface CreateProjectDialogProps {
  onClose: () => void;
  onCreate: (name: string, description: string, templateProject?: Project) => Promise<void>;
}

export default function CreateProjectDialog({ onClose, onCreate }: CreateProjectDialogProps) {
  const [step, setStep] = useState<'template' | 'details'>('template');
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>('blank');
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUserTemplates, setShowUserTemplates] = useState(true);

  // Load templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoadingTemplates(true);
        const result = await api.listTemplates();
        setTemplates(result);
      } catch (err) {
        console.error('Failed to load templates:', err);
        // Don't show error, just skip templates
      } finally {
        setLoadingTemplates(false);
      }
    };
    fetchTemplates();
  }, []);

  // Group templates
  const { builtinTemplates, userTemplates } = useMemo(() => {
    const builtin = templates.filter(t => t.is_builtin);
    const user = templates.filter(t => !t.is_builtin);
    return { builtinTemplates: builtin, userTemplates: user };
  }, [templates]);

  const handleNext = () => {
    // Pre-fill name from template if selected
    if (selectedTemplateId && selectedTemplateId !== 'blank') {
      const template = templates.find(t => t.id === selectedTemplateId);
      if (template && !name) {
        setName(template.name);
        setDescription(template.description || '');
      }
    }
    setStep('details');
  };

  const handleBack = () => {
    setStep('template');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let templateProject: Project | undefined;

      // Load template data if not blank
      if (selectedTemplateId && selectedTemplateId !== 'blank') {
        try {
          const result = await api.getTemplate(selectedTemplateId);
          templateProject = result.project;
        } catch (err) {
          console.error('Failed to load template:', err);
          setError('Failed to load template. Creating blank project instead.');
        }
      }

      await onCreate(name.trim(), description.trim(), templateProject);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const getTemplateIcon = (template: TemplateInfo) => {
    if (template.is_builtin && BUILTIN_TEMPLATE_ICONS[template.id]) {
      return BUILTIN_TEMPLATE_ICONS[template.id];
    }
    if (template.category && CATEGORY_ICONS[template.category]) {
      return CATEGORY_ICONS[template.category];
    }
    return '📄';
  };

  return (
    <DialogShell title={step === 'template' ? 'Choose a Template' : 'Project Details'} onClose={onClose} maxWidth="max-w-2xl">
        <div className="max-h-[calc(85vh-4rem)] flex flex-col">
        {/* Description */}
        <div className="px-4 pb-2 -mt-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {step === 'template'
              ? 'Start with a pre-configured template or blank project'
              : 'Enter a name and description for your project'}
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {step === 'template' ? (
            <div className="space-y-4">
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <>
                  {/* Blank Project Option */}
                  <button
                    onClick={() => setSelectedTemplateId('blank')}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                      selectedTemplateId === 'blank'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-800'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📄</span>
                      <div>
                        <span className="font-medium text-gray-800 dark:text-gray-100">Blank Project</span>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Start from scratch with an empty project
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Built-in Templates */}
                  {builtinTemplates.length > 0 && (
                    <>
                      <div className="text-sm font-medium text-gray-600 dark:text-gray-300 mt-4 mb-2">
                        Built-in Templates
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {builtinTemplates.map(template => (
                          <button
                            key={template.id}
                            onClick={() => setSelectedTemplateId(template.id)}
                            className={`p-4 rounded-lg border-2 text-left transition-all ${
                              selectedTemplateId === template.id
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-800'
                                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                            }`}
                          >
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-2xl">{getTemplateIcon(template)}</span>
                              <span className="font-medium text-gray-800 dark:text-gray-100">{template.name}</span>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{template.description}</p>
                            <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                              <span>{template.zone_count} zones</span>
                              <span>·</span>
                              <span>{template.asset_count} assets</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {/* User Templates */}
                  {userTemplates.length > 0 && (
                    <>
                      <div className="flex items-center justify-between mt-6 mb-2">
                        <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
                          My Templates ({userTemplates.length})
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowUserTemplates(!showUserTemplates)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {showUserTemplates ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      {showUserTemplates && (
                        <div className="grid grid-cols-2 gap-3">
                          {userTemplates.map(template => (
                            <button
                              key={template.id}
                              onClick={() => setSelectedTemplateId(template.id)}
                              className={`p-4 rounded-lg border-2 text-left transition-all ${
                                selectedTemplateId === template.id
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-800'
                                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                              }`}
                            >
                              <div className="flex items-center gap-3 mb-2">
                                <span className="text-2xl">{getTemplateIcon(template)}</span>
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium text-gray-800 dark:text-gray-100 block truncate">{template.name}</span>
                                  {template.is_public && (
                                    <span className="text-xs text-green-600 dark:text-green-400">Public</span>
                                  )}
                                </div>
                              </div>
                              {template.description && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{template.description}</p>
                              )}
                              <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                                <span>{template.zone_count} zones</span>
                                <span>·</span>
                                <span>{template.asset_count} assets</span>
                                {template.owner_username && (
                                  <>
                                    <span>·</span>
                                    <span>by {template.owner_username}</span>
                                  </>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Preview */}
                  {selectedTemplate && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{getTemplateIcon(selectedTemplate)}</span>
                        <h4 className="font-medium text-gray-800 dark:text-gray-100">
                          {selectedTemplate.name}
                        </h4>
                        {selectedTemplate.is_builtin && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                            Built-in
                          </span>
                        )}
                        {selectedTemplate.category && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 capitalize">
                            {selectedTemplate.category}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {selectedTemplate.description}
                      </p>
                      <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                        <span>{selectedTemplate.zone_count} zones</span>
                        <span>{selectedTemplate.conduit_count} conduits</span>
                        <span>{selectedTemplate.asset_count} assets</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <form id="project-form" onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Manufacturing Plant Alpha"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Brief description of the project..."
                />
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                  Template: {selectedTemplateId === 'blank' ? 'Blank Project' : selectedTemplate?.name || 'None'}
                </div>
                <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <li>• Standard: IEC 62443</li>
                  <li>• You will be the project owner</li>
                  <li>• You can share with team members later</li>
                </ul>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
          <div>
            {step === 'details' && (
              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            >
              Cancel
            </button>
            {step === 'template' ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={loadingTemplates}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                form="project-form"
                disabled={loading || !name.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {loading && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                Create Project
              </button>
            )}
          </div>
        </div>
        </div>
    </DialogShell>
  );
}
