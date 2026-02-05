import { useState } from 'react';
import type { Asset, AssetType, Zone } from '../types/models';
import DialogShell from './DialogShell';

interface AddAssetDialogProps {
  zone: Zone;
  onAdd: (asset: Asset) => void;
  onCancel: () => void;
}

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'plc', label: 'PLC' },
  { value: 'hmi', label: 'HMI' },
  { value: 'scada', label: 'SCADA' },
  { value: 'engineering_workstation', label: 'Engineering Workstation' },
  { value: 'historian', label: 'Historian' },
  { value: 'jump_host', label: 'Jump Host' },
  { value: 'firewall', label: 'Firewall' },
  { value: 'switch', label: 'Switch' },
  { value: 'router', label: 'Router' },
  { value: 'server', label: 'Server' },
  { value: 'rtu', label: 'RTU' },
  { value: 'ied', label: 'IED' },
  { value: 'dcs', label: 'DCS' },
  { value: 'other', label: 'Other' },
];

export default function AddAssetDialog({ zone, onAdd, onCancel }: AddAssetDialogProps) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AssetType>('plc');
  const [ipAddress, setIpAddress] = useState('');
  const [vendor, setVendor] = useState('');
  const [model, setModel] = useState('');
  const [description, setDescription] = useState('');
  const [criticality, setCriticality] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!id.trim()) {
      setError('ID is required');
      return;
    }
    if (zone.assets.some(a => a.id === id)) {
      setError('An asset with this ID already exists in this zone');
      return;
    }
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    // Validate IP address if provided
    if (ipAddress && !/^(\d{1,3}\.){3}\d{1,3}$/.test(ipAddress)) {
      setError('Invalid IP address format');
      return;
    }

    const asset: Asset = {
      id: id.trim(),
      name: name.trim(),
      type,
      criticality,
      ...(ipAddress && { ip_address: ipAddress }),
      ...(vendor && { vendor }),
      ...(model && { model }),
      ...(description && { description }),
    };

    onAdd(asset);
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <DialogShell title={`Add Asset to ${zone.name}`} onClose={onCancel}>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[calc(90vh-4rem)] overflow-y-auto">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="e.g., plc_01"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Type <span className="text-red-500">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AssetType)}
                className={inputClass}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main Production PLC"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              IP Address
            </label>
            <input
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="e.g., 10.10.1.10"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Vendor
              </label>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="e.g., Siemens"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Model
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g., S7-1500"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              Criticality (1-5)
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setCriticality(level)}
                  className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                    criticality === level
                      ? level >= 4
                        ? 'bg-red-500 text-white'
                        : level >= 3
                        ? 'bg-yellow-500 text-white'
                        : 'bg-green-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              1 = Low, 5 = Critical
            </p>
          </div>

          <div>
            <label className={labelClass}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={inputClass}
            />
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
              Add Asset
            </button>
          </div>
        </form>
    </DialogShell>
  );
}
