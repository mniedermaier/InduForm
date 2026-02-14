import { memo, useCallback, useState, useRef, useEffect, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Project, Zone, Conduit, ValidationResult, PolicyViolation } from '../types/models';
import { ZONE_TYPE_CONFIG, SECURITY_LEVEL_CONFIG } from '../types/models';
import CommentsPanel from './CommentsPanel';

interface QuickFixAction {
  label: string;
  description: string;
  apply: () => void;
}

// Inline editable field component
const EditableField = memo(({
  label,
  value,
  onSave,
  type = 'text',
  options,
}: {
  label: string;
  value: string;
  onSave: (value: string) => void;
  type?: 'text' | 'select' | 'textarea';
  options?: { value: string; label: string }[];
}) => {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement || inputRef.current instanceof HTMLTextAreaElement) {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const handleSave = () => {
    if (editValue !== value) {
      onSave(editValue);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value);
    setEditing(false);
  };

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (!editing) {
    return (
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
        <div
          className="text-sm text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 rounded px-1 py-0.5 -mx-1 border border-transparent hover:border-gray-300 dark:hover:border-gray-600"
          onClick={() => { setEditValue(value); setEditing(true); }}
          title="Click to edit"
        >
          {value || <span className="text-gray-400 italic">Click to set</span>}
        </div>
      </div>
    );
  }

  if (type === 'select' && options) {
    return (
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={editValue}
          onChange={(e) => { setEditValue(e.target.value); onSave(e.target.value); setEditing(false); }}
          onBlur={handleCancel}
          onKeyDown={handleKeyDown}
          className="w-full text-sm border border-blue-400 dark:border-blue-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (type === 'textarea') {
    return (
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === 'Escape') handleCancel(); }}
          rows={2}
          className="w-full text-sm border border-blue-400 dark:border-blue-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
    );
  }

  return (
    <div>
      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-full text-sm border border-blue-400 dark:border-blue-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
});

EditableField.displayName = 'EditableField';

interface PropertiesPanelProps {
  selectedZone?: Zone;
  selectedConduit?: Conduit;
  validationResults: ValidationResult[];
  policyViolations: PolicyViolation[];
  project?: Project;
  projectId?: string;
  onClose: () => void;
  onDeleteZone?: (zoneId: string) => void;
  onEditZone?: (zone: Zone) => void;
  onDeleteConduit?: (conduitId: string) => void;
  onEditConduit?: (conduit: Conduit) => void;
  onAddAsset?: (zone: Zone) => void;
  onDeleteAsset?: (zoneId: string, assetId: string) => void;
  onSelectZone?: (zone: Zone) => void;
  onSelectConduit?: (conduit: Conduit) => void;
  onQuickFix?: (type: string, entityId: string, fix: Record<string, unknown>) => void;
  onInlineUpdateZone?: (zoneId: string, updates: Partial<Zone>) => void;
  onInlineUpdateConduit?: (conduitId: string, updates: Partial<Conduit>) => void;
  remoteEditors?: Map<string, string>;
  multiSelectedZoneIds?: string[];
  onBulkDeleteZones?: (zoneIds: string[]) => void;
  onBulkUpdateZones?: (zoneIds: string[], updates: Partial<Zone>) => void;
  apiConnected?: boolean;
  isOverlay?: boolean;
  onPanelClose?: () => void;
}

