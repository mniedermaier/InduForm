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

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-md">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md"
      >
        {title}
        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
}

export default function AddAssetDialog({ zone, onAdd, onCancel }: AddAssetDialogProps) {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AssetType>('plc');
  const [criticality, setCriticality] = useState(3);
  const [description, setDescription] = useState('');
  // Network
  const [ipAddress, setIpAddress] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [subnet, setSubnet] = useState('');
  const [gateway, setGateway] = useState('');
  const [vlan, setVlan] = useState('');
  const [dns, setDns] = useState('');
  const [openPorts, setOpenPorts] = useState('');
  const [protocols, setProtocols] = useState('');
  // OS & Software
  const [osName, setOsName] = useState('');
  const [osVersion, setOsVersion] = useState('');
  const [firmwareVersion, setFirmwareVersion] = useState('');
  const [software, setSoftware] = useState('');
  const [cpe, setCpe] = useState('');
  // Lifecycle
  const [vendor, setVendor] = useState('');
  const [model, setModel] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [endOfLife, setEndOfLife] = useState('');
  const [warrantyExpiry, setWarrantyExpiry] = useState('');
  const [lastPatched, setLastPatched] = useState('');
  const [patchLevel, setPatchLevel] = useState('');
  const [location, setLocation] = useState('');

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
      ...(macAddress && { mac_address: macAddress }),
      ...(vendor && { vendor }),
      ...(model && { model }),
      ...(firmwareVersion && { firmware_version: firmwareVersion }),
      ...(description && { description }),
      ...(osName && { os_name: osName }),
      ...(osVersion && { os_version: osVersion }),
      ...(software && { software }),
      ...(cpe && { cpe }),
      ...(subnet && { subnet }),
      ...(gateway && { gateway }),
      ...(vlan && { vlan: parseInt(vlan) }),
      ...(dns && { dns }),
      ...(openPorts && { open_ports: openPorts }),
      ...(protocols && { protocols }),
      ...(purchaseDate && { purchase_date: purchaseDate }),
      ...(endOfLife && { end_of_life: endOfLife }),
      ...(warrantyExpiry && { warranty_expiry: warrantyExpiry }),
      ...(lastPatched && { last_patched: lastPatched }),
      ...(patchLevel && { patch_level: patchLevel }),
      ...(location && { location }),
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

          {/* Basic (always open) */}
          <div className="space-y-4">
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
              <label className={labelClass}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className={inputClass}
              />
            </div>
          </div>

          {/* Network */}
          <CollapsibleSection title="Network">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>IP Address</label>
                <input type="text" value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} placeholder="e.g., 10.10.1.10" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>MAC Address</label>
                <input type="text" value={macAddress} onChange={(e) => setMacAddress(e.target.value)} placeholder="e.g., 00:1A:2B:3C:4D:5E" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Subnet</label>
                <input type="text" value={subnet} onChange={(e) => setSubnet(e.target.value)} placeholder="e.g., 10.10.1.0/24" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Gateway</label>
                <input type="text" value={gateway} onChange={(e) => setGateway(e.target.value)} placeholder="e.g., 10.10.1.1" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>VLAN</label>
                <input type="number" value={vlan} onChange={(e) => setVlan(e.target.value)} placeholder="e.g., 100" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>DNS</label>
                <input type="text" value={dns} onChange={(e) => setDns(e.target.value)} placeholder="e.g., 10.10.1.1" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Open Ports</label>
                <input type="text" value={openPorts} onChange={(e) => setOpenPorts(e.target.value)} placeholder="e.g., 80,443,502" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Protocols</label>
                <input type="text" value={protocols} onChange={(e) => setProtocols(e.target.value)} placeholder="e.g., Modbus,S7" className={inputClass} />
              </div>
            </div>
          </CollapsibleSection>

          {/* OS & Software */}
          <CollapsibleSection title="OS & Software">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>OS Name</label>
                <input type="text" value={osName} onChange={(e) => setOsName(e.target.value)} placeholder="e.g., Linux" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>OS Version</label>
                <input type="text" value={osVersion} onChange={(e) => setOsVersion(e.target.value)} placeholder="e.g., 4.19" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Firmware Version</label>
                <input type="text" value={firmwareVersion} onChange={(e) => setFirmwareVersion(e.target.value)} placeholder="e.g., 4.5.2" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>CPE</label>
                <input type="text" value={cpe} onChange={(e) => setCpe(e.target.value)} placeholder="cpe:2.3:..." className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Software</label>
              <input type="text" value={software} onChange={(e) => setSoftware(e.target.value)} placeholder="Comma-separated list" className={inputClass} />
            </div>
          </CollapsibleSection>

          {/* Lifecycle */}
          <CollapsibleSection title="Lifecycle">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Vendor</label>
                <input type="text" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g., Siemens" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Model</label>
                <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g., S7-1500" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Purchase Date</label>
                <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>End of Life</label>
                <input type="date" value={endOfLife} onChange={(e) => setEndOfLife(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Warranty Expiry</label>
                <input type="date" value={warrantyExpiry} onChange={(e) => setWarrantyExpiry(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Last Patched</label>
                <input type="date" value={lastPatched} onChange={(e) => setLastPatched(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Patch Level</label>
                <input type="text" value={patchLevel} onChange={(e) => setPatchLevel(e.target.value)} placeholder="e.g., SP3" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Location</label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g., Building A" className={inputClass} />
              </div>
            </div>
          </CollapsibleSection>

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
