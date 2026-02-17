import { memo, useState, useCallback, useRef } from 'react';
import {
  EdgeProps,
  getBezierPath,
  EdgeLabelRenderer,
  BaseEdge,
  useStore,
} from '@xyflow/react';
import type { Edge, ReactFlowState } from '@xyflow/react';
import { findObstructingNodes, computeSmartPath } from './edgeRouting';
import type { NodeRect } from './edgeRouting';
import type { Conduit, ValidationResult, PolicyViolation } from '../types/models';
import { useTheme } from '../contexts/ThemeContext';
import ValidationPopover from './ValidationPopover';

export interface ConduitEdgeData extends Record<string, unknown> {
  conduit: Conduit;
  selected?: boolean;
  onSelect?: (conduit: Conduit) => void;
  onEditConduit?: (conduit: Conduit) => void;
  errorCount?: number;
  warningCount?: number;
  validationResults?: ValidationResult[];
  policyViolations?: PolicyViolation[];
}

export type ConduitEdgeType = Edge<ConduitEdgeData, 'conduit'>;

const selectNodeRects = (state: ReactFlowState): NodeRect[] => {
  const rects: NodeRect[] = [];
  for (const [id, node] of state.nodeLookup) {
    const w = node.measured?.width;
    const h = node.measured?.height;
    if (w && h) {
      rects.push({
        id,
        x: node.internals.positionAbsolute.x,
        y: node.internals.positionAbsolute.y,
        width: w,
        height: h,
      });
    }
  }
  return rects;
};

function nodeRectsEqual(a: NodeRect[], b: NodeRect[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].x !== b[i].x ||
      a[i].y !== b[i].y ||
      a[i].width !== b[i].width ||
      a[i].height !== b[i].height
    ) return false;
  }
  return true;
}

const ConduitEdge = memo(({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<ConduitEdgeType>) => {
  const { theme } = useTheme();
  const edgeData = data as ConduitEdgeData | undefined;
  const conduit = edgeData?.conduit;
  const onEditConduit = edgeData?.onEditConduit;
  const errorCount = edgeData?.errorCount ?? 0;
  const warningCount = edgeData?.warningCount ?? 0;
  const validationResults = edgeData?.validationResults ?? [];
  const policyViolations = edgeData?.policyViolations ?? [];
  const [showPopover, setShowPopover] = useState(false);
  const warningRef = useRef<HTMLSpanElement>(null);

  const nodeRects = useStore(selectNodeRects, nodeRectsEqual);
  const obstructing = findObstructingNodes(sourceX, sourceY, targetX, targetY, source, target, nodeRects);
  const smartResult = computeSmartPath(sourceX, sourceY, targetX, targetY, obstructing);

  let edgePath: string, labelX: number, labelY: number;
  if (smartResult && smartResult.path && !smartResult.path.includes('NaN')) {
    ({ path: edgePath, labelX, labelY } = smartResult);
  } else {
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  // Generate protocol label
  const protocolLabel = conduit?.flows
    .map((f) => f.protocol)
    .slice(0, 2)
    .join(', ');
  const moreProtocols = conduit?.flows.length && conduit.flows.length > 2
    ? ` +${conduit.flows.length - 2}`
    : '';

  // Determine edge color based on validation status, then inspection requirement
  const strokeColor = errorCount > 0
    ? '#ef4444'
    : (warningCount > 0 || conduit?.requires_inspection)
      ? '#f97316'
      : '#64748b';

  const hasIssues = errorCount > 0 || warningCount > 0;

  const handleWarningClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPopover(prev => !prev);
  }, []);

  const closePopover = useCallback(() => {
    setShowPopover(false);
  }, []);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? '#3b82f6' : strokeColor,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: conduit?.requires_inspection ? '5,5' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
            backgroundColor: theme === 'dark' ? '#1f2937' : 'white',
          }}
          className={`
            px-2 py-1 rounded text-xs font-medium
            border shadow-sm cursor-pointer
            hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors
            ${selected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-300 dark:border-gray-600'}
          `}
          onClick={() => data?.onSelect?.(conduit!)}
        >
          <div className="flex items-center gap-1">
            {hasIssues && (
              <span
                ref={warningRef}
                className={`cursor-pointer hover:scale-110 transition-transform ${errorCount > 0 ? 'text-red-500' : 'text-orange-500'}`}
                title={`Click to view ${errorCount > 0 ? `${errorCount} error${errorCount !== 1 ? 's' : ''}` : `${warningCount} warning${warningCount !== 1 ? 's' : ''}`}`}
                onClick={handleWarningClick}
              >
                &#9888;
              </span>
            )}
            {!hasIssues && conduit?.requires_inspection && (
              <span title="Requires inspection" className="text-orange-500 dark:text-orange-400">
                &#128270;
              </span>
            )}
            <span className="text-gray-700 dark:text-gray-300">
              {protocolLabel || 'No flows'}
              {moreProtocols}
            </span>
          </div>
        </div>
      </EdgeLabelRenderer>

      {showPopover && hasIssues && (
        <ValidationPopover
          validationResults={validationResults}
          policyViolations={policyViolations}
          entityName={conduit?.id || 'Conduit'}
          onClose={closePopover}
          triggerRef={warningRef}
          onEdit={onEditConduit && conduit ? () => onEditConduit(conduit) : undefined}
        />
      )}
    </>
  );
});

ConduitEdge.displayName = 'ConduitEdge';

export default ConduitEdge;
