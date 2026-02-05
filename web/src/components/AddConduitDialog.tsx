import { useState } from 'react';
import type { Conduit, Zone, ProtocolFlow, ConduitDirection } from '../types/models';
import { SECURITY_LEVEL_CONFIG } from '../types/models';
import DialogShell from './DialogShell';

interface AddConduitDialogProps {
  zones: Zone[];
  existingConduits: Conduit[];
  onAdd: (conduit: Conduit) => void;
  onCancel: () => void;
  // For pre-filling when connecting via drag
  initialFromZone?: string;
  initialToZone?: string;
  // For editing existing conduit
  editConduit?: Conduit;
}

const COMMON_PROTOCOLS = [
  { name: 'modbus_tcp', port: 502 },
  { name: 'opcua', port: 4840 },
  { name: 'https', port: 443 },
  { name: 'http', port: 80 },
  { name: 'ssh', port: 22 },
  { name: 's7comm', port: 102 },
  { name: 'ethernet_ip', port: 44818 },
  { name: 'profinet', port: null },
  { name: 'dnp3', port: 20000 },
  { name: 'mqtt', port: 1883 },
];

export default function AddConduitDialog({
  zones,
  existingConduits,
  onAdd,
  onCancel,
  initialFromZone,
  initialToZone,
  editConduit,
}: AddConduitDialogProps) {
  const isEditing = !!editConduit;

  const [id, setId] = useState(editConduit?.id || '');
  const [name, setName] = useState(editConduit?.name || '');
  const [fromZone, setFromZone] = useState(editConduit?.from_zone || initialFromZone || zones[0]?.id || '');
  const [toZone, setToZone] = useState(editConduit?.to_zone || initialToZone || zones[1]?.id || '');
  const [requiresInspection, setRequiresInspection] = useState(editConduit?.requires_inspection || false);
  const [securityLevel, setSecurityLevel] = useState<number | ''>(editConduit?.security_level_required || '');
  const [description, setDescription] = useState(editConduit?.description || '');
  const [flows, setFlows] = useState<ProtocolFlow[]>(editConduit?.flows || []);
  const [error, setError] = useState<string | null>(null);

  // Flow form state
  const [newProtocol, setNewProtocol] = useState('');
  const [newPort, setNewPort] = useState<string>('');
  const [newDirection, setNewDirection] = useState<ConduitDirection>('bidirectional');

  const handleAddFlow = () => {
    if (!newProtocol) return;

    const flow: ProtocolFlow = {
      protocol: newProtocol,
      direction: newDirection,
      ...(newPort && { port: parseInt(newPort) }),
    };

    setFlows([...flows, flow]);
    setNewProtocol('');
    setNewPort('');
    setNewDirection('bidirectional');
  };

  const handleRemoveFlow = (index: number) => {
    setFlows(flows.filter((_, i) => i !== index));
  };

  const handleProtocolSelect = (protocol: string) => {
    setNewProtocol(protocol);
    const commonProtocol = COMMON_PROTOCOLS.find(p => p.name === protocol);
    if (commonProtocol?.port) {
      setNewPort(commonProtocol.port.toString());
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!id.trim()) {
      setError('ID is required');
      return;
    }
    // When editing, allow the same ID; when adding, check for duplicates
    if (!isEditing && existingConduits.some(c => c.id === id)) {
      setError('A conduit with this ID already exists');
      return;
    }
    if (isEditing && editConduit?.id !== id && existingConduits.some(c => c.id === id)) {
      setError('A conduit with this ID already exists');
      return;
    }
    if (!fromZone || !toZone) {
      setError('Both zones must be selected');
      return;
    }
    if (fromZone === toZone) {
      setError('From and To zones must be different');
      return;
    }

    const conduit: Conduit = {
      id: id.trim(),
      from_zone: fromZone,
      to_zone: toZone,
      flows,
      requires_inspection: requiresInspection,
      ...(name && { name }),
      ...(securityLevel !== '' && { security_level_required: securityLevel }),
      ...(description && { description }),
    };

    onAdd(conduit);
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <DialogShell title={isEditing ? 'Edit Conduit' : 'Add New Conduit'} onClose={onCancel} maxWidth="max-w-lg">
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
                placeholder="e.g., cell_to_dmz"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional display name"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                From Zone <span className="text-red-500">*</span>
              </label>
              <select
                value={fromZone}
                onChange={(e) => setFromZone(e.target.value)}
                className={inputClass}
              >
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                To Zone <span className="text-red-500">*</span>
              </label>
              <select
                value={toZone}
                onChange={(e) => setToZone(e.target.value)}
                className={inputClass}
              >
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>
                Security Level Required
              </label>
              <select
                value={securityLevel}
                onChange={(e) => setSecurityLevel(e.target.value ? Number(e.target.value) : '')}
                className={inputClass}
              >
                <option value="">Auto (from zones)</option>
                {Object.entries(SECURITY_LEVEL_CONFIG).map(([level, config]) => (
                  <option key={level} value={level}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center pt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requiresInspection}
                  onChange={(e) => setRequiresInspection(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Requires Inspection</span>
              </label>
            </div>
          </div>

          {/* Protocol Flows */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className={labelClass}>
              Protocol Flows
            </label>

            {flows.length > 0 && (
              <div className="space-y-2 mb-3">
                {flows.map((flow, index) => (
                  <div key={index} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded">
                    <span className="flex-1 text-sm text-gray-800 dark:text-gray-200">
                      {flow.protocol}{flow.port ? `:${flow.port}` : ''} ({flow.direction})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFlow(index)}
                      className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      &#10005;
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  list="protocol-suggestions"
                  value={newProtocol}
                  onChange={(e) => handleProtocolSelect(e.target.value)}
                  placeholder="Protocol name..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                <datalist id="protocol-suggestions">
                  {COMMON_PROTOCOLS.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.port ? `Port ${p.port}` : 'No default port'}
                    </option>
                  ))}
                </datalist>
              </div>
              <input
                type="number"
                value={newPort}
                onChange={(e) => setNewPort(e.target.value)}
                placeholder="Port"
                className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
              <select
                value={newDirection}
                onChange={(e) => setNewDirection(e.target.value as ConduitDirection)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="bidirectional">Bidirectional</option>
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
              </select>
              <button
                type="button"
                onClick={handleAddFlow}
                disabled={!newProtocol.trim()}
                className="px-3 py-2 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500 disabled:opacity-50"
              >
                +
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Type a custom protocol or select from suggestions
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
              {isEditing ? 'Save Changes' : 'Add Conduit'}
            </button>
          </div>
        </form>
    </DialogShell>
  );
}
