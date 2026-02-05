import { memo, useState, useCallback, useMemo } from 'react';
import { toPng, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import type { Project } from '../types/models';
import { api } from '../api/client';
import DialogShell from './DialogShell';

type ExportTab = 'diagram' | 'data' | 'reports';
type DiagramFormat = 'png' | 'svg' | 'pdf';
type DataFormat = 'yaml' | 'csv-zones' | 'csv-assets' | 'csv-conduits' | 'json';
type ReportFormat = 'firewall' | 'vlan' | 'report' | 'compliance-pdf';

interface ExportDialogProps {
  project: Project;
  projectId?: string; // For server-generated reports
  onClose: () => void;
  flowViewport?: HTMLElement | null;
  getNodesBounds?: () => { x: number; y: number; width: number; height: number };
}

interface ExportOptions {
  includeBackground: boolean;
  backgroundColor: string;
  includeLegend: boolean;
  scale: number;
  darkMode: boolean;
}

const DEFAULT_OPTIONS: ExportOptions = {
  includeBackground: true,
  backgroundColor: '#f3f4f6',
  darkMode: false,
  includeLegend: false,
  scale: 2,
};

const ExportDialog = memo(({
  project,
  projectId,
  onClose,
  flowViewport,
  getNodesBounds,
}: ExportDialogProps) => {
  const [activeTab, setActiveTab] = useState<ExportTab>('diagram');
  const [diagramFormat, setDiagramFormat] = useState<DiagramFormat>('png');
  const [dataFormat, setDataFormat] = useState<DataFormat>('yaml');
  const [reportFormat, setReportFormat] = useState<ReportFormat>('firewall');
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_OPTIONS);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const projectName = project.project.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');

  // Generate preview for data export
  const dataPreview = useMemo(() => {
    const maxLines = 15;
    let content: string;
    let language: string;

    switch (dataFormat) {
      case 'yaml':
        content = projectToYAML(project);
        language = 'yaml';
        break;
      case 'json':
        content = JSON.stringify(project, null, 2);
        language = 'json';
        break;
      case 'csv-zones':
        content = zonesToCSV(project);
        language = 'csv';
        break;
      case 'csv-assets':
        content = assetsToCSV(project);
        language = 'csv';
        break;
      case 'csv-conduits':
        content = conduitsToCSV(project);
        language = 'csv';
        break;
      default:
        content = '';
        language = 'text';
    }

    const lines = content.split('\n');
    const truncated = lines.length > maxLines;
    const preview = lines.slice(0, maxLines).join('\n');

    return { preview, truncated, totalLines: lines.length, language };
  }, [dataFormat, project]);

  // Download helper
  const downloadFile = useCallback((content: string | Blob, filename: string, mimeType: string) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Export diagram
  const exportDiagram = useCallback(async () => {
    if (!flowViewport) {
      setError('Diagram viewport not available');
      return;
    }

    setExporting(true);
    setError(null);
    setSuccess(null);

    try {
      const bounds = getNodesBounds?.() || { x: 0, y: 0, width: 800, height: 600 };
      const padding = 50;
      const width = (bounds.width + padding * 2) * options.scale;
      const height = (bounds.height + padding * 2) * options.scale;

      const exportOptions = {
        backgroundColor: options.includeBackground ? options.backgroundColor : 'transparent',
        width,
        height,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: `translate(${(-bounds.x + padding) * options.scale}px, ${(-bounds.y + padding) * options.scale}px) scale(${options.scale})`,
        },
        pixelRatio: 1,
      };

      let dataUrl: string;
      let filename: string;
      let mimeType: string;

      if (diagramFormat === 'svg') {
        dataUrl = await toSvg(flowViewport, exportOptions);
        filename = `${projectName}_diagram.svg`;
        mimeType = 'image/svg+xml';

        // Convert data URL to blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        downloadFile(blob, filename, mimeType);
      } else if (diagramFormat === 'png') {
        dataUrl = await toPng(flowViewport, exportOptions);
        filename = `${projectName}_diagram.png`;

        // Convert data URL to blob
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        downloadFile(blob, filename, 'image/png');
      } else if (diagramFormat === 'pdf') {
        // For PDF, first create PNG then embed in PDF using jsPDF
        dataUrl = await toPng(flowViewport, exportOptions);

        // Determine orientation based on dimensions
        const orientation = width > height ? 'landscape' : 'portrait';

        // Create PDF with appropriate page size
        const pdf = new jsPDF({
          orientation,
          unit: 'px',
          format: [width, height],
        });

        // Add the image to fill the page
        pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);

        // Save the PDF
        pdf.save(`${projectName}_diagram.pdf`);
      }

      setSuccess(`Diagram exported as ${diagramFormat.toUpperCase()}`);
    } catch (err) {
      console.error('Export error:', err);
      setError(`Failed to export diagram: ${err}`);
    } finally {
      setExporting(false);
    }
  }, [flowViewport, getNodesBounds, options, diagramFormat, projectName, downloadFile]);

  // Export data
  const exportData = useCallback(async () => {
    setExporting(true);
    setError(null);
    setSuccess(null);

    try {
      let content: string;
      let filename: string;
      let mimeType: string;

      switch (dataFormat) {
        case 'yaml':
          content = projectToYAML(project);
          filename = `${projectName}.yaml`;
          mimeType = 'text/yaml';
          break;

        case 'csv-zones':
          content = zonesToCSV(project);
          filename = `${projectName}_zones.csv`;
          mimeType = 'text/csv';
          break;

        case 'csv-assets':
          content = assetsToCSV(project);
          filename = `${projectName}_assets.csv`;
          mimeType = 'text/csv';
          break;

        case 'csv-conduits':
          content = conduitsToCSV(project);
          filename = `${projectName}_conduits.csv`;
          mimeType = 'text/csv';
          break;

        case 'json':
          content = JSON.stringify(project, null, 2);
          filename = `${projectName}.json`;
          mimeType = 'application/json';
          break;

        default:
          throw new Error(`Unknown format: ${dataFormat}`);
      }

      downloadFile(content, filename, mimeType);
      setSuccess(`Data exported as ${dataFormat.toUpperCase()}`);
    } catch (err) {
      console.error('Export error:', err);
      setError(`Failed to export data: ${err}`);
    } finally {
      setExporting(false);
    }
  }, [project, dataFormat, projectName, downloadFile]);

  // Export reports
  const exportReport = useCallback(async () => {
    setExporting(true);
    setError(null);
    setSuccess(null);

    try {
      // Handle PDF compliance report separately
      if (reportFormat === 'compliance-pdf') {
        if (!projectId) {
          throw new Error('Project must be saved to generate PDF report');
        }

        const token = localStorage.getItem('induform_access_token');
        const response = await fetch(`/api/projects/${projectId}/export/pdf`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Failed to generate PDF report');
        }

        const data = await response.json();

        // Decode base64 and download
        const binaryString = atob(data.pdf_base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        downloadFile(blob, data.filename, 'application/pdf');
        setSuccess('PDF compliance report exported successfully');
        return;
      }

      const result = await api.generate(project, reportFormat as 'firewall' | 'vlan' | 'report');
      const content = typeof result.content === 'string'
        ? result.content
        : JSON.stringify(result.content, null, 2);

      const extensions: Record<string, { ext: string; mime: string }> = {
        firewall: { ext: 'json', mime: 'application/json' },
        vlan: { ext: 'json', mime: 'application/json' },
        report: { ext: 'md', mime: 'text/markdown' },
      };

      const { ext, mime } = extensions[reportFormat];
      const filename = `${projectName}_${reportFormat}.${ext}`;

      downloadFile(content, filename, mime);
      setSuccess(`Report exported successfully`);
    } catch (err) {
      console.error('Export error:', err);
      setError(`Failed to generate report: ${err}`);
    } finally {
      setExporting(false);
    }
  }, [project, projectId, reportFormat, projectName, downloadFile]);

  // Handle export button click
  const handleExport = useCallback(() => {
    switch (activeTab) {
      case 'diagram':
        exportDiagram();
        break;
      case 'data':
        exportData();
        break;
      case 'reports':
        exportReport();
        break;
    }
  }, [activeTab, exportDiagram, exportData, exportReport]);

  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <DialogShell title="Export" onClose={onClose} maxWidth="max-w-2xl">
        <div className="max-h-[calc(85vh-4rem)] flex flex-col">
        {/* Description */}
        <div className="px-6 pb-2 -mt-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">Export diagrams, data, and reports</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {[
            { id: 'diagram', label: 'Diagram', icon: '🖼️' },
            { id: 'data', label: 'Data', icon: '📊' },
            { id: 'reports', label: 'Reports', icon: '📋' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ExportTab)}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Status messages */}
          {error && (
            <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 px-4 py-3 rounded">
              {success}
            </div>
          )}

          {/* Diagram Tab */}
          {activeTab === 'diagram' && (
            <div className="space-y-6">
              <div>
                <label className={labelClass}>Format</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'png', label: 'PNG', desc: 'Raster image, best for web' },
                    { id: 'svg', label: 'SVG', desc: 'Vector image, scalable' },
                    { id: 'pdf', label: 'PDF', desc: 'Document format' },
                  ].map(fmt => (
                    <button
                      key={fmt.id}
                      onClick={() => setDiagramFormat(fmt.id as DiagramFormat)}
                      className={`p-3 rounded-lg border-2 text-left transition-colors ${
                        diagramFormat === fmt.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="font-medium text-gray-800 dark:text-gray-100">{fmt.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{fmt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelClass}>Options</label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={options.includeBackground}
                      onChange={(e) => setOptions(prev => ({ ...prev, includeBackground: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Include background</span>
                  </label>

                  {options.includeBackground && (
                    <div className="ml-7">
                      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Background color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={options.backgroundColor}
                          onChange={(e) => setOptions(prev => ({ ...prev, backgroundColor: e.target.value }))}
                          className="w-10 h-10 rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={options.backgroundColor}
                          onChange={(e) => setOptions(prev => ({ ...prev, backgroundColor: e.target.value }))}
                          className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className={labelClass}>Scale (1x - 4x)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="4"
                    step="0.5"
                    value={options.scale}
                    onChange={(e) => setOptions(prev => ({ ...prev, scale: parseFloat(e.target.value) }))}
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 w-12">{options.scale}x</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Higher scale = larger image, better quality
                </p>
              </div>

              {!flowViewport && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300 px-4 py-3 rounded text-sm">
                  Diagram export requires the editor to be visible. Make sure you have a project open.
                </div>
              )}
            </div>
          )}

          {/* Data Tab */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              <div>
                <label className={labelClass}>Format</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'yaml', label: 'YAML', desc: 'Full project file', icon: '📄' },
                    { id: 'json', label: 'JSON', desc: 'Full project as JSON', icon: '{ }' },
                    { id: 'csv-zones', label: 'CSV - Zones', desc: 'Zone data as spreadsheet', icon: '📊' },
                    { id: 'csv-assets', label: 'CSV - Assets', desc: 'Asset inventory', icon: '🖥️' },
                    { id: 'csv-conduits', label: 'CSV - Conduits', desc: 'Connection data', icon: '🔗' },
                  ].map(fmt => (
                    <button
                      key={fmt.id}
                      onClick={() => setDataFormat(fmt.id as DataFormat)}
                      className={`p-3 rounded-lg border-2 text-left transition-colors ${
                        dataFormat === fmt.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{fmt.icon}</span>
                        <span className="font-medium text-gray-800 dark:text-gray-100">{fmt.label}</span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{fmt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-800 dark:text-gray-100">Preview</h4>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {dataPreview.totalLines} lines
                    {dataPreview.truncated && ' (showing first 15)'}
                  </span>
                </div>
                <pre className="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto max-h-48 overflow-y-auto font-mono whitespace-pre">
                  {dataPreview.preview}
                </pre>
                {dataPreview.truncated && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                    ... and {dataPreview.totalLines - 15} more lines
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 gap-3 text-center text-sm">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2">
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{project.zones.length}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Zones</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2">
                  <div className="text-lg font-bold text-green-600 dark:text-green-400">{project.zones.reduce((sum, z) => sum + z.assets.length, 0)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Assets</div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-2">
                  <div className="text-lg font-bold text-purple-600 dark:text-purple-400">{project.conduits.length}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Conduits</div>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2">
                  <div className="text-lg font-bold text-orange-600 dark:text-orange-400">{project.conduits.reduce((sum, c) => sum + c.flows.length, 0)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Flows</div>
                </div>
              </div>
            </div>
          )}

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              <div>
                <label className={labelClass}>Report Type</label>
                <div className="space-y-3">
                  {[
                    {
                      id: 'compliance-pdf',
                      label: 'Compliance Report (PDF)',
                      desc: 'Professional IEC 62443 compliance PDF report with executive summary, zone analysis, and recommendations',
                      format: 'PDF',
                      requiresSaved: true
                    },
                    {
                      id: 'firewall',
                      label: 'Firewall Rules',
                      desc: 'Generated firewall rules based on zone conduits and protocol flows',
                      format: 'JSON'
                    },
                    {
                      id: 'vlan',
                      label: 'VLAN Mapping',
                      desc: 'VLAN configuration suggestions based on zone hierarchy',
                      format: 'JSON'
                    },
                    {
                      id: 'report',
                      label: 'Compliance Report',
                      desc: 'IEC 62443 compliance assessment report',
                      format: 'Markdown'
                    },
                  ].map(rpt => (
                    <button
                      key={rpt.id}
                      onClick={() => setReportFormat(rpt.id as ReportFormat)}
                      className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
                        reportFormat === rpt.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-800 dark:text-gray-100">{rpt.label}</span>
                        <span className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded">
                          {rpt.format}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{rpt.desc}</div>
                      {rpt.requiresSaved && !projectId && (
                        <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">Requires saved project</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {reportFormat === 'compliance-pdf' && !projectId && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-4 py-3 rounded text-sm">
                  The PDF compliance report requires the project to be saved first. Please save your project before generating the PDF report.
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-4 py-3 rounded text-sm">
                Reports are generated based on your current project configuration. Make sure to validate your project before generating compliance reports.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Project: {project.project.name}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || (activeTab === 'diagram' && !flowViewport) || (activeTab === 'reports' && reportFormat === 'compliance-pdf' && !projectId)}
              className="px-6 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {exporting ? (
                <>
                  <span className="animate-spin">⏳</span>
                  Exporting...
                </>
              ) : (
                <>
                  Export
                </>
              )}
            </button>
          </div>
        </div>
        </div>
    </DialogShell>
  );
});

ExportDialog.displayName = 'ExportDialog';

// Helper functions

function projectToYAML(project: Project): string {
  // Simple YAML serialization
  const lines: string[] = [];

  lines.push(`version: "${project.version}"`);
  lines.push('');
  lines.push('project:');
  lines.push(`  name: "${project.project.name}"`);
  if (project.project.description) lines.push(`  description: "${project.project.description}"`);
  const standards = project.project.compliance_standards || ['IEC62443'];
  lines.push(`  compliance_standards: [${standards.map(s => `"${s}"`).join(', ')}]`);
  if (project.project.version) lines.push(`  version: "${project.project.version}"`);
  if (project.project.author) lines.push(`  author: "${project.project.author}"`);

  lines.push('');
  lines.push('zones:');
  for (const zone of project.zones) {
    lines.push(`  - id: "${zone.id}"`);
    lines.push(`    name: "${zone.name}"`);
    lines.push(`    type: "${zone.type}"`);
    lines.push(`    security_level_target: ${zone.security_level_target}`);
    if (zone.parent_zone) lines.push(`    parent_zone: "${zone.parent_zone}"`);
    if (zone.description) lines.push(`    description: "${zone.description}"`);
    if (zone.assets.length > 0) {
      lines.push('    assets:');
      for (const asset of zone.assets) {
        lines.push(`      - id: "${asset.id}"`);
        lines.push(`        name: "${asset.name}"`);
        lines.push(`        type: "${asset.type}"`);
        if (asset.ip_address) lines.push(`        ip_address: "${asset.ip_address}"`);
        if (asset.vendor) lines.push(`        vendor: "${asset.vendor}"`);
        if (asset.model) lines.push(`        model: "${asset.model}"`);
      }
    }
  }

  lines.push('');
  lines.push('conduits:');
  for (const conduit of project.conduits) {
    lines.push(`  - id: "${conduit.id}"`);
    if (conduit.name) lines.push(`    name: "${conduit.name}"`);
    lines.push(`    from_zone: "${conduit.from_zone}"`);
    lines.push(`    to_zone: "${conduit.to_zone}"`);
    lines.push(`    requires_inspection: ${conduit.requires_inspection}`);
    if (conduit.description) lines.push(`    description: "${conduit.description}"`);
    if (conduit.flows.length > 0) {
      lines.push('    flows:');
      for (const flow of conduit.flows) {
        lines.push(`      - protocol: "${flow.protocol}"`);
        if (flow.port) lines.push(`        port: ${flow.port}`);
        lines.push(`        direction: "${flow.direction}"`);
      }
    }
  }

  return lines.join('\n');
}

function zonesToCSV(project: Project): string {
  const headers = ['id', 'name', 'type', 'security_level_target', 'parent_zone', 'description', 'asset_count'];
  const rows = project.zones.map(zone => [
    zone.id,
    zone.name,
    zone.type,
    zone.security_level_target.toString(),
    zone.parent_zone || '',
    zone.description || '',
    zone.assets.length.toString(),
  ]);

  return [headers, ...rows].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}

function assetsToCSV(project: Project): string {
  const headers = ['zone_id', 'zone_name', 'asset_id', 'asset_name', 'type', 'ip_address', 'vendor', 'model', 'criticality'];
  const rows: string[][] = [];

  for (const zone of project.zones) {
    for (const asset of zone.assets) {
      rows.push([
        zone.id,
        zone.name,
        asset.id,
        asset.name,
        asset.type,
        asset.ip_address || '',
        asset.vendor || '',
        asset.model || '',
        asset.criticality?.toString() || '',
      ]);
    }
  }

  return [headers, ...rows].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}

function conduitsToCSV(project: Project): string {
  const headers = ['id', 'name', 'from_zone', 'to_zone', 'requires_inspection', 'security_level_required', 'protocols', 'description'];
  const rows = project.conduits.map(conduit => [
    conduit.id,
    conduit.name || '',
    conduit.from_zone,
    conduit.to_zone,
    conduit.requires_inspection ? 'yes' : 'no',
    conduit.security_level_required?.toString() || '',
    conduit.flows.map(f => `${f.protocol}${f.port ? ':' + f.port : ''}`).join('; '),
    conduit.description || '',
  ]);

  return [headers, ...rows].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}

export default ExportDialog;
