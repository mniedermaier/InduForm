import { memo, useState, useEffect, useCallback } from 'react';
import type { Project } from '../types/models';
import { api } from '../api/client';
import DialogShell from './DialogShell';

type GeneratorType = 'firewall' | 'vlan' | 'report';

type FirewallFormat = 'json' | 'iptables' | 'fortinet' | 'paloalto' | 'cisco_asa';

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

const FIREWALL_FORMAT_OPTIONS: { value: FirewallFormat; label: string; extension: string; mimeType: string }[] = [
  { value: 'json', label: 'JSON (Generic)', extension: 'json', mimeType: 'application/json' },
  { value: 'iptables', label: 'iptables (Linux)', extension: 'rules', mimeType: 'text/plain' },
  { value: 'fortinet', label: 'Fortinet FortiGate (FortiOS CLI)', extension: 'conf', mimeType: 'text/plain' },
  { value: 'paloalto', label: 'Palo Alto (PAN-OS)', extension: 'conf', mimeType: 'text/plain' },
  { value: 'cisco_asa', label: 'Cisco ASA (ACL)', extension: 'conf', mimeType: 'text/plain' },
];

const GenerateOutputDialog = memo(({
  project,
  generator,
  onClose,
}: GenerateOutputDialogProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<unknown>(null);
  const [firewallFormat, setFirewallFormat] = useState<FirewallFormat>('json');

  const info = GENERATOR_INFO[generator];

  const generateContent = useCallback(async (format?: FirewallFormat) => {
    setLoading(true);
    setError(null);
    try {
      const options: Record<string, unknown> = {};
      if (generator === 'firewall' && format) {
        options.format = format;
      }
      const result = await api.generate(project, generator, options);
      setContent(result.content);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate output');
    } finally {
      setLoading(false);
    }
  }, [project, generator]);

  useEffect(() => {
    generateContent(generator === 'firewall' ? firewallFormat : undefined);
  }, [generateContent, generator, firewallFormat]);

  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFormat = e.target.value as FirewallFormat;
    setFirewallFormat(newFormat);
  };

  const handleCopy = () => {
    const text = formatContent(content);
    navigator.clipboard.writeText(text);
  };

  const handleDownload = () => {
    const text = formatContent(content);

    let extension: string;
    let mimeType: string;

    if (generator === 'firewall') {
      const formatInfo = FIREWALL_FORMAT_OPTIONS.find(f => f.value === firewallFormat);
      extension = formatInfo?.extension ?? 'json';
      mimeType = formatInfo?.mimeType ?? 'application/json';
    } else if (generator === 'report') {
      extension = 'md';
      mimeType = 'text/markdown';
    } else {
      extension = 'json';
      mimeType = 'application/json';
    }

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

        {/* Format selector for firewall generator */}
        {generator === 'firewall' && (
          <div className="px-6 pb-3">
            <label htmlFor="firewall-format" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Export Format
            </label>
            <select
              id="firewall-format"
              value={firewallFormat}
              onChange={handleFormatChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {FIREWALL_FORMAT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

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
