import { memo, useState, useEffect } from 'react';
import type { Project } from '../types/models';
import { api } from '../api/client';
import DialogShell from './DialogShell';

type GeneratorType = 'firewall' | 'vlan' | 'report';

interface GenerateOutputDialogProps {
  project: Project;
  generator: GeneratorType;
  onClose: () => void;
}

function formatContent(content: unknown): string {
  if (typeof content === 'string') return content;
  return JSON.stringify(content, null, 2);
}

const GENERATOR_INFO: Record<GeneratorType, { title: string; description: string }> = {
  firewall: {
    title: 'Firewall Rules',
    description: 'Generated firewall rules based on zone conduits and protocol flows',
  },
  vlan: {
    title: 'VLAN Mapping',
    description: 'VLAN configuration suggestions based on zone hierarchy',
  },
  report: {
    title: 'Compliance Report',
    description: 'IEC 62443 compliance assessment report',
  },
};

const GenerateOutputDialog = memo(({
  project,
  generator,
  onClose,
}: GenerateOutputDialogProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<unknown>(null);

  const info = GENERATOR_INFO[generator];

  useEffect(() => {
    const generateContent = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.generate(project, generator);
        setContent(result.content);
      } catch (err: any) {
        console.error('Generate error:', err);
        setError(err.message || 'Failed to generate output');
      } finally {
        setLoading(false);
      }
    };

    generateContent();
  }, [project, generator]);

  const handleCopy = () => {
    const text = formatContent(content);
    navigator.clipboard.writeText(text);
  };

  const handleDownload = () => {
    const text = formatContent(content);

    const extension = generator === 'report' ? 'md' : 'json';
    const mimeType = generator === 'report' ? 'text/markdown' : 'application/json';
    const filename = `${project.project.name.replace(/\s+/g, '_')}_${generator}.${extension}`;

    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DialogShell title={info.title} onClose={onClose} maxWidth="max-w-4xl">
        <div className="max-h-[calc(85vh-4rem)] flex flex-col">
        {/* Description */}
        <div className="px-6 pb-2 -mt-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">{info.description}</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600 dark:text-gray-400">Generating...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded">
              <div className="font-medium">Generation Failed</div>
              <div className="text-sm">{error}</div>
            </div>
          )}

          {!loading && !error && content !== null && (
            <div className="bg-gray-900 rounded-lg p-4 overflow-auto">
              <pre className="text-sm text-gray-100 whitespace-pre-wrap font-mono">
                {formatContent(content)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Generated for: {project.project.name}
          </div>
          <div className="flex gap-2">
            {!loading && !error && content !== null && (
              <>
                <button
                  onClick={handleCopy}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Copy to Clipboard
                </button>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700"
                >
                  Download
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
        </div>
    </DialogShell>
  );
});

GenerateOutputDialog.displayName = 'GenerateOutputDialog';

export default GenerateOutputDialog;
