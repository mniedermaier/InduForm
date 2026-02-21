import { memo, useState, useEffect } from 'react';
import { api, TemplateInfo } from '../api/client';
import type { Project } from '../types/models';

interface TemplateSelectorProps {
  onSelect: (project: Project, templateName: string) => void;
  onCancel: () => void;
}

const TEMPLATE_ICONS: Record<string, string> = {
  'purdue-model': '🏭',
  'manufacturing-plant': '🔧',
  'water-treatment': '💧',
  'power-substation': '⚡',
};

const TemplateSelector = memo(({ onSelect, onCancel }: TemplateSelectorProps) => {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        setLoading(true);
        const result = await api.listTemplates();
        setTemplates(result);
        if (result.length > 0) {
          setSelectedId(result[0].id);
        }
      } catch {
        setError('Failed to load templates');
      } finally {
        setLoading(false);
      }
    };

    fetchTemplates();
  }, []);

  const handleCreate = async () => {
    if (!selectedId) return;

    try {
      setLoadingTemplate(true);
      const result = await api.getTemplate(selectedId);
      onSelect(result.project, result.name);
    } catch {
      setError('Failed to load template');
    } finally {
      setLoadingTemplate(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedId);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Choose a Template</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Start with a pre-configured OT network architecture
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
              {error}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Template Grid */}
              <div className="grid grid-cols-2 gap-4">
                {templates.map(template => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedId(template.id)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      selectedId === template.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-800'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{TEMPLATE_ICONS[template.id] || '📁'}</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">{template.name}</span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{template.description}</p>
                  </button>
                ))}
              </div>

              {/* Blank Project Option */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <button
                  onClick={() => setSelectedId('blank')}
                  className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                    selectedId === 'blank'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-800'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">📄</span>
                    <span className="font-medium text-gray-800 dark:text-gray-100">Blank Project</span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Start from scratch with an empty project
                  </p>
                </button>
              </div>

              {/* Preview */}
              {selectedTemplate && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 dark:text-gray-100 mb-2">
                    {selectedTemplate.name} Preview
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedTemplate.description}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedId || loadingTemplate}
            className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loadingTemplate ? (
              <>
                <span className="animate-spin">⏳</span>
                Loading...
              </>
            ) : (
              <>Create Project</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

TemplateSelector.displayName = 'TemplateSelector';

export default TemplateSelector;
