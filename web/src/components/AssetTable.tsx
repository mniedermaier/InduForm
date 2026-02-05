import { memo, useState, useMemo } from 'react';
import type { Project, Zone, Asset, AssetType } from '../types/models';

interface AssetTableProps {
  project: Project;
  onClose: () => void;
  onUpdateAsset?: (zoneId: string, assetId: string, asset: Asset) => void;
  onDeleteAsset?: (zoneId: string, assetId: string) => void;
  onAddAsset?: (zoneId: string, asset: Asset) => void;
}

interface AssetRow {
  zone: Zone;
  asset: Asset;
}

const ASSET_TYPES: AssetType[] = [
  'plc', 'hmi', 'scada', 'engineering_workstation', 'historian',
  'jump_host', 'firewall', 'switch', 'router', 'server', 'rtu', 'ied', 'dcs', 'other'
];

const AssetTable = memo(({ project, onClose, onUpdateAsset, onDeleteAsset, onAddAsset }: AssetTableProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterZone, setFilterZone] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [editingAsset, setEditingAsset] = useState<{ zoneId: string; asset: Asset } | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAssetZone, setNewAssetZone] = useState<string>(project.zones[0]?.id || '');

  // Flatten all assets with their zone info
  const allAssets = useMemo((): AssetRow[] => {
    const assets: AssetRow[] = [];
    for (const zone of project.zones) {
      for (const asset of zone.assets) {
        assets.push({ zone, asset });
      }
    }
    return assets;
  }, [project.zones]);

  // Filter assets
  const filteredAssets = useMemo(() => {
    return allAssets.filter(({ zone, asset }) => {
      const matchesSearch = searchTerm === '' ||
        asset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        asset.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (asset.ip_address && asset.ip_address.includes(searchTerm)) ||
        (asset.vendor && asset.vendor.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesZone = filterZone === '' || zone.id === filterZone;
      const matchesType = filterType === '' || asset.type === filterType;

      return matchesSearch && matchesZone && matchesType;
    });
  }, [allAssets, searchTerm, filterZone, filterType]);

  // Stats
  const stats = useMemo(() => ({
    total: allAssets.length,
    filtered: filteredAssets.length,
    byType: ASSET_TYPES.reduce((acc, type) => {
      acc[type] = allAssets.filter(a => a.asset.type === type).length;
      return acc;
    }, {} as Record<string, number>),
  }), [allAssets, filteredAssets]);

  const handleSaveEdit = (updatedAsset: Asset) => {
    if (editingAsset && onUpdateAsset) {
      onUpdateAsset(editingAsset.zoneId, editingAsset.asset.id, updatedAsset);
      setEditingAsset(null);
    }
  };

  const handleAddAsset = (asset: Asset) => {
    if (onAddAsset) {
      onAddAsset(newAssetZone, asset);
      setShowAddForm(false);
    }
  };

  const canEdit = !!onUpdateAsset && !!onDeleteAsset && !!onAddAsset;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Asset Inventory</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {stats.filtered} of {stats.total} assets
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">
            &times;
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-3 items-center bg-gray-50 dark:bg-gray-900">
          <input
            type="text"
            placeholder="Search assets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 w-64"
          />
          <select
            value={filterZone}
            onChange={(e) => setFilterZone(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">All Zones</option>
            {project.zones.map(zone => (
              <option key={zone.id} value={zone.id}>{zone.name}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">All Types</option>
            {ASSET_TYPES.filter(t => stats.byType[t] > 0).map(type => (
              <option key={type} value={type}>{type} ({stats.byType[type]})</option>
            ))}
          </select>
          <div className="flex-1" />
          {canEdit && (
            <button
              onClick={() => setShowAddForm(true)}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center gap-1"
            >
              <span>+</span> Add Asset
            </button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Zone</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">ID</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Name</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Type</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">IP Address</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Vendor</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Model</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Criticality</th>
                <th className="px-4 py-2 text-center font-medium text-gray-700 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    {allAssets.length === 0 ? 'No assets defined yet' : 'No assets match the filters'}
                  </td>
                </tr>
              ) : (
                filteredAssets.map(({ zone, asset }) => (
                  <tr key={`${zone.id}-${asset.id}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span className="text-gray-800 dark:text-gray-200">{zone.name}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">{asset.id}</td>
                    <td className="px-4 py-2 font-medium text-gray-800 dark:text-gray-200">{asset.name}</td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs text-gray-700 dark:text-gray-300">
                        {asset.type}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {asset.ip_address || '-'}
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{asset.vendor || '-'}</td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">{asset.model || '-'}</td>
                    <td className="px-4 py-2 text-center">
                      {asset.criticality ? (
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          asset.criticality >= 4 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                          asset.criticality >= 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                          'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                        }`}>
                          {asset.criticality}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {canEdit ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setEditingAsset({ zoneId: zone.id, asset })}
                            className="p-1 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete asset "${asset.name}"?`) && onDeleteAsset) {
                                onDeleteAsset(zone.id, asset.id);
                              }
                            }}
                            className="p-1 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>

        {/* Edit Modal */}
        {editingAsset && (
          <AssetEditModal
            asset={editingAsset.asset}
            onSave={handleSaveEdit}
            onCancel={() => setEditingAsset(null)}
          />
        )}

        {/* Add Modal */}
        {showAddForm && (
          <AssetAddModal
            zones={project.zones}
            selectedZone={newAssetZone}
            onZoneChange={setNewAssetZone}
            onSave={handleAddAsset}
            onCancel={() => setShowAddForm(false)}
          />
        )}
      </div>
    </div>
  );
});

AssetTable.displayName = 'AssetTable';

// Edit Modal Component
const AssetEditModal = memo(({
  asset,
  onSave,
  onCancel,
}: {
  asset: Asset;
  onSave: (asset: Asset) => void;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState<Asset>({ ...asset });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  const inputClass = "w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Edit Asset</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">ID</label>
              <input type="text" value={form.id} disabled className={`${inputClass} opacity-50`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as AssetType })}
                className={inputClass}
              >
                {ASSET_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">IP Address</label>
              <input
                type="text"
                value={form.ip_address || ''}
                onChange={(e) => setForm({ ...form, ip_address: e.target.value || undefined })}
                placeholder="e.g., 10.0.1.10"
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Vendor</label>
              <input
                type="text"
                value={form.vendor || ''}
                onChange={(e) => setForm({ ...form, vendor: e.target.value || undefined })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
              <input
                type="text"
                value={form.model || ''}
                onChange={(e) => setForm({ ...form, model: e.target.value || undefined })}
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Criticality (1-5)</label>
              <input
                type="number"
                min="1"
                max="5"
                value={form.criticality || ''}
                onChange={(e) => setForm({ ...form, criticality: e.target.value ? parseInt(e.target.value) : undefined })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">MAC Address</label>
              <input
                type="text"
                value={form.mac_address || ''}
                onChange={(e) => setForm({ ...form, mac_address: e.target.value || undefined })}
                placeholder="e.g., 00:1A:2B:3C:4D:5E"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              value={form.description || ''}
              onChange={(e) => setForm({ ...form, description: e.target.value || undefined })}
              rows={2}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

AssetEditModal.displayName = 'AssetEditModal';

// Add Modal Component
const AssetAddModal = memo(({
  zones,
  selectedZone,
  onZoneChange,
  onSave,
  onCancel,
}: {
  zones: Zone[];
  selectedZone: string;
  onZoneChange: (zoneId: string) => void;
  onSave: (asset: Asset) => void;
  onCancel: () => void;
}) => {
  const [form, setForm] = useState<Partial<Asset>>({
    id: '',
    name: '',
    type: 'plc',
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.id?.trim()) {
      setError('ID is required');
      return;
    }
    if (!form.name?.trim()) {
      setError('Name is required');
      return;
    }

    // Check for duplicate ID in selected zone
    const zone = zones.find(z => z.id === selectedZone);
    if (zone?.assets.some(a => a.id === form.id)) {
      setError('An asset with this ID already exists in this zone');
      return;
    }

    onSave({
      id: form.id.trim(),
      name: form.name.trim(),
      type: form.type as AssetType,
      ip_address: form.ip_address || undefined,
      vendor: form.vendor || undefined,
      model: form.model || undefined,
      criticality: form.criticality,
      mac_address: form.mac_address || undefined,
      description: form.description || undefined,
    });
  };

  const inputClass = "w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Add New Asset</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Zone *</label>
            <select
              value={selectedZone}
              onChange={(e) => onZoneChange(e.target.value)}
              className={inputClass}
            >
              {zones.map(zone => (
                <option key={zone.id} value={zone.id}>{zone.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">ID *</label>
              <input
                type="text"
                value={form.id || ''}
                onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                placeholder="e.g., plc_01"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
              <input
                type="text"
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g., Main PLC"
                required
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Type *</label>
              <select
                value={form.type || 'plc'}
                onChange={(e) => setForm({ ...form, type: e.target.value as AssetType })}
                className={inputClass}
              >
                {ASSET_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">IP Address</label>
              <input
                type="text"
                value={form.ip_address || ''}
                onChange={(e) => setForm({ ...form, ip_address: e.target.value })}
                placeholder="e.g., 10.0.1.10"
                className={inputClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Vendor</label>
              <input
                type="text"
                value={form.vendor || ''}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
                placeholder="e.g., Siemens"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
              <input
                type="text"
                value={form.model || ''}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="e.g., S7-1500"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Criticality (1-5)</label>
            <input
              type="number"
              min="1"
              max="5"
              value={form.criticality || ''}
              onChange={(e) => setForm({ ...form, criticality: e.target.value ? parseInt(e.target.value) : undefined })}
              placeholder="1 = Low, 5 = Critical"
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700"
            >
              Add Asset
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

AssetAddModal.displayName = 'AssetAddModal';

export default AssetTable;
