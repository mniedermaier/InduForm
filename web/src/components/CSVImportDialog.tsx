import { memo, useState, useCallback } from 'react';
import type { Zone, Asset, ZoneType, AssetType } from '../types/models';
import DialogShell from './DialogShell';

interface CSVImportDialogProps {
  existingZones: Zone[];
  onImport: (zones: Zone[], assets: { zoneId: string; asset: Asset }[]) => void;
  onCancel: () => void;
}

type ImportType = 'zones' | 'assets';

const ZONE_CSV_HEADER = 'id,name,type,security_level_target,parent_zone,description';
const ASSET_CSV_HEADER = 'zone_id,id,name,type,ip_address,mac_address,vendor,model,firmware_version,criticality,description,os_name,os_version,software,cpe,subnet,gateway,vlan,dns,open_ports,protocols,purchase_date,end_of_life,warranty_expiry,last_patched,patch_level,location';

const ZONE_EXAMPLE = `id,name,type,security_level_target,parent_zone,description
enterprise,Enterprise Network,enterprise,1,,Corporate IT network
site_dmz,Site DMZ,dmz,3,enterprise,Demilitarized zone
cell_01,Production Cell 01,cell,2,,Main production area`;

const ASSET_EXAMPLE = `zone_id,id,name,type,ip_address,mac_address,vendor,model,firmware_version,criticality,description,os_name,os_version,software,cpe,subnet,gateway,vlan,dns,open_ports,protocols,purchase_date,end_of_life,warranty_expiry,last_patched,patch_level,location
cell_01,plc_01,Main PLC,plc,10.10.1.10,,Siemens,S7-1500,4.5.2,4,,Linux,4.19,Step 7,,10.10.1.0/24,10.10.1.1,100,,102,S7,2023-01-15,2030-12-31,,,SP3,Building A
cell_01,hmi_01,Operator HMI,hmi,10.10.1.20,,Wonderware,,,,,,,,,,,,,,,,,,,,
site_dmz,historian,Site Historian,historian,10.1.1.50,,OSIsoft,PI,,,,,,,,,,,,,,,,,,,`;

const VALID_ZONE_TYPES: ZoneType[] = ['enterprise', 'site', 'area', 'cell', 'dmz', 'safety'];
const VALID_ASSET_TYPES: AssetType[] = ['plc', 'hmi', 'scada', 'engineering_workstation', 'historian', 'jump_host', 'firewall', 'switch', 'other'];