const PropertiesPanel = memo(({
  selectedZone,
  selectedConduit,
  validationResults,
  policyViolations,
  project,
  projectId,
  onClose,
  onDeleteZone,
  onEditZone,
  onDeleteConduit,
  onEditConduit,
  onAddAsset,
  onDeleteAsset,
  onSelectZone,
  onSelectConduit,
  onQuickFix,
  onInlineUpdateZone,
  onInlineUpdateConduit,
  remoteEditors,
  multiSelectedZoneIds = [],
  onBulkDeleteZones,
  onBulkUpdateZones,
  apiConnected = true,
  isOverlay = false,
  onPanelClose,
}: PropertiesPanelProps) => {
  const [showComments, setShowComments] = useState(false);
  // Get quick fix for a validation result
  const getQuickFix = useCallback((result: ValidationResult): QuickFixAction | null => {
    if (!project || !onQuickFix) return null;

    // Extract entity ID from location (e.g., "conduits[c-001]" -> "c-001")
    const locationMatch = result.location?.match(/\[([^\]]+)\]/);
    const entityId = locationMatch?.[1];

    switch (result.code) {
      case 'CONDUIT_INSPECTION_RECOMMENDED':
        if (entityId) {
          return {
            label: 'Enable Inspection',
            description: 'Set requires_inspection to true',
            apply: () => onQuickFix('conduit', entityId, { requires_inspection: true }),
          };
        }
        break;
      case 'CRITICAL_ASSET_LOW_SL':
        if (entityId) {
          return {
            label: 'Increase SL-T to 2',
            description: 'Set zone security level target to 2',
            apply: () => onQuickFix('zone', entityId, { security_level_target: 2 }),
          };
        }
        break;
      case 'CONDUIT_NO_FLOWS':
        return {
          label: 'Add default flow',
          description: 'Open conduit editor to define protocol flows',
          apply: () => {}, // Informational — user should edit the conduit
        };
      case 'ZONE_NO_CONDUITS':
        return {
          label: 'No connections',
          description: 'This zone has no conduits — add a conduit to connect it',
          apply: () => {}, // Informational
        };
      case 'PURDUE_NON_ADJACENT':
        return {
          label: 'Review connection',
          description: 'Consider routing through intermediate Purdue model levels',
          apply: () => {}, // Informational
        };
    }
    return null;
  }, [project, onQuickFix]);

  // Get quick fix for a policy violation
  const getPolicyQuickFix = useCallback((violation: PolicyViolation): QuickFixAction | null => {
    if (!project || !onQuickFix) return null;

    switch (violation.rule_id) {
      case 'POL-002': { // SL boundary protection
        const conduitId = violation.affected_entities.find(e =>
          project.conduits.some(c => c.id === e)
        );
        if (conduitId) {
          return {
            label: 'Enable Inspection',
            description: 'Set requires_inspection to true',
            apply: () => onQuickFix('conduit', conduitId, { requires_inspection: true }),
          };
        }
        break;
      }
      case 'POL-006': { // Safety zone protection
        const zoneId = violation.affected_entities.find(e =>
          project.zones.some(z => z.id === e)
        );
        if (zoneId) {
          return {
            label: 'Increase SL-T to 3',
            description: 'Set zone security level target to 3',
            apply: () => onQuickFix('zone', zoneId, { security_level_target: 3 }),
          };
        }
        break;
      }
      case 'POL-001': { // Default deny
        const pol001ConduitId = violation.affected_entities.find(e =>
          project.conduits.some(c => c.id === e)
        );
        if (pol001ConduitId) {
          return {
            label: 'Define flows',
            description: 'Edit this conduit to define explicit protocol flows',
            apply: () => {}, // Informational — user should edit the conduit
          };
        }
        break;
      }
      case 'POL-004': { // Cell isolation
        const pol004ConduitId = violation.affected_entities.find(e =>
          project.conduits.some(c => c.id === e)
        );
        if (pol004ConduitId) {
          return {
            label: 'Remove direct connection',
            description: 'Delete this cell-to-cell conduit',
            apply: () => onQuickFix('deleteConduit', pol004ConduitId, {}),
          };
        }
        break;
      }
      case 'POL-005': { // DMZ requirement
        const pol005ConduitId = violation.affected_entities.find(e =>
          project.conduits.some(c => c.id === e)
        );
        if (pol005ConduitId) {
          return {
            label: 'Remove direct connection',
            description: 'Delete this enterprise-to-cell conduit',
            apply: () => onQuickFix('deleteConduit', pol005ConduitId, {}),
          };
        }
        break;
      }
    }
    return null;
  }, [project, onQuickFix]);

  // Navigate to entity when clicking validation item
  const handleValidationClick = useCallback((result: ValidationResult) => {
    if (!project) return;

    const locationMatch = result.location?.match(/\[([^\]]+)\]/);
    const entityId = locationMatch?.[1];
    if (!entityId) return;

    // Check if it's a zone or conduit
    const zone = project.zones.find(z => z.id === entityId);
    if (zone && onSelectZone) {
      onSelectZone(zone);
      return;
    }

    const conduit = project.conduits.find(c => c.id === entityId);
    if (conduit && onSelectConduit) {
      onSelectConduit(conduit);
    }
  }, [project, onSelectZone, onSelectConduit]);

  // Navigate to entity when clicking policy violation
  const handlePolicyClick = useCallback((violation: PolicyViolation) => {
    if (!project) return;

    for (const entityId of violation.affected_entities) {
      const zone = project.zones.find(z => z.id === entityId);
      if (zone && onSelectZone) {
        onSelectZone(zone);
        return;
      }

      const conduit = project.conduits.find(c => c.id === entityId);
      if (conduit && onSelectConduit) {
        onSelectConduit(conduit);
        return;
      }
    }
  }, [project, onSelectZone, onSelectConduit]);

  const panelClasses = isOverlay
    ? 'fixed right-0 top-0 h-full w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 z-40 shadow-xl transition-transform'
    : 'hidden lg:block w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700';

  if (!selectedZone && !selectedConduit) {
    return (
      <div className={`${panelClasses} p-4 overflow-y-auto`}>
        {isOverlay && onPanelClose && (
          <button
            onClick={onPanelClose}
            className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 lg:hidden"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Properties</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Select a zone or conduit to view its properties
        </p>

        {/* Validation Issues List */}
        {(validationResults.length > 0 || policyViolations.length > 0) && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Issues</h3>
            <div className="space-y-2">
              {/* Errors first */}
              {validationResults.filter(r => r.severity === 'error').map((result, index) => (
                <ValidationItem
                  key={`err-${index}`}
                  result={result}
                  quickFix={getQuickFix(result)}
                  onClick={() => handleValidationClick(result)}
                />
              ))}

              {/* Then warnings */}
              {validationResults.filter(r => r.severity === 'warning').map((result, index) => (
                <ValidationItem
                  key={`warn-${index}`}
                  result={result}
                  quickFix={getQuickFix(result)}
                  onClick={() => handleValidationClick(result)}
                />
              ))}

              {/* Policy violations */}
              {policyViolations.map((violation, index) => (
                <PolicyItem
                  key={`pol-${index}`}
                  violation={violation}
                  quickFix={getPolicyQuickFix(violation)}
                  onClick={() => handlePolicyClick(violation)}
                />
              ))}

              {/* Info items last */}
              {validationResults.filter(r => r.severity === 'info').map((result, index) => (
                <ValidationItem
                  key={`info-${index}`}
                  result={result}
                  quickFix={getQuickFix(result)}
                  onClick={() => handleValidationClick(result)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${panelClasses} overflow-y-auto`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {selectedZone ? 'Zone' : 'Conduit'} Properties
        </h2>
        <button
          onClick={() => { onClose(); onPanelClose?.(); }}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          &#10005;
        </button>
      </div>

      {/* Multi-select bulk actions */}
      {multiSelectedZoneIds.length > 1 && !selectedZone && !selectedConduit && (
        <div className="p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {multiSelectedZoneIds.length} zones selected
          </h3>
          {onBulkUpdateZones && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Set SL-T for all</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(sl => (
                  <button
                    key={sl}
                    onClick={() => onBulkUpdateZones(multiSelectedZoneIds, { security_level_target: sl })}
                    className="px-3 py-1 text-xs font-bold rounded"
                    style={{
                      backgroundColor: SECURITY_LEVEL_CONFIG[sl]?.bgColor,
                      color: SECURITY_LEVEL_CONFIG[sl]?.color,
                    }}
                  >
                    SL-{sl}
                  </button>
                ))}
              </div>
            </div>
          )}
          {onBulkDeleteZones && (
            <button
              onClick={() => {
                if (confirm(`Delete ${multiSelectedZoneIds.length} zones? This cannot be undone.`)) {
                  onBulkDeleteZones(multiSelectedZoneIds);
                }
              }}
              className="w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded hover:bg-red-100 dark:hover:bg-red-900/50"
            >
              Delete {multiSelectedZoneIds.length} Zones
            </button>
          )}
        </div>
      )}

      {/* Zone Properties */}
      {selectedZone && (
        <div className="p-4 space-y-4">
          {/* Remote editor warning */}
          {remoteEditors?.has(selectedZone.id) && (
            <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded p-2 text-xs text-purple-700 dark:text-purple-300">
              {remoteEditors.get(selectedZone.id)} is also viewing this zone
            </div>
          )}

          <PropertyRow label="ID" value={selectedZone.id} />

          {onInlineUpdateZone ? (
            <EditableField
              label="Name"
              value={selectedZone.name}
              onSave={(v) => onInlineUpdateZone(selectedZone.id, { name: v })}
            />
          ) : (
            <PropertyRow label="Name" value={selectedZone.name} />
          )}

          {onInlineUpdateZone ? (
            <EditableField
              label="Type"
              value={selectedZone.type}
              type="select"
              options={Object.entries(ZONE_TYPE_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
              onSave={(v) => onInlineUpdateZone(selectedZone.id, { type: v as Zone['type'] })}
            />
          ) : (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Type</label>
              <span
                className="inline-block px-2 py-1 rounded text-xs font-medium text-white"
                style={{ backgroundColor: ZONE_TYPE_CONFIG[selectedZone.type].color }}
              >
                {ZONE_TYPE_CONFIG[selectedZone.type].label}
              </span>
            </div>
          )}

          {onInlineUpdateZone ? (
            <EditableField
              label="Security Level Target"
              value={String(selectedZone.security_level_target)}
              type="select"
              options={[1, 2, 3, 4].map(sl => ({ value: String(sl), label: `SL-${sl} - ${SECURITY_LEVEL_CONFIG[sl]?.name || ''}` }))}
              onSave={(v) => onInlineUpdateZone(selectedZone.id, { security_level_target: parseInt(v) })}
            />
          ) : (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Security Level Target</label>
              <span
                className="inline-block px-2 py-1 rounded text-xs font-bold"
                style={{
                  backgroundColor: SECURITY_LEVEL_CONFIG[selectedZone.security_level_target].bgColor,
                  color: SECURITY_LEVEL_CONFIG[selectedZone.security_level_target].color,
                }}
              >
                SL-T {selectedZone.security_level_target}
              </span>
            </div>
          )}

          {onInlineUpdateZone ? (
            <EditableField
              label="Description"
              value={selectedZone.description || ''}
              type="textarea"
              onSave={(v) => onInlineUpdateZone(selectedZone.id, { description: v || undefined })}
            />
          ) : selectedZone.description ? (
            <PropertyRow label="Description" value={selectedZone.description} />
          ) : null}

          {selectedZone.parent_zone && (
            <PropertyRow label="Parent Zone" value={selectedZone.parent_zone} />
          )}

          {/* Assets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">
                Assets ({selectedZone.assets.length})
              </label>
              {apiConnected && onAddAsset && (
                <button
                  onClick={() => onAddAsset(selectedZone)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                >
                  + Add Asset
                </button>
              )}
            </div>
            {selectedZone.assets.length > 0 ? (
              <div className="space-y-2">
                {selectedZone.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="bg-gray-50 dark:bg-gray-700 rounded p-2 text-sm group"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-gray-800 dark:text-gray-100">{asset.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {asset.type} {asset.ip_address && `• ${asset.ip_address}`}
                        </div>
                        {asset.vendor && (
                          <div className="text-xs text-gray-400 dark:text-gray-500">
                            {asset.vendor} {asset.model && `${asset.model}`}
                          </div>
                        )}
                      </div>
                      {apiConnected && onDeleteAsset && (
                        <button
                          onClick={() => onDeleteAsset(selectedZone.id, asset.id)}
                          className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Delete asset"
                        >
                          &#10005;
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">No assets in this zone</p>
            )}
          </div>

          {/* Edit/Delete Zone Buttons */}
          {apiConnected && (onEditZone || onDeleteZone) && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
              {onEditZone && (
                <button
                  onClick={() => onEditZone(selectedZone)}
                  className="w-full px-3 py-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                >
                  Edit Zone
                </button>
              )}
              {onDeleteZone && (
                <button
                  onClick={() => {
                    if (confirm(`Delete zone "${selectedZone.name}"? This cannot be undone.`)) {
                      onDeleteZone(selectedZone.id);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded hover:bg-red-100 dark:hover:bg-red-900/50"
                >
                  Delete Zone
                </button>
              )}
            </div>
          )}

          {/* Comments Section */}
          {projectId && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowComments(!showComments)}
                className="flex items-center justify-between w-full text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                <span>Comments</span>
                <span className="text-gray-400">{showComments ? '▼' : '▶'}</span>
              </button>
              {showComments && (
                <CommentsPanel
                  projectId={projectId}
                  entityType="zone"
                  entityId={selectedZone.id}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Conduit Properties */}
      {selectedConduit && (
        <div className="p-4 space-y-4">
          {/* Remote editor warning */}
          {remoteEditors?.has(selectedConduit.id) && (
            <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded p-2 text-xs text-purple-700 dark:text-purple-300">
              {remoteEditors.get(selectedConduit.id)} is also viewing this conduit
            </div>
          )}

          <PropertyRow label="ID" value={selectedConduit.id} />

          {onInlineUpdateConduit ? (
            <EditableField
              label="Name"
              value={selectedConduit.name || ''}
              onSave={(v) => onInlineUpdateConduit(selectedConduit.id, { name: v || undefined })}
            />
          ) : selectedConduit.name ? (
            <PropertyRow label="Name" value={selectedConduit.name} />
          ) : null}

          <PropertyRow label="From Zone" value={selectedConduit.from_zone} />
          <PropertyRow label="To Zone" value={selectedConduit.to_zone} />

          {onInlineUpdateConduit ? (
            <EditableField
              label="Requires Inspection"
              value={selectedConduit.requires_inspection ? 'true' : 'false'}
              type="select"
              options={[{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]}
              onSave={(v) => onInlineUpdateConduit(selectedConduit.id, { requires_inspection: v === 'true' })}
            />
          ) : (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Requires Inspection</label>
              <span className={`text-sm font-medium ${selectedConduit.requires_inspection ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {selectedConduit.requires_inspection ? 'Yes' : 'No'}
              </span>
            </div>
          )}

          {onInlineUpdateConduit ? (
            <EditableField
              label="Required Security Level"
              value={String(selectedConduit.security_level_required || '')}
              type="select"
              options={[{ value: '', label: 'None' }, ...[1, 2, 3, 4].map(sl => ({ value: String(sl), label: `SL-${sl}` }))]}
              onSave={(v) => onInlineUpdateConduit(selectedConduit.id, { security_level_required: v ? parseInt(v) : undefined })}
            />
          ) : selectedConduit.security_level_required ? (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Required Security Level</label>
              <span
                className="inline-block px-2 py-1 rounded text-xs font-bold"
                style={{
                  backgroundColor: SECURITY_LEVEL_CONFIG[selectedConduit.security_level_required].bgColor,
                  color: SECURITY_LEVEL_CONFIG[selectedConduit.security_level_required].color,
                }}
              >
                SL {selectedConduit.security_level_required}
              </span>
            </div>
          ) : null}

          {onInlineUpdateConduit ? (
            <EditableField
              label="Description"
              value={selectedConduit.description || ''}
              type="textarea"
              onSave={(v) => onInlineUpdateConduit(selectedConduit.id, { description: v || undefined })}
            />
          ) : selectedConduit.description ? (
            <PropertyRow label="Description" value={selectedConduit.description} />
          ) : null}

          {/* Protocol Flows */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-2">
              Protocol Flows ({selectedConduit.flows.length})
            </label>
            {selectedConduit.flows.length > 0 ? (
              <div className="space-y-2">
                {selectedConduit.flows.map((flow, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 dark:bg-gray-700 rounded p-2 text-sm"
                  >
                    <div className="font-medium text-gray-800 dark:text-gray-100">
                      {flow.protocol}
                      {flow.port && `:${flow.port}`}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {flow.direction}
                      {flow.description && ` • ${flow.description}`}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">No protocol flows defined</p>
            )}
          </div>

          {/* Edit/Delete Conduit Buttons */}
          {apiConnected && (onEditConduit || onDeleteConduit) && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
              {onEditConduit && (
                <button
                  onClick={() => onEditConduit(selectedConduit)}
                  className="w-full px-3 py-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                >
                  Edit Conduit
                </button>
              )}
              {onDeleteConduit && (
                <button
                  onClick={() => {
                    if (confirm(`Delete conduit "${selectedConduit.id}"? This cannot be undone.`)) {
                      onDeleteConduit(selectedConduit.id);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded hover:bg-red-100 dark:hover:bg-red-900/50"
                >
                  Delete Conduit
                </button>
              )}
            </div>
          )}

          {/* Comments Section */}
          {projectId && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowComments(!showComments)}
                className="flex items-center justify-between w-full text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                <span>Comments</span>
                <span className="text-gray-400">{showComments ? '▼' : '▶'}</span>
              </button>
              {showComments && (
                <CommentsPanel
                  projectId={projectId}
                  entityType="conduit"
                  entityId={selectedConduit.id}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Related Validation Issues */}
      {(selectedZone || selectedConduit) && (
        <RelatedIssues
          entityId={selectedZone?.id || selectedConduit?.id || ''}
          validationResults={validationResults}
          policyViolations={policyViolations}
        />
      )}
    </div>
  );
});

PropertiesPanel.displayName = 'PropertiesPanel';

// Helper components
const PropertyRow = memo(({ label, value }: { label: string; value: string }) => (
  <div>
    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
    <div className="text-sm text-gray-800 dark:text-gray-200">{value}</div>
  </div>
));

PropertyRow.displayName = 'PropertyRow';

const RelatedIssues = memo(({
  entityId,
  validationResults,
  policyViolations,
}: {
  entityId: string;
  validationResults: ValidationResult[];
  policyViolations: PolicyViolation[];
}) => {
  const relatedValidation = validationResults.filter(
    (r) => r.location?.includes(entityId)
  );
  const relatedViolations = policyViolations.filter(
    (v) => v.affected_entities.includes(entityId)
  );

  if (relatedValidation.length === 0 && relatedViolations.length === 0) {
    return null;
  }

  return (
    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Issues</h3>
      <div className="space-y-2">
        {relatedValidation.map((result, index) => (
          <div
            key={`v-${index}`}
            className={`text-xs p-2 rounded ${
              result.severity === 'error'
                ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                : result.severity === 'warning'
                ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
                : 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300'
            }`}
          >
            <div className="font-medium">{result.code}</div>
            <div>{result.message}</div>
          </div>
        ))}
        {relatedViolations.map((violation, index) => (
          <div
            key={`p-${index}`}
            className={`text-xs p-2 rounded ${
              violation.severity === 'critical'
                ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                : violation.severity === 'high'
                ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
                : 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300'
            }`}
          >
            <div className="font-medium">{violation.rule_id}: {violation.rule_name}</div>
            <div>{violation.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
});

RelatedIssues.displayName = 'RelatedIssues';

// Validation item component with click and quick-fix support
const ValidationItem = memo(({
  result,
  quickFix,
  onClick,
}: {
  result: ValidationResult;
  quickFix: QuickFixAction | null;
  onClick: () => void;
}) => {
  const severityStyles = {
    error: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300',
    warning: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300',
    info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300',
  };

  const severityIcons = {
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  return (
    <div
      className={`text-xs p-2 rounded border cursor-pointer hover:opacity-80 transition-opacity ${severityStyles[result.severity]}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0 mt-0.5">{severityIcons[result.severity]}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium">{result.code}</div>
          <div className="text-[11px] opacity-90 mt-0.5">{result.message}</div>
          {result.location && (
            <div className="text-[10px] opacity-70 mt-1 font-mono">{result.location}</div>
          )}
          {quickFix && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                quickFix.apply();
              }}
              className="mt-2 px-2 py-1 text-[10px] font-medium bg-white dark:bg-gray-700 rounded border border-current hover:bg-gray-50 dark:hover:bg-gray-600"
              title={quickFix.description}
            >
              Quick Fix: {quickFix.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

ValidationItem.displayName = 'ValidationItem';

// Policy violation item component
const PolicyItem = memo(({
  violation,
  quickFix,
  onClick,
}: {
  violation: PolicyViolation;
  quickFix: QuickFixAction | null;
  onClick: () => void;
}) => {
  const severityStyles = {
    critical: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300',
    high: 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300',
    medium: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300',
    low: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300',
  };

  return (
    <div
      className={`text-xs p-2 rounded border cursor-pointer hover:opacity-80 transition-opacity ${severityStyles[violation.severity]}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0 mt-0.5">⚡</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium">{violation.rule_id}: {violation.rule_name}</div>
          <div className="text-[11px] opacity-90 mt-0.5">{violation.message}</div>
          {violation.affected_entities.length > 0 && (
            <div className="text-[10px] opacity-70 mt-1 font-mono">
              {violation.affected_entities.join(', ')}
            </div>
          )}
          {violation.remediation && (
            <div className="text-[10px] opacity-80 mt-1 italic">
              {violation.remediation}
            </div>
          )}
          {quickFix && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                quickFix.apply();
              }}
              className="mt-2 px-2 py-1 text-[10px] font-medium bg-white dark:bg-gray-700 rounded border border-current hover:bg-gray-50 dark:hover:bg-gray-600"
              title={quickFix.description}
            >
              Quick Fix: {quickFix.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

PolicyItem.displayName = 'PolicyItem';

export default PropertiesPanel;
