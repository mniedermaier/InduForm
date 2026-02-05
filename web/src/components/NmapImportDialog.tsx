import { memo, useState, useEffect, useCallback, useRef } from 'react';
import type { Zone } from '../types/models';
import DialogShell from './DialogShell';

interface NmapPort {
  port: number;
  protocol: string;
  service: string | null;
  product: string | null;
  version: string | null;
}

interface NmapHost {
  id: string;
  ip_address: string;
  mac_address: string | null;
  hostname: string | null;
  os_detection: string | null;
  status: string;
  open_ports: NmapPort[];
  imported_as_asset_id: string | null;
  suggested_asset_type: string;
  suggested_asset_name: string;
}

interface NmapScan {
  id: string;
  project_id: string;
  filename: string;
  scan_date: string | null;
  host_count: number;
  created_at: string;
  hosts?: NmapHost[];
}

interface ImportItem {
  host_id: string;
  zone_id: string;
  asset_id: string;
  asset_name: string;
  asset_type: string;
  selected: boolean;
}

interface NmapImportDialogProps {
  projectId: string;
  zones: Zone[];
  onClose: () => void;
  onImportComplete: () => void;
}

const API_BASE = '/api';

async function fetchWithAuth<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('induform_access_token');
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

const NmapImportDialog = memo(
  ({ projectId, zones, onClose, onImportComplete }: NmapImportDialogProps) => {
    const [step, setStep] = useState<'upload' | 'select' | 'map'>('upload');
    const [scans, setScans] = useState<NmapScan[]>([]);
    const [selectedScan, setSelectedScan] = useState<NmapScan | null>(null);
    const [importItems, setImportItems] = useState<ImportItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load existing scans
    useEffect(() => {
      const loadScans = async () => {
        try {
          const data = await fetchWithAuth<NmapScan[]>(`/projects/${projectId}/nmap/scans`);
          setScans(data);
        } catch (err) {
          // Ignore - no scans yet
        }
      };
      loadScans();
    }, [projectId]);

    // Handle file upload
    const handleFileUpload = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
          setLoading(true);
          setError(null);

          const content = await file.text();
          const scan = await fetchWithAuth<NmapScan>(`/projects/${projectId}/nmap/upload`, {
            method: 'POST',
            body: JSON.stringify({
              xml_content: content,
              filename: file.name,
            }),
          });

          setScans((prev) => [scan, ...prev]);
          await loadScanDetails(scan.id);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to upload scan');
        } finally {
          setLoading(false);
        }
      },
      [projectId]
    );

    // Load scan details
    const loadScanDetails = useCallback(
      async (scanId: string) => {
        try {
          setLoading(true);
          setError(null);

          const scan = await fetchWithAuth<NmapScan>(
            `/projects/${projectId}/nmap/scans/${scanId}`
          );
          setSelectedScan(scan);

          // Create import items from hosts
          const items: ImportItem[] = (scan.hosts || [])
            .filter((h) => !h.imported_as_asset_id) // Skip already imported
            .map((host) => ({
              host_id: host.id,
              zone_id: zones.length > 0 ? zones[0].id : '',
              asset_id: `asset-${host.ip_address.replace(/\./g, '-')}`,
              asset_name: host.suggested_asset_name,
              asset_type: host.suggested_asset_type,
              selected: true,
            }));

          setImportItems(items);
          setStep('map');
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load scan');
        } finally {
          setLoading(false);
        }
      },
      [projectId, zones]
    );

    // Toggle host selection
    const toggleHostSelection = useCallback((hostId: string) => {
      setImportItems((prev) =>
        prev.map((item) =>
          item.host_id === hostId ? { ...item, selected: !item.selected } : item
        )
      );
    }, []);

    // Update import item
    const updateImportItem = useCallback(
      (hostId: string, field: keyof ImportItem, value: string) => {
        setImportItems((prev) =>
          prev.map((item) =>
            item.host_id === hostId ? { ...item, [field]: value } : item
          )
        );
      },
      []
    );

    // Perform import
    const handleImport = useCallback(async () => {
      if (!selectedScan) return;

      const selectedItems = importItems.filter((item) => item.selected && item.zone_id);
      if (selectedItems.length === 0) {
        setError('Please select at least one host and assign it to a zone');
        return;
      }

      try {
        setImporting(true);
        setError(null);

        const result = await fetchWithAuth<{ imported: number; errors: number }>(
          `/projects/${projectId}/nmap/scans/${selectedScan.id}/import`,
          {
            method: 'POST',
            body: JSON.stringify({
              imports: selectedItems.map((item) => ({
                host_id: item.host_id,
                zone_id: item.zone_id,
                asset_id: item.asset_id,
                asset_name: item.asset_name,
                asset_type: item.asset_type,
              })),
            }),
          }
        );

        if (result.imported > 0) {
          onImportComplete();
          onClose();
        } else if (result.errors > 0) {
          setError('Some hosts could not be imported');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to import hosts');
      } finally {
        setImporting(false);
      }
    }, [projectId, selectedScan, importItems, onImportComplete, onClose]);

    // Get host info by ID
    const getHostById = (hostId: string): NmapHost | undefined => {
      return selectedScan?.hosts?.find((h) => h.id === hostId);
    };

    return (
      <DialogShell title="Import from Nmap Scan" onClose={onClose} maxWidth="max-w-4xl">
          <div className="max-h-[calc(85vh-4rem)] flex flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-300 text-sm">
                {error}
              </div>
            )}

            {step === 'upload' && (
              <div className="space-y-4">
                <div className="text-center py-8">
                  <div className="text-4xl mb-4">📡</div>
                  <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100 mb-2">
                    Upload Nmap Scan
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Upload an Nmap XML output file to import discovered hosts as assets
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xml"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium"
                  >
                    {loading ? 'Uploading...' : 'Select XML File'}
                  </button>
                </div>

                {scans.length > 0 && (
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                      Previous Scans
                    </h3>
                    <div className="space-y-2">
                      {scans.map((scan) => (
                        <div
                          key={scan.id}
                          onClick={() => loadScanDetails(scan.id)}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600"
                        >
                          <div>
                            <div className="font-medium text-gray-800 dark:text-gray-100">
                              {scan.filename}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {scan.host_count} hosts -{' '}
                              {new Date(scan.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <span className="text-blue-600 dark:text-blue-400">→</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'map' && selectedScan && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-800 dark:text-gray-100">
                      {selectedScan.filename}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedScan.hosts?.length || 0} hosts discovered
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedScan(null);
                      setImportItems([]);
                      setStep('upload');
                    }}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    ← Back
                  </button>
                </div>

                {zones.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No zones available. Create a zone first to import hosts.
                  </div>
                ) : importItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    All hosts from this scan have already been imported.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {importItems.map((item) => {
                      const host = getHostById(item.host_id);
                      if (!host) return null;

                      return (
                        <div
                          key={item.host_id}
                          className={`p-3 rounded border ${
                            item.selected
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                              : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() => toggleHostSelection(item.host_id)}
                              className="mt-1"
                            />

                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <div className="font-medium text-gray-800 dark:text-gray-100">
                                  {host.ip_address}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {host.hostname || 'No hostname'}
                                  {host.mac_address && ` • ${host.mac_address}`}
                                </div>
                                {host.os_detection && (
                                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                    OS: {host.os_detection}
                                  </div>
                                )}
                                {host.open_ports.length > 0 && (
                                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                    Ports:{' '}
                                    {host.open_ports
                                      .slice(0, 5)
                                      .map((p) => `${p.port}/${p.protocol}`)
                                      .join(', ')}
                                    {host.open_ports.length > 5 &&
                                      ` +${host.open_ports.length - 5} more`}
                                  </div>
                                )}
                              </div>

                              {item.selected && (
                                <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        Zone
                                      </label>
                                      <select
                                        value={item.zone_id}
                                        onChange={(e) =>
                                          updateImportItem(item.host_id, 'zone_id', e.target.value)
                                        }
                                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                                      >
                                        {zones.map((zone) => (
                                          <option key={zone.id} value={zone.id}>
                                            {zone.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        Type
                                      </label>
                                      <select
                                        value={item.asset_type}
                                        onChange={(e) =>
                                          updateImportItem(
                                            item.host_id,
                                            'asset_type',
                                            e.target.value
                                          )
                                        }
                                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                                      >
                                        <option value="plc">PLC</option>
                                        <option value="hmi">HMI</option>
                                        <option value="scada">SCADA</option>
                                        <option value="rtu">RTU</option>
                                        <option value="server">Server</option>
                                        <option value="firewall">Firewall</option>
                                        <option value="switch">Switch</option>
                                        <option value="router">Router</option>
                                        <option value="engineering_workstation">
                                          Engineering WS
                                        </option>
                                        <option value="historian">Historian</option>
                                        <option value="other">Other</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                      Asset Name
                                    </label>
                                    <input
                                      type="text"
                                      value={item.asset_name}
                                      onChange={(e) =>
                                        updateImportItem(item.host_id, 'asset_name', e.target.value)
                                      }
                                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-between p-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>

            {step === 'map' && importItems.some((i) => i.selected) && (
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg"
              >
                {importing
                  ? 'Importing...'
                  : `Import ${importItems.filter((i) => i.selected).length} Hosts`}
              </button>
            )}
          </div>
          </div>
      </DialogShell>
    );
  }
);

NmapImportDialog.displayName = 'NmapImportDialog';

export default NmapImportDialog;
