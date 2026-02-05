import { useState, memo } from 'react';
import type { ProjectMetadata, ComplianceStandard } from '../types/models';
import { COMPLIANCE_STANDARDS } from '../types/models';
import DialogShell from './DialogShell';

interface ProjectSettingsDialogProps {
  metadata: ProjectMetadata;
  onSave: (metadata: ProjectMetadata) => void;
  onCancel: () => void;
}

const ProjectSettingsDialog = memo(({
  metadata,
  onSave,
  onCancel,
}: ProjectSettingsDialogProps) => {
  const [name, setName] = useState(metadata.name);
  const [description, setDescription] = useState(metadata.description || '');
  const [author, setAuthor] = useState(metadata.author || '');
  const [version, setVersion] = useState(metadata.version || '');
  const [complianceStandards, setComplianceStandards] = useState<ComplianceStandard[]>(
    metadata.compliance_standards || ['IEC62443']
  );
  const [allowedProtocols, setAllowedProtocols] = useState<string[]>(
    metadata.allowed_protocols || []
  );
  const [newProtocol, setNewProtocol] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggleStandard = (standardId: ComplianceStandard) => {
    setComplianceStandards(prev => {
      if (prev.includes(standardId)) {
        // Don't allow deselecting the last one
        if (prev.length <= 1) return prev;
        return prev.filter(s => s !== standardId);
      }
      return [...prev, standardId];
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    if (complianceStandards.length === 0) {
      setError('At least one compliance standard must be selected');
      return;
    }

    onSave({
      ...metadata,
      name: name.trim(),
      description: description.trim() || undefined,
      author: author.trim() || undefined,
      version: version.trim() || undefined,
      compliance_standards: complianceStandards,
      allowed_protocols: allowedProtocols,
    });
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <DialogShell title="Project Settings" onClose={onCancel} maxWidth="max-w-lg">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className={labelClass}>
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Manufacturing Plant Alpha"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the purpose and scope of this project"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Author
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g., John Doe"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Version
            </label>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g., 1.0.0"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Compliance Standards <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Select the compliance frameworks to validate against. At least one is required.
            </p>
            <div className="space-y-2">
              {COMPLIANCE_STANDARDS.map(standard => {
                const isChecked = complianceStandards.includes(standard.id);
                return (
                  <label
                    key={standard.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleStandard(standard.id)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: standard.color }}
                        />
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-100">
                          {standard.name}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                        {standard.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Additional Allowed Protocols
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Add project-specific protocols to the built-in allowlist (28 industrial protocols always included).
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newProtocol}
                onChange={(e) => setNewProtocol(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const proto = newProtocol.trim().toLowerCase();
                    if (proto && !allowedProtocols.includes(proto)) {
                      setAllowedProtocols(prev => [...prev, proto]);
                      setNewProtocol('');
                    }
                  }
                }}
                placeholder="e.g., sql, coap, grpc"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => {
                  const proto = newProtocol.trim().toLowerCase();
                  if (proto && !allowedProtocols.includes(proto)) {
                    setAllowedProtocols(prev => [...prev, proto]);
                    setNewProtocol('');
                  }
                }}
                className="px-3 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 whitespace-nowrap"
              >
                Add
              </button>
            </div>
            {allowedProtocols.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {allowedProtocols.map(proto => (
                  <span
                    key={proto}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                  >
                    {proto}
                    <button
                      type="button"
                      onClick={() => setAllowedProtocols(prev => prev.filter(p => p !== proto))}
                      className="ml-0.5 text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </form>
    </DialogShell>
  );
});

ProjectSettingsDialog.displayName = 'ProjectSettingsDialog';

export default ProjectSettingsDialog;
