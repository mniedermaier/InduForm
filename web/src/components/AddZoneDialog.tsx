import { useState } from 'react';
import type { Zone, ZoneType } from '../types/models';
import { ZONE_TYPE_CONFIG, SECURITY_LEVEL_CONFIG } from '../types/models';
import DialogShell from './DialogShell';

// Predefined zone templates for common IEC 62443 configurations
const ZONE_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  template: Partial<Zone>;
}> = [
  {
    id: 'enterprise',
    name: 'Enterprise Network',
    description: 'Corporate IT network with basic security',
    template: {
      type: 'enterprise',
      security_level_target: 1,
    },
  },
  {
    id: 'site_dmz',
    name: 'Site DMZ',
    description: 'Demilitarized zone between IT and OT',
    template: {
      type: 'dmz',
      security_level_target: 3,
    },
  },
  {
    id: 'control_center',
    name: 'Control Center',
    description: 'SCADA/DCS control room with high security',
    template: {
      type: 'site',
      security_level_target: 3,
    },
  },
  {
    id: 'production_cell',
    name: 'Production Cell',
    description: 'Manufacturing cell with PLCs and HMIs',
    template: {
      type: 'cell',
      security_level_target: 2,
    },
  },
  {
    id: 'safety_system',
    name: 'Safety System',
    description: 'SIS zone with maximum security',
    template: {
      type: 'cell',
      security_level_target: 4,
    },
  },
  {
    id: 'field_network',
    name: 'Field Network',
    description: 'I/O and sensor network',
    template: {
      type: 'area',
      security_level_target: 2,
    },
  },
];

interface AddZoneDialogProps {
  existingZones: Zone[];
  onAdd: (zone: Zone) => void;
  onCancel: () => void;
  // For editing existing zone
  editZone?: Zone;
}

export default function AddZoneDialog({ existingZones, onAdd, onCancel, editZone }: AddZoneDialogProps) {
  const isEditing = !!editZone;

  const [id, setId] = useState(editZone?.id || '');
  const [name, setName] = useState(editZone?.name || '');
  const [type, setType] = useState<ZoneType>(editZone?.type || 'cell');
  const [securityLevel, setSecurityLevel] = useState(editZone?.security_level_target || 2);
  const [parentZone, setParentZone] = useState<string>(editZone?.parent_zone || '');
  const [description, setDescription] = useState(editZone?.description || '');
  const [error, setError] = useState<string | null>(null);

  // Apply template
  const applyTemplate = (templateId: string) => {
    const template = ZONE_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    // Generate unique ID based on template
    let newId = template.id;
    let counter = 1;
    while (existingZones.some(z => z.id === newId)) {
      newId = `${template.id}_${counter++}`;
    }

    setId(newId);
    setName(template.name);
    setType(template.template.type || 'cell');
    setSecurityLevel(template.template.security_level_target || 2);
    setDescription(template.description);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate ID
    if (!id.trim()) {
      setError('ID is required');
      return;
    }
    // When editing, allow the same ID; when adding, check for duplicates
    if (!isEditing && existingZones.some(z => z.id === id)) {
      setError('A zone with this ID already exists');
      return;
    }
    if (isEditing && editZone?.id !== id && existingZones.some(z => z.id === id)) {
      setError('A zone with this ID already exists');
      return;
    }
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    // Don't allow setting self as parent
    if (parentZone === id) {
      setError('A zone cannot be its own parent');
      return;
    }

    const zone: Zone = {
      id: id.trim(),
      name: name.trim(),
      type,
      security_level_target: securityLevel,
      assets: editZone?.assets || [], // Preserve assets when editing
      ...(parentZone && { parent_zone: parentZone }),
      ...(description && { description }),
    };

    onAdd(zone);
  };

  return (
    <DialogShell title={isEditing ? 'Edit Zone' : 'Add New Zone'} onClose={onCancel}>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto dark:text-gray-200">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}

          {/* Zone Templates - only show when adding new zone */}
          {!isEditing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Quick Start Template
              </label>
              <div className="grid grid-cols-2 gap-2">
                {ZONE_TEMPLATES.map(template => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template.id)}
                    className="text-left px-3 py-2 rounded border border-gray-200 dark:border-gray-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                  >
                    <div className="font-medium text-sm text-gray-800 dark:text-gray-200">{template.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{template.description}</div>
                  </button>
                ))}
              </div>
              <div className="mt-2 border-t border-gray-200 dark:border-gray-700 pt-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">Or configure manually:</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="e.g., cell_03"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Assembly Cell 03"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ZONE_TYPE_CONFIG)
                .sort(([, a], [, b]) => b.level - a.level) // Sort by level (top to bottom)
                .map(([key, config]) => (
                  <label
                    key={key}
                    className={`
                      flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-all
                      ${type === key
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }
                    `}
                    title={config.description}
                  >
                    <input
                      type="radio"
                      name="zoneType"
                      value={key}
                      checked={type === key}
                      onChange={(e) => setType(e.target.value as ZoneType)}
                      className="w-3 h-3"
                    />
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: config.color }}
                    />
                    <span className="font-medium text-sm text-gray-800 dark:text-gray-200">{config.label}</span>
                  </label>
                ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Security Level Target <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(SECURITY_LEVEL_CONFIG).map(([level, config]) => (
                <label
                  key={level}
                  className={`
                    flex items-center gap-2 px-2 py-1.5 rounded border cursor-pointer transition-all
                    ${securityLevel === Number(level)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }
                  `}
                  title={config.description}
                >
                  <input
                    type="radio"
                    name="securityLevel"
                    value={level}
                    checked={securityLevel === Number(level)}
                    onChange={(e) => setSecurityLevel(Number(e.target.value))}
                    className="w-3 h-3"
                  />
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-xs font-bold"
                    style={{
                      backgroundColor: config.bgColor,
                      color: config.color,
                    }}
                  >
                    {config.label}
                  </span>
                  <span className="font-medium text-sm text-gray-800 dark:text-gray-200">{config.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Parent Zone
            </label>
            <select
              value={parentZone}
              onChange={(e) => setParentZone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            >
              <option value="">None</option>
              {existingZones
                .filter(z => z.id !== editZone?.id) // Don't show self as parent option
                .map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name} ({zone.id})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
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
              {isEditing ? 'Save Changes' : 'Add Zone'}
            </button>
          </div>
        </form>
    </DialogShell>
  );
}
