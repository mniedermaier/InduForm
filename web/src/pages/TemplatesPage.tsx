import { useState, useEffect, useCallback } from 'react';
import { api, TemplateInfo } from '../api/client';
import NetworkBackground from '../components/NetworkBackground';

interface TemplatesPageProps {
  onBack: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  'manufacturing': '🔧',
  'utility': '💧',
  'reference': '📐',
  'custom': '📁',
};

export default function TemplatesPage({ onBack }: TemplatesPageProps) {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'builtin' | 'mine'>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editTemplate, setEditTemplate] = useState<TemplateInfo | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const result = await api.listTemplates();
      setTemplates(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleDelete = useCallback(async (templateId: string) => {
    try {
      await api.deleteTemplate(templateId);
      setDeleteConfirm(null);
      fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    }
  }, [fetchTemplates]);

  const handleUpdate = useCallback(async (templateId: string, data: { name?: string; description?: string; is_public?: boolean }) => {
    try {
      await api.updateTemplate(templateId, data);
      setEditTemplate(null);
      fetchTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update template');
    }
  }, [fetchTemplates]);

  const filteredTemplates = templates.filter(t => {
    if (filter === 'builtin') return t.is_builtin;
    if (filter === 'mine') return !t.is_builtin;
    return true;
  });

  const builtinCount = templates.filter(t => t.is_builtin).length;
  const userCount = templates.filter(t => !t.is_builtin).length;

  return (
    <div className="min-h-screen relative bg-gray-50 dark:bg-slate-900">
      <NetworkBackground />

      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-slate-700/50 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Template Library</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        {/* Filter tabs */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex gap-1 bg-gray-100 dark:bg-slate-700/50 rounded-lg p-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                filter === 'all' ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              All ({templates.length})
            </button>
            <button
              onClick={() => setFilter('builtin')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                filter === 'builtin' ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Built-in ({builtinCount})
            </button>
            <button
              onClick={() => setFilter('mine')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                filter === 'mine' ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              My Templates ({userCount})
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}

        {/* Templates grid */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map(template => (
              <div
                key={template.id}
                className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg border border-gray-200 dark:border-slate-700/50 p-4 hover:border-gray-400 dark:hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">
                      {CATEGORY_ICONS[template.category || ''] || '📄'}
                    </span>
                    <div>
                      <h3 className="font-medium text-gray-800 dark:text-slate-100">{template.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                        {template.is_builtin ? (
                          <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded">Built-in</span>
                        ) : (
                          <span>by {template.owner_username}</span>
                        )}
                        {template.is_public && !template.is_builtin && (
                          <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded">Public</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {!template.is_builtin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditTemplate(template)}
                        className="p-1.5 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(template.id)}
                        className="p-1.5 text-gray-400 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {template.description && (
                  <p className="text-sm text-gray-500 dark:text-slate-400 line-clamp-2 mb-3">{template.description}</p>
                )}

                <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-slate-500">
                  <span>{template.zone_count} zones</span>
                  <span>{template.asset_count} assets</span>
                  <span>{template.conduit_count} conduits</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredTemplates.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-2">📁</div>
            <div className="text-gray-600 dark:text-slate-300">No templates found</div>
            <div className="text-sm text-gray-500 dark:text-slate-400">
              {filter === 'mine'
                ? 'Save a project as a template to see it here'
                : 'Try a different filter'}
            </div>
          </div>
        )}
      </main>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md mx-4 border border-gray-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-2">Delete Template?</h3>
            <p className="text-gray-500 dark:text-slate-400 mb-4">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit dialog */}
      {editTemplate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md mx-4 border border-gray-200 dark:border-slate-700">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">Edit Template</h3>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleUpdate(editTemplate.id, {
                  name: formData.get('name') as string,
                  description: formData.get('description') as string || undefined,
                  is_public: formData.get('is_public') === 'on',
                });
              }}
              className="p-4 space-y-4"
            >
              <div>
                <label className="block text-sm text-gray-600 dark:text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editTemplate.name}
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-slate-300 mb-1">Description</label>
                <textarea
                  name="description"
                  defaultValue={editTemplate.description || ''}
                  rows={3}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-800 dark:text-slate-100 resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="is_public"
                  id="is_public"
                  defaultChecked={editTemplate.is_public}
                  className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-blue-600"
                />
                <label htmlFor="is_public" className="text-sm text-gray-600 dark:text-slate-300">
                  Make template public
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTemplate(null)}
                  className="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
