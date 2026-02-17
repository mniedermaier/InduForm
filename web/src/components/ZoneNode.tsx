import { memo, useState, useCallback, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import type { Zone, ValidationResult, PolicyViolation } from '../types/models';
import { ZONE_TYPE_CONFIG, SECURITY_LEVEL_CONFIG } from '../types/models';
import { useTheme } from '../contexts/ThemeContext';
import ValidationPopover from './ValidationPopover';

export interface ZoneNodeData extends Record<string, unknown> {
  zone: Zone;
  selected?: boolean;
  onSelect?: (zone: Zone) => void;
  onEditZone?: (zone: Zone) => void;
  errorCount?: number;
  warningCount?: number;
  validationResults?: ValidationResult[];
  policyViolations?: PolicyViolation[];
  riskScore?: number;
  riskLevel?: string;
  riskOverlay?: boolean;
  remoteUser?: string;
  highlighted?: boolean;
  highlightRiskLevel?: string;
}

export type ZoneNodeType = Node<ZoneNodeData, 'zone'>;

const RISK_BORDER_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#3b82f6',
  minimal: '#22c55e',
};

const ZoneNode = memo(({ data, selected }: NodeProps<ZoneNodeType>) => {
  const {
    zone,
    onSelect,
    onEditZone,
    errorCount = 0,
    warningCount = 0,
    validationResults = [],
    policyViolations = [],
    riskScore,
    riskLevel,
    riskOverlay = false,
    remoteUser,
    highlighted = false,
    highlightRiskLevel,
  } = data as ZoneNodeData;
  const typeConfig = ZONE_TYPE_CONFIG[zone.type];
  const slConfig = SECURITY_LEVEL_CONFIG[zone.security_level_target];
  const { theme } = useTheme();
  const [showPopover, setShowPopover] = useState(false);
  const badgeRef = useRef<HTMLDivElement>(null);

  const handleBadgeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPopover(prev => !prev);
  }, []);

  const closePopover = useCallback(() => {
    setShowPopover(false);
  }, []);

  const hasIssues = errorCount > 0 || warningCount > 0;
  const attackPathColor = highlightRiskLevel === 'critical' ? '#ef4444' :
                          highlightRiskLevel === 'high' ? '#f97316' :
                          highlightRiskLevel === 'medium' ? '#eab308' : '#3b82f6';
  const borderColor = highlighted && highlightRiskLevel ? attackPathColor
    : riskOverlay && riskLevel ? RISK_BORDER_COLORS[riskLevel] || typeConfig.color
    : typeConfig.color;

  return (
    <div
      className={`
        px-4 py-3 rounded-lg shadow-lg border-2 min-w-[180px]
        transition-all duration-200 cursor-pointer group
        ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
        ${highlighted && !selected ? 'ring-2 ring-offset-2' : ''}
      `}
      style={{
        backgroundColor: theme === 'dark' ? '#1f2937' : 'white',
        borderColor,
        borderWidth: highlighted ? 3 : (riskOverlay ? 3 : 2),
        ...(highlighted && !selected ? { '--tw-ring-color': attackPathColor, boxShadow: `0 0 0 2px ${attackPathColor}40` } as React.CSSProperties : {}),
      }}
      onClick={() => onSelect?.(zone)}
    >
      {/* Validation badge */}
      {hasIssues && (
        <div
          ref={badgeRef}
          className={`absolute -top-2 -right-2 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shadow cursor-pointer hover:scale-110 transition-transform ${
            errorCount > 0 ? 'bg-red-500 hover:bg-red-600' : 'bg-orange-400 hover:bg-orange-500'
          }`}
          title={`Click to view ${errorCount > 0 ? `${errorCount} error${errorCount !== 1 ? 's' : ''}` : `${warningCount} warning${warningCount !== 1 ? 's' : ''}`}`}
          onClick={handleBadgeClick}
        >
          {errorCount > 0 ? errorCount : warningCount}
        </div>
      )}

      {showPopover && hasIssues && (
        <ValidationPopover
          validationResults={validationResults}
          policyViolations={policyViolations}
          entityName={zone.name}
          onClose={closePopover}
          triggerRef={badgeRef}
          onEdit={onEditZone ? () => onEditZone(zone) : undefined}
        />
      )}

      {/* Risk score badge */}
      {riskOverlay && riskScore != null && riskLevel && (
        <div
          className="absolute -top-2 -left-2 px-1.5 py-0.5 rounded-full text-white text-[10px] font-bold shadow"
          style={{ backgroundColor: RISK_BORDER_COLORS[riskLevel] || '#888' }}
          title={`Risk: ${riskScore} (${riskLevel})`}
        >
          {riskScore}
        </div>
      )}

      {/* Remote user selection indicator */}
      {remoteUser && (
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-purple-500 text-white text-[9px] font-medium whitespace-nowrap shadow">
          {remoteUser}
        </div>
      )}

      {/* Target handle (top) - for incoming connections */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-4 !h-4 !bg-gray-300 hover:!bg-green-500 !border-2 !border-gray-400 hover:!border-green-600 transition-colors"
        title="Drop here to connect"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded"
          style={{
            backgroundColor: typeConfig.color,
            color: 'white',
          }}
        >
          {typeConfig.label}
        </span>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded"
          style={{
            backgroundColor: slConfig.bgColor,
            color: slConfig.color,
          }}
        >
          {slConfig.label}
        </span>
      </div>

      {/* Zone name */}
      <div className="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate">
        {zone.name}
      </div>

      {/* Zone ID */}
      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
        {zone.id}
      </div>

      {/* Asset count */}
      {zone.assets.length > 0 && (
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          {zone.assets.length} asset{zone.assets.length !== 1 ? 's' : ''}
        </div>
      )}

      {/* Source handle (bottom) - drag from here to create connection */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-4 !h-4 !bg-gray-300 hover:!bg-blue-500 !border-2 !border-gray-400 hover:!border-blue-600 transition-colors"
        title="Drag to connect to another zone"
      />
    </div>
  );
});

ZoneNode.displayName = 'ZoneNode';

export default ZoneNode;
