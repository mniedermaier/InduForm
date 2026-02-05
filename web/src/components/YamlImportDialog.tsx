import { memo, useState, useCallback } from 'react';

interface YamlImportDialogProps {
  onClose: () => void;
  onImported: (projectId: string) => void;
}

const API_BASE = '/api';

const YamlImportDialog = memo(({ onClose, onImported }: YamlImportDialogProps) => {
  const [yamlContent, setYamlContent] = useState('');
  const [filename, setFilename] = useState('');
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFilename(file.name);
    // Extract project name from filename
    const baseName = file.name.replace(/\.(yaml|yml)$/i, '');
    setProjectName(baseName);

    const reader = new FileReader();
    reader.onload = (event) => {
      setYamlContent(event.target?.result as string);
    };
    reader.onerror = () => {
      setError('Failed to read file');
    };
    reader.readAsText(file);
  }, []);

  const handleImport = useCallback(async () => {
    if (!yamlContent.trim()) {
      setError('Please select a YAML file or paste YAML content');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('induform_access_token');
      const response = await fetch(`${API_BASE}/projects/import/yaml`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          yaml_content: yamlContent,
          name: projectName.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || 'Failed to import project');
      }

      const data = await response.json();
      onImported(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import project');
    } finally {
      setLoading(false);
    }
  }, [yamlContent, projectName, onImported]);

  const previewLines = yamlContent.split('\n').slice(0, 20);
  const hasMore = yamlContent.split('\n').length > 20;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            Import from YAML
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            &#10005;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select YAML File
            </label>
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".yaml,.yml"
                onChange={handleFileChange}
                className="hidden"
                id="yaml-file"
              />
              <label htmlFor="yaml-file" className="cursor-pointer block">
                <div className="text-3xl mb-2">📄</div>
                <div className="text-gray-600 dark:text-gray-400">
                  {filename || 'Click to select a YAML file'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  .yaml or .yml files
                </div>
              </label>
            </div>
          </div>

          {/* Or paste YAML */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Or Paste YAML Content
            </label>
            <textarea
              value={yamlContent}
              onChange={(e) => setYamlContent(e.target.value)}
              placeholder="Paste YAML content here..."
              rows={8}
              className="w-full px-3 py-2 text-sm font-mono border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 resize-none"
            />
          </div>

          {/* Project Name Override */}
          {yamlContent && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Project Name (optional override)
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Leave blank to use name from YAML"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
              />
            </div>
          )}

          {/* Preview */}
          {yamlContent && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Preview
              </label>
              <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto max-h-48 overflow-y-auto">
                {previewLines.join('\n')}
                {hasMore && '\n...'}
              </pre>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {yamlContent.split('\n').length} lines
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !yamlContent.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
          >
            {loading ? 'Importing...' : 'Import Project'}
          </button>
        </div>
      </div>
    </div>
  );
});

YamlImportDialog.displayName = 'YamlImportDialog';

export default YamlImportDialog;