const CSVImportDialog = memo(({
  existingZones,
  onImport,
  onCancel,
}: CSVImportDialogProps) => {
  const [importType, setImportType] = useState<ImportType>('zones');
  const [csvContent, setCsvContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ zones: Zone[]; assets: { zoneId: string; asset: Asset }[] } | null>(null);

  const parseCSV = useCallback((content: string): string[][] => {
    const lines = content.trim().split('\n');
    return lines.map(line => {
      // Simple CSV parsing (handles basic cases)
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    });
  }, []);

  const validateAndPreview = useCallback(() => {
    setError(null);
    setPreview(null);

    if (!csvContent.trim()) {
      setError('Please paste CSV content');
      return;
    }

    const rows = parseCSV(csvContent);
    if (rows.length < 2) {
      setError('CSV must have a header row and at least one data row');
      return;
    }

    const header = rows[0].map(h => h.toLowerCase());
    const dataRows = rows.slice(1);

    if (importType === 'zones') {
      // Validate zone CSV
      const requiredCols = ['id', 'name', 'type', 'security_level_target'];
      const missingCols = requiredCols.filter(col => !header.includes(col));
      if (missingCols.length > 0) {
        setError(`Missing required columns: ${missingCols.join(', ')}`);
        return;
      }

      const idIdx = header.indexOf('id');
      const nameIdx = header.indexOf('name');
      const typeIdx = header.indexOf('type');
      const slIdx = header.indexOf('security_level_target');
      const parentIdx = header.indexOf('parent_zone');
      const descIdx = header.indexOf('description');

      const zones: Zone[] = [];
      const errors: string[] = [];

      dataRows.forEach((row, rowIdx) => {
        if (row.length < 4 || row.every(cell => !cell)) return; // Skip empty rows

        const id = row[idIdx]?.trim();
        const name = row[nameIdx]?.trim();
        const type = row[typeIdx]?.trim().toLowerCase() as ZoneType;
        const slStr = row[slIdx]?.trim();
        const parent = parentIdx >= 0 ? row[parentIdx]?.trim() : undefined;
        const desc = descIdx >= 0 ? row[descIdx]?.trim() : undefined;

        if (!id) {
          errors.push(`Row ${rowIdx + 2}: Missing ID`);
          return;
        }
        if (!name) {
          errors.push(`Row ${rowIdx + 2}: Missing name`);
          return;
        }
        if (!VALID_ZONE_TYPES.includes(type)) {
          errors.push(`Row ${rowIdx + 2}: Invalid zone type "${type}". Must be one of: ${VALID_ZONE_TYPES.join(', ')}`);
          return;
        }
        const sl = parseInt(slStr, 10);
        if (isNaN(sl) || sl < 1 || sl > 4) {
          errors.push(`Row ${rowIdx + 2}: Invalid security level "${slStr}". Must be 1-4`);
          return;
        }
        if (existingZones.some(z => z.id === id)) {
          errors.push(`Row ${rowIdx + 2}: Zone ID "${id}" already exists`);
          return;
        }
        if (zones.some(z => z.id === id)) {
          errors.push(`Row ${rowIdx + 2}: Duplicate zone ID "${id}" in CSV`);
          return;
        }

        zones.push({
          id,
          name,
          type,
          security_level_target: sl,
          assets: [],
          ...(parent && { parent_zone: parent }),
          ...(desc && { description: desc }),
        });
      });

      if (errors.length > 0) {
        setError(errors.join('\n'));
        return;
      }

      if (zones.length === 0) {
        setError('No valid zones found in CSV');
        return;
      }

      setPreview({ zones, assets: [] });
    } else {
      // Validate asset CSV
      const requiredCols = ['zone_id', 'id', 'name', 'type'];
      const missingCols = requiredCols.filter(col => !header.includes(col));
      if (missingCols.length > 0) {
        setError(`Missing required columns: ${missingCols.join(', ')}`);
        return;
      }

      const zoneIdIdx = header.indexOf('zone_id');
      const idIdx = header.indexOf('id');
      const nameIdx = header.indexOf('name');
      const typeIdx = header.indexOf('type');
      const ipIdx = header.indexOf('ip_address');
      const macIdx = header.indexOf('mac_address');
      const vendorIdx = header.indexOf('vendor');
      const modelIdx = header.indexOf('model');
      const firmwareIdx = header.indexOf('firmware_version');
      const criticalityIdx = header.indexOf('criticality');
      const descIdx = header.indexOf('description');
      const osNameIdx = header.indexOf('os_name');
      const osVersionIdx = header.indexOf('os_version');
      const softwareIdx = header.indexOf('software');
      const cpeIdx = header.indexOf('cpe');
      const subnetIdx = header.indexOf('subnet');
      const gatewayIdx = header.indexOf('gateway');
      const vlanIdx = header.indexOf('vlan');
      const dnsIdx = header.indexOf('dns');
      const openPortsIdx = header.indexOf('open_ports');
      const protocolsIdx = header.indexOf('protocols');
      const purchaseDateIdx = header.indexOf('purchase_date');
      const endOfLifeIdx = header.indexOf('end_of_life');
      const warrantyIdx = header.indexOf('warranty_expiry');
      const lastPatchedIdx = header.indexOf('last_patched');
      const patchLevelIdx = header.indexOf('patch_level');
      const locationIdx = header.indexOf('location');

      const getOpt = (row: string[], idx: number): string | undefined => {
        if (idx < 0) return undefined;
        const val = row[idx]?.trim();
        return val || undefined;
      };

      const assets: { zoneId: string; asset: Asset }[] = [];
      const errors: string[] = [];

      dataRows.forEach((row, rowIdx) => {
        if (row.length < 4 || row.every(cell => !cell)) return; // Skip empty rows

        const zoneId = row[zoneIdIdx]?.trim();
        const id = row[idIdx]?.trim();
        const name = row[nameIdx]?.trim();
        const type = row[typeIdx]?.trim().toLowerCase() as AssetType;

        if (!zoneId) {
          errors.push(`Row ${rowIdx + 2}: Missing zone_id`);
          return;
        }
        if (!existingZones.some(z => z.id === zoneId)) {
          errors.push(`Row ${rowIdx + 2}: Zone "${zoneId}" does not exist`);
          return;
        }
        if (!id) {
          errors.push(`Row ${rowIdx + 2}: Missing asset ID`);
          return;
        }
        if (!name) {
          errors.push(`Row ${rowIdx + 2}: Missing asset name`);
          return;
        }
        if (!VALID_ASSET_TYPES.includes(type)) {
          errors.push(`Row ${rowIdx + 2}: Invalid asset type "${type}". Must be one of: ${VALID_ASSET_TYPES.join(', ')}`);
          return;
        }

        // Check for duplicate asset IDs
        const zone = existingZones.find(z => z.id === zoneId);
        if (zone?.assets.some(a => a.id === id)) {
          errors.push(`Row ${rowIdx + 2}: Asset ID "${id}" already exists in zone "${zoneId}"`);
          return;
        }

        const critStr = getOpt(row, criticalityIdx);
        const vlanStr = getOpt(row, vlanIdx);

        assets.push({
          zoneId,
          asset: {
            id,
            name,
            type,
            ...(getOpt(row, ipIdx) && { ip_address: getOpt(row, ipIdx) }),
            ...(getOpt(row, macIdx) && { mac_address: getOpt(row, macIdx) }),
            ...(getOpt(row, vendorIdx) && { vendor: getOpt(row, vendorIdx) }),
            ...(getOpt(row, modelIdx) && { model: getOpt(row, modelIdx) }),
            ...(getOpt(row, firmwareIdx) && { firmware_version: getOpt(row, firmwareIdx) }),
            ...(critStr && { criticality: parseInt(critStr) || undefined }),
            ...(getOpt(row, descIdx) && { description: getOpt(row, descIdx) }),
            ...(getOpt(row, osNameIdx) && { os_name: getOpt(row, osNameIdx) }),
            ...(getOpt(row, osVersionIdx) && { os_version: getOpt(row, osVersionIdx) }),
            ...(getOpt(row, softwareIdx) && { software: getOpt(row, softwareIdx) }),
            ...(getOpt(row, cpeIdx) && { cpe: getOpt(row, cpeIdx) }),
            ...(getOpt(row, subnetIdx) && { subnet: getOpt(row, subnetIdx) }),
            ...(getOpt(row, gatewayIdx) && { gateway: getOpt(row, gatewayIdx) }),
            ...(vlanStr && { vlan: parseInt(vlanStr) || undefined }),
            ...(getOpt(row, dnsIdx) && { dns: getOpt(row, dnsIdx) }),
            ...(getOpt(row, openPortsIdx) && { open_ports: getOpt(row, openPortsIdx) }),
            ...(getOpt(row, protocolsIdx) && { protocols: getOpt(row, protocolsIdx) }),
            ...(getOpt(row, purchaseDateIdx) && { purchase_date: getOpt(row, purchaseDateIdx) }),
            ...(getOpt(row, endOfLifeIdx) && { end_of_life: getOpt(row, endOfLifeIdx) }),
            ...(getOpt(row, warrantyIdx) && { warranty_expiry: getOpt(row, warrantyIdx) }),
            ...(getOpt(row, lastPatchedIdx) && { last_patched: getOpt(row, lastPatchedIdx) }),
            ...(getOpt(row, patchLevelIdx) && { patch_level: getOpt(row, patchLevelIdx) }),
            ...(getOpt(row, locationIdx) && { location: getOpt(row, locationIdx) }),
          },
        });
      });

      if (errors.length > 0) {
        setError(errors.join('\n'));
        return;
      }

      if (assets.length === 0) {
        setError('No valid assets found in CSV');
        return;
      }

      setPreview({ zones: [], assets });
    }
  }, [csvContent, importType, existingZones, parseCSV]);

  const handleImport = useCallback(() => {
    if (preview) {
      onImport(preview.zones, preview.assets);
    }
  }, [preview, onImport]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvContent(content);
      setPreview(null);
      setError(null);
    };
    reader.readAsText(file);
  }, []);

  return (
    <DialogShell title="Import from CSV" onClose={onCancel} maxWidth="max-w-2xl">
        <div className="max-h-[calc(85vh-4rem)] flex flex-col">
        {/* Description */}
        <div className="px-6 pb-2 -mt-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">Import zones or assets from CSV files</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {/* Import type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Import Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="importType"
                  value="zones"
                  checked={importType === 'zones'}
                  onChange={() => {
                    setImportType('zones');
                    setPreview(null);
                    setError(null);
                  }}
                />
                <span className="text-gray-700 dark:text-gray-300">Zones</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="importType"
                  value="assets"
                  checked={importType === 'assets'}
                  onChange={() => {
                    setImportType('assets');
                    setPreview(null);
                    setError(null);
                  }}
                />
                <span className="text-gray-700 dark:text-gray-300">Assets</span>
              </label>
            </div>
          </div>

          {/* Expected format */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded p-3">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Expected CSV Format:</div>
            <code className="text-xs text-gray-500 dark:text-gray-400 block overflow-x-auto">
              {importType === 'zones' ? ZONE_CSV_HEADER : ASSET_CSV_HEADER}
            </code>
          </div>

          {/* Example */}
          <details className="bg-blue-50 dark:bg-blue-900/20 rounded p-3">
            <summary className="text-xs font-medium text-blue-600 dark:text-blue-400 cursor-pointer">
              Show example CSV
            </summary>
            <pre className="text-xs text-blue-700 dark:text-blue-300 mt-2 overflow-x-auto whitespace-pre">
              {importType === 'zones' ? ZONE_EXAMPLE : ASSET_EXAMPLE}
            </pre>
          </details>

          {/* File upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Upload CSV File
            </label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 dark:text-gray-400
                file:mr-4 file:py-2 file:px-4
                file:rounded file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                dark:file:bg-blue-900 dark:file:text-blue-300
                hover:file:bg-blue-100 dark:hover:file:bg-blue-800"
            />
          </div>

          {/* Or paste content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Or Paste CSV Content
            </label>
            <textarea
              value={csvContent}
              onChange={(e) => {
                setCsvContent(e.target.value);
                setPreview(null);
                setError(null);
              }}
              rows={6}
              placeholder={importType === 'zones' ? ZONE_EXAMPLE : ASSET_EXAMPLE}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                focus:outline-none focus:ring-2 focus:ring-blue-500
                bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200
                font-mono text-sm"
            />
          </div>

          {/* Validate button */}
          <button
            onClick={validateAndPreview}
            disabled={!csvContent.trim()}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
          >
            Validate CSV
          </button>

          {/* Error display */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
              <div className="font-medium text-red-800 dark:text-red-300 text-sm">Validation Errors</div>
              <pre className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap mt-1">{error}</pre>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3">
              <div className="font-medium text-green-800 dark:text-green-300 text-sm mb-2">
                Ready to Import
              </div>
              {preview.zones.length > 0 && (
                <div className="text-sm text-green-700 dark:text-green-400">
                  {preview.zones.length} zone(s): {preview.zones.map(z => z.name).join(', ')}
                </div>
              )}
              {preview.assets.length > 0 && (
                <div className="text-sm text-green-700 dark:text-green-400">
                  {preview.assets.length} asset(s): {preview.assets.map(a => a.asset.name).join(', ')}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!preview}
            className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import
          </button>
        </div>
        </div>
    </DialogShell>
  );
});

CSVImportDialog.displayName = 'CSVImportDialog';

export default CSVImportDialog;
