import { useState, useEffect } from 'react';
import { api, FileInfo } from '../api/client';

interface FileManagerDialogProps {
  mode: 'open' | 'new' | 'save-as';
  currentFile?: string;
  onSelect: (fileInfo: FileInfo | string) => void;
  onCancel: () => void;
}

export default function FileManagerDialog({
  mode,
  currentFile,
  onSelect,
  onCancel,
}: FileManagerDialogProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newFilename, setNewFilename] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);

  useEffect(() => {
    if (mode === 'open') {
      loadFiles();
    } else {
      setLoading(false);
    }
  }, [mode]);

  const loadFiles = async () => {
    try {
      const fileList = await api.listFiles();
      setFiles(fileList);
    } catch (err) {
      setError('Failed to load files');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'open') {
      if (!selectedFile) {
        setError('Please select a file');
        return;
      }
      onSelect(selectedFile);
    } else {
      // new or save-as
      if (!newFilename.trim()) {
        setError('Please enter a filename');
        return;
      }
      // Check for invalid characters
      if (/[<>:"/\\|?*]/.test(newFilename)) {
        setError('Filename contains invalid characters');
        return;
      }
      onSelect(newFilename.trim());
    }
  };

  const title = {
    open: 'Open Project',
    new: 'New Project',
    'save-as': 'Save Project As',
  }[mode];

  const submitLabel = {
    open: 'Open',
    new: 'Create',
    'save-as': 'Save',
  }[mode];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-2 rounded text-sm mb-4">
              {error}
            </div>
          )}

          {mode === 'open' ? (
            <div>
              {loading ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading files...</div>
              ) : files.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">No project files found</div>
              ) : (
                <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md">
                  {files.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => setSelectedFile(file)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        selectedFile?.path === file.path ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700' : ''
                      } ${file.path === currentFile ? 'font-medium' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                            {file.name}
                            {file.path === currentFile && (
                              <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">(current)</span>
                            )}
                          </div>
                          {file.project_name && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{file.project_name}</div>
                          )}
                        </div>
                        {selectedFile?.path === file.path && (
                          <span className="text-blue-600 dark:text-blue-400">&#10003;</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Filename
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newFilename}
                  onChange={(e) => setNewFilename(e.target.value)}
                  placeholder="my_project"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  autoFocus
                />
                <span className="text-gray-500 dark:text-gray-400">.yaml</span>
              </div>
              {mode === 'save-as' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  The current project will be saved to this new file.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (mode === 'open' && !selectedFile)}
              className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
