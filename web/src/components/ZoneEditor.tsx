import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  NodeTypes,
  EdgeTypes,
  ConnectionMode,
  useReactFlow,
  Connection,
  getNodesBounds,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Project, Zone, Conduit, ValidationResult, PolicyViolation } from '../types/models';
import { ZONE_TYPE_CONFIG, SECURITY_LEVEL_CONFIG } from '../types/models';
import ZoneNode, { ZoneNodeData } from './ZoneNode';
import ConduitEdge, { ConduitEdgeData } from './ConduitEdge';

export interface ContextMenuEvent {
  x: number;
  y: number;
  type: 'zone' | 'conduit' | 'pane';
  zone?: Zone;
  conduit?: Conduit;
}

export interface ExportContext {
  viewport: HTMLElement | null;
  getNodesBounds: () => { x: number; y: number; width: number; height: number };
}

interface ZoneEditorProps {
  project: Project;
  selectedZone?: Zone;
  selectedConduit?: Conduit;
  onSelectZone: (zone: Zone | undefined) => void;
  onSelectConduit: (conduit: Conduit | undefined) => void;
  onConnect?: (fromZoneId: string, toZoneId: string) => void;
  onContextMenu?: (event: ContextMenuEvent) => void;
  onExportContextReady?: (context: ExportContext) => void;
  onEditZone?: (zone: Zone) => void;
  onEditConduit?: (conduit: Conduit) => void;
  onZonePositionsChange?: (positions: Map<string, { x: number; y: number }>) => void;
  rearrangeKey?: number; // Increment to trigger rearrangement
  validationResults?: ValidationResult[];
  policyViolations?: PolicyViolation[];
  riskOverlayEnabled?: boolean;
  zoneRisks?: Map<string, { score: number; level: string }>;
  remoteSelections?: Map<string, string>;
  onSelectionChange?: (selectedIds: string[]) => void;
}

// Define custom node types
const nodeTypes: NodeTypes = {
  zone: ZoneNode,
};

// Define custom edge types
const edgeTypes: EdgeTypes = {
  conduit: ConduitEdge,
};

// Default zone type levels (fallback when no conduits define topology)
const ZONE_TYPE_PRIORITY: Record<string, number> = {
  enterprise: 6,
  dmz: 5,
  site: 4,
  area: 3,
  cell: 2,
  safety: 1,
};

const HORIZONTAL_SPACING = 280;
const VERTICAL_SPACING = 180;

/**
 * Calculate optimal positions for zones using graph-based hierarchical layout.
 * Uses conduit connections to determine the topology, with zone types as fallback.
 */
function calculateZonePositions(zones: Zone[], conduits: Conduit[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  if (zones.length === 0) return positions;

  // Build directed graph from conduits
  const outgoing = new Map<string, Set<string>>(); // zone -> zones it connects TO
  const incoming = new Map<string, Set<string>>(); // zone -> zones that connect TO it
  const zoneIds = new Set(zones.map(z => z.id));

  zones.forEach(z => {
    outgoing.set(z.id, new Set());
    incoming.set(z.id, new Set());
  });

  conduits.forEach(c => {
    if (zoneIds.has(c.from_zone) && zoneIds.has(c.to_zone)) {
      outgoing.get(c.from_zone)?.add(c.to_zone);
      incoming.get(c.to_zone)?.add(c.from_zone);
    }
  });

  // Assign levels using topological sort with longest path
  const levels = assignGraphLevels(zones, outgoing, incoming);

  // Group zones by their assigned level
  const levelGroups = new Map<number, Zone[]>();
  zones.forEach(zone => {
    const level = levels.get(zone.id) ?? 0;
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level)!.push(zone);
  });

  // Sort levels from top (0) to bottom
  const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);

  // Position each level, using barycenter for horizontal ordering
  let currentY = 50;

  sortedLevels.forEach((level, levelIndex) => {
    const zonesAtLevel = levelGroups.get(level) || [];

    // Sort zones within level by connections to previous levels
    if (levelIndex > 0) {
      sortByBarycenter(zonesAtLevel, positions, incoming);
    } else {
      // First level - sort by zone type priority, then by name
      zonesAtLevel.sort((a, b) => {
        const priorityDiff = (ZONE_TYPE_PRIORITY[b.type] || 0) - (ZONE_TYPE_PRIORITY[a.type] || 0);
        return priorityDiff !== 0 ? priorityDiff : a.name.localeCompare(b.name);
      });
    }

    // Calculate horizontal positions - center the group
    const totalWidth = (zonesAtLevel.length - 1) * HORIZONTAL_SPACING;
    const startX = 400 - totalWidth / 2;

    zonesAtLevel.forEach((zone, index) => {
      positions.set(zone.id, {
        x: startX + index * HORIZONTAL_SPACING,
        y: currentY
      });
    });

    currentY += VERTICAL_SPACING;
  });

  return positions;
}

/**
 * Assign levels to zones based on graph topology using longest path algorithm.
 * Zones with no incoming conduits are at level 0, their successors at level 1, etc.
 */
function assignGraphLevels(
  zones: Zone[],
  outgoing: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>
): Map<string, number> {
  const levels = new Map<string, number>();
  const zoneIds = zones.map(z => z.id);

  // Find root nodes (no incoming edges from other zones in our set)
  const roots = zoneIds.filter(id => {
    const inc = incoming.get(id);
    return !inc || inc.size === 0;
  });

  // If no clear roots (cyclic graph), use zone type priority to pick roots
  if (roots.length === 0) {
    // Sort by zone type priority and pick highest priority as root
    const sortedByPriority = [...zones].sort((a, b) =>
      (ZONE_TYPE_PRIORITY[b.type] || 0) - (ZONE_TYPE_PRIORITY[a.type] || 0)
    );
    if (sortedByPriority.length > 0) {
      roots.push(sortedByPriority[0].id);
    }
  }

  // BFS to assign levels (longest path from any root)
  const queue: Array<{ id: string; level: number }> = [];

  // Start with all roots at level 0
  roots.forEach(id => {
    levels.set(id, 0);
    queue.push({ id, level: 0 });
  });

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;

    // Update level to be the maximum of current and new level
    const currentLevel = levels.get(id) ?? 0;
    if (level > currentLevel) {
      levels.set(id, level);
    }

    const successors = outgoing.get(id) || new Set();
    successors.forEach(successorId => {
      const successorCurrentLevel = levels.get(successorId) ?? -1;
      const newLevel = (levels.get(id) ?? 0) + 1;

      if (newLevel > successorCurrentLevel) {
        levels.set(successorId, newLevel);
        queue.push({ id: successorId, level: newLevel });
      }
    });
  }

  // Handle disconnected zones - assign based on zone type
  zones.forEach(zone => {
    if (!levels.has(zone.id)) {
      // Disconnected zone - use type priority as level indicator
      const typeLevel = 6 - (ZONE_TYPE_PRIORITY[zone.type] || 3);
      levels.set(zone.id, typeLevel);
    }
  });

  return levels;
}

/**
 * Sort zones at a level by barycenter (average position of connected zones)
 */
function sortByBarycenter(
  zonesAtLevel: Zone[],
  positions: Map<string, { x: number; y: number }>,
  incoming: Map<string, Set<string>>
) {
  zonesAtLevel.sort((a, b) => {
    const aConnections = incoming.get(a.id) || new Set();
    const bConnections = incoming.get(b.id) || new Set();

    let aSum = 0, aCount = 0;
    let bSum = 0, bCount = 0;

    aConnections.forEach(connId => {
      const pos = positions.get(connId);
      if (pos) { aSum += pos.x; aCount++; }
    });
    bConnections.forEach(connId => {
      const pos = positions.get(connId);
      if (pos) { bSum += pos.x; bCount++; }
    });

    const aCenter = aCount > 0 ? aSum / aCount : 400;
    const bCenter = bCount > 0 ? bSum / bCount : 400;

    return aCenter - bCenter;
  });
}

/**
 * Optimize zone layout for better conduit visibility.
 * Runs multiple barycenter passes to minimize edge crossings.
 */
function optimizeLayoutForConduits(
  zones: Zone[],
  conduits: Conduit[]
): Map<string, { x: number; y: number }> {
  if (zones.length === 0) return new Map();

  // Start with the graph-based hierarchical layout
  const positions = calculateZonePositions(zones, conduits);

  // If no conduits or single zone, no optimization needed
  if (conduits.length === 0 || zones.length <= 1) return positions;

  // Build bidirectional adjacency map for optimization
  const connections = new Map<string, Set<string>>();
  zones.forEach(z => connections.set(z.id, new Set()));
  conduits.forEach(c => {
    connections.get(c.from_zone)?.add(c.to_zone);
    connections.get(c.to_zone)?.add(c.from_zone);
  });

  // Group zones by their Y level
  const levelGroups = new Map<number, string[]>();
  positions.forEach((pos, zoneId) => {
    const level = Math.round(pos.y / VERTICAL_SPACING);
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level)!.push(zoneId);
  });

  const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);

  // Run barycenter optimization passes (forward and backward)
  for (let iter = 0; iter < 10; iter++) {
    // Forward pass (top to bottom)
    for (let i = 1; i < sortedLevels.length; i++) {
      optimizeLevelByBarycenter(sortedLevels[i], levelGroups, positions, connections);
    }

    // Backward pass (bottom to top)
    for (let i = sortedLevels.length - 2; i >= 0; i--) {
      optimizeLevelByBarycenter(sortedLevels[i], levelGroups, positions, connections);
    }
  }

  return positions;
}

/**
 * Optimize a single level using barycenter method
 */
function optimizeLevelByBarycenter(
  level: number,
  levelGroups: Map<number, string[]>,
  positions: Map<string, { x: number; y: number }>,
  connections: Map<string, Set<string>>
) {
  const nodesAtLevel = levelGroups.get(level);
  if (!nodesAtLevel || nodesAtLevel.length <= 1) return;

  // Calculate barycenter for each node
  const barycenters = new Map<string, number>();

  nodesAtLevel.forEach(nodeId => {
    const connectedNodes = connections.get(nodeId) || new Set();
    let sum = 0;
    let count = 0;

    connectedNodes.forEach(connectedId => {
      const connectedPos = positions.get(connectedId);
      if (connectedPos) {
        sum += connectedPos.x;
        count++;
      }
    });

    // Use current position as fallback for unconnected nodes
    barycenters.set(nodeId, count > 0 ? sum / count : positions.get(nodeId)!.x);
  });

  // Sort nodes by barycenter
  nodesAtLevel.sort((a, b) => (barycenters.get(a) || 0) - (barycenters.get(b) || 0));

  // Reassign x positions while maintaining spacing
  const totalWidth = (nodesAtLevel.length - 1) * HORIZONTAL_SPACING;
  const startX = 400 - totalWidth / 2;

  nodesAtLevel.forEach((nodeId, index) => {
    const pos = positions.get(nodeId)!;
    positions.set(nodeId, { x: startX + index * HORIZONTAL_SPACING, y: pos.y });
  });
}

/** Compute per-entity error/warning counts and filtered issues from validation results + policy violations */
function computeEntityIssues(
  entityId: string,
  validationResults: ValidationResult[],
  policyViolations: PolicyViolation[],
): {
  errorCount: number;
  warningCount: number;
  entityValidationResults: ValidationResult[];
  entityPolicyViolations: PolicyViolation[];
} {
  let errorCount = 0;
  let warningCount = 0;
  const entityValidationResults: ValidationResult[] = [];
  const entityPolicyViolations: PolicyViolation[] = [];

  for (const r of validationResults) {
    if (r.location?.includes(entityId)) {
      entityValidationResults.push(r);
      if (r.severity === 'error') errorCount++;
      else if (r.severity === 'warning') warningCount++;
    }
  }

  for (const v of policyViolations) {
    if (v.affected_entities.includes(entityId)) {
      entityPolicyViolations.push(v);
      if (v.severity === 'critical' || v.severity === 'high') errorCount++;
      else warningCount++;
    }
  }

  return { errorCount, warningCount, entityValidationResults, entityPolicyViolations };
}

function ZoneEditorInner({
  project,
  selectedZone,
  selectedConduit,
  onSelectZone,
  onSelectConduit,
  onConnect: onConnectProp,
  onContextMenu: onContextMenuProp,
  onExportContextReady,
  onEditZone,
  onEditConduit,
  onZonePositionsChange,
  rearrangeKey,
  validationResults = [],
  policyViolations = [],
  riskOverlayEnabled = false,
  zoneRisks,
  remoteSelections,
  onSelectionChange,
}: ZoneEditorProps) {
  const { fitView, getNodes } = useReactFlow();
  const flowRef = useRef<HTMLDivElement>(null);
  const localDragRef = useRef(false); // Track local drag to skip position reset

  // Check if all zones have stored positions
  const allZonesHavePositions = useMemo(
    () => project.zones.length > 0 && project.zones.every(z => z.x_position != null && z.y_position != null),
    [project.zones]
  );

  // Calculate positions - prefer stored positions, fall back to auto-layout
  const zonePositions = useMemo(
    () => {
      if (rearrangeKey && rearrangeKey > 0) {
        return optimizeLayoutForConduits(project.zones, project.conduits);
      }
      if (allZonesHavePositions) {
        const stored = new Map<string, { x: number; y: number }>();
        for (const z of project.zones) {
          stored.set(z.id, { x: z.x_position!, y: z.y_position! });
        }
        return stored;
      }
      return calculateZonePositions(project.zones, project.conduits);
    },
    [project.zones, project.conduits, rearrangeKey, allZonesHavePositions]
  );

  // Track zone IDs and stored positions to detect changes
  const zoneIds = useMemo(() => project.zones.map(z => z.id).sort().join(','), [project.zones]);
  const conduitIds = useMemo(() => project.conduits.map(c => c.id).sort().join(','), [project.conduits]);
  const storedPositionsKey = useMemo(
    () => project.zones.map(z => `${z.id}:${z.x_position ?? ''}:${z.y_position ?? ''}`).sort().join(','),
    [project.zones]
  );

  // Create initial nodes (only used for first render and when zones change)
  const createNodes = useCallback((): Node[] => {
    return project.zones.map((zone) => {
      const position = zonePositions.get(zone.id) || { x: 0, y: 0 };
      const { errorCount, warningCount, entityValidationResults, entityPolicyViolations } = computeEntityIssues(zone.id, validationResults, policyViolations);
      const risk = zoneRisks?.get(zone.id);
      return {
        id: zone.id,
        type: 'zone',
        position,
        data: {
          zone,
          selected: selectedZone?.id === zone.id,
          onSelect: onSelectZone,
          onEditZone,
          errorCount,
          warningCount,
          validationResults: entityValidationResults,
          policyViolations: entityPolicyViolations,
          riskScore: risk?.score,
          riskLevel: risk?.level,
          riskOverlay: riskOverlayEnabled,
          remoteUser: remoteSelections?.get(zone.id),
        } as ZoneNodeData,
        selected: selectedZone?.id === zone.id,
      };
    });
  }, [project.zones, zonePositions, selectedZone, onSelectZone, onEditZone, validationResults, policyViolations, zoneRisks, riskOverlayEnabled, remoteSelections]);

  // Create initial edges
  const createEdges = useCallback((): Edge[] => {
    // Conduit edges
    const conduitEdges: Edge[] = project.conduits.map((conduit) => {
      const { errorCount, warningCount, entityValidationResults, entityPolicyViolations } = computeEntityIssues(conduit.id, validationResults, policyViolations);
      return {
        id: conduit.id,
        type: 'conduit',
        source: conduit.from_zone,
        target: conduit.to_zone,
        data: {
          conduit,
          selected: selectedConduit?.id === conduit.id,
          onSelect: onSelectConduit,
          onEditConduit,
          errorCount,
          warningCount,
          validationResults: entityValidationResults,
          policyViolations: entityPolicyViolations,
        } as ConduitEdgeData,
        selected: selectedConduit?.id === conduit.id,
      };
    });

    // Parent-child hierarchy edges (dashed lines showing containment)
    const hierarchyEdges: Edge[] = project.zones
      .filter(zone => zone.parent_zone)
      .map(zone => ({
        id: `hierarchy-${zone.id}`,
        type: 'default',
        source: zone.parent_zone!,
        target: zone.id,
        style: {
          stroke: '#94a3b8',
          strokeWidth: 1.5,
          strokeDasharray: '5,5',
        },
        animated: false,
        label: 'contains',
        labelStyle: {
          fontSize: 10,
          fill: '#94a3b8',
        },
        labelBgStyle: {
          fill: 'white',
          fillOpacity: 0.8,
        },
      }));

    return [...hierarchyEdges, ...conduitEdges];
  }, [project.conduits, project.zones, selectedConduit, onSelectConduit, onEditConduit, validationResults, policyViolations]);

  const [nodes, setNodes, onNodesChange] = useNodesState(createNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(createEdges());

  // Track previous values to detect actual changes
  const prevZoneIds = useRef(zoneIds);
  const prevConduitIds = useRef(conduitIds);
  const prevRearrangeKey = useRef(rearrangeKey);
  const prevStoredPositionsKey = useRef(storedPositionsKey);

  // Reset node positions when zones change, rearrange triggered, or stored positions update (remote edit)
  useEffect(() => {
    const zonesChanged = prevZoneIds.current !== zoneIds;
    const rearrangeTriggered = prevRearrangeKey.current !== rearrangeKey;
    const positionsChanged = prevStoredPositionsKey.current !== storedPositionsKey;

    // Skip position reset if this change was caused by a local drag
    const isLocalDrag = localDragRef.current;
    if (isLocalDrag && positionsChanged && !zonesChanged && !rearrangeTriggered) {
      localDragRef.current = false;
      prevStoredPositionsKey.current = storedPositionsKey;
      // Still update data (selection, validation) without touching positions
    } else if (zonesChanged || rearrangeTriggered || positionsChanged) {
      const newNodes = createNodes();
      setNodes(newNodes);
      // Also refresh edges when nodes are fully replaced to keep conduits visible
      setEdges(createEdges());
      prevZoneIds.current = zoneIds;
      prevConduitIds.current = conduitIds;
      prevRearrangeKey.current = rearrangeKey;
      prevStoredPositionsKey.current = storedPositionsKey;

      // Persist calculated positions when rearranging or adding new zones
      if (onZonePositionsChange && (rearrangeTriggered || zonesChanged)) {
        const positions = new Map<string, { x: number; y: number }>();
        for (const node of newNodes) {
          positions.set(node.id, { x: node.position.x, y: node.position.y });
        }
        onZonePositionsChange(positions);
      }
    } else {
      // Only update data (selection state, zone data, validation counts, risk, remote) without changing positions
      setNodes(currentNodes =>
        currentNodes.map(node => {
          const zone = project.zones.find(z => z.id === node.id);
          if (!zone) return node;
          const { errorCount, warningCount, entityValidationResults, entityPolicyViolations } = computeEntityIssues(zone.id, validationResults, policyViolations);
          const risk = zoneRisks?.get(zone.id);
          return {
            ...node,
            data: {
              zone,
              selected: selectedZone?.id === zone.id,
              onSelect: onSelectZone,
              errorCount,
              warningCount,
              validationResults: entityValidationResults,
              policyViolations: entityPolicyViolations,
              riskScore: risk?.score,
              riskLevel: risk?.level,
              riskOverlay: riskOverlayEnabled,
              remoteUser: remoteSelections?.get(zone.id),
            },
            selected: selectedZone?.id === zone.id,
          };
        })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onZonePositionsChange is a parent callback whose identity changes on every render; adding it would cause infinite node resets
  }, [zoneIds, conduitIds, rearrangeKey, storedPositionsKey, createNodes, createEdges, setNodes, setEdges, project.zones, selectedZone, onSelectZone, onEditZone, validationResults, policyViolations, zoneRisks, riskOverlayEnabled, remoteSelections]);

  // Update edges when conduits change or selection changes
  useEffect(() => {
    const conduitsChanged = prevConduitIds.current !== conduitIds;

    if (conduitsChanged) {
      setEdges(createEdges());
      prevConduitIds.current = conduitIds;
    } else {
      // Only update selection state and validation counts
      setEdges(currentEdges =>
        currentEdges.map(edge => {
          const conduit = project.conduits.find(c => c.id === edge.id);
          if (!conduit) return edge;
          const { errorCount, warningCount, entityValidationResults, entityPolicyViolations } = computeEntityIssues(conduit.id, validationResults, policyViolations);
          return {
            ...edge,
            data: {
              conduit,
              selected: selectedConduit?.id === conduit.id,
              onSelect: onSelectConduit,
              errorCount,
              warningCount,
              validationResults: entityValidationResults,
              policyViolations: entityPolicyViolations,
            },
            selected: selectedConduit?.id === conduit.id,
          };
        })
      );
    }
  }, [conduitIds, createEdges, setEdges, project.conduits, selectedConduit, onSelectConduit, onEditConduit, validationResults, policyViolations]);

  // Fit view when zones change significantly
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 200 });
    }, 100);
    return () => clearTimeout(timer);
  }, [project.zones.length, fitView]);

  // Notify parent when export context (viewport) is ready
  useEffect(() => {
    if (onExportContextReady && flowRef.current) {
      const viewport = flowRef.current.querySelector('.react-flow__viewport') as HTMLElement;
      onExportContextReady({
        viewport,
        getNodesBounds: () => {
          const nodes = getNodes();
          if (nodes.length === 0) {
            return { x: 0, y: 0, width: 800, height: 600 };
          }
          const bounds = getNodesBounds(nodes);
          return bounds;
        },
      });
    }
  }, [onExportContextReady, getNodes]);

  // Handle node click
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const zone = project.zones.find((z) => z.id === node.id);
      if (zone) {
        onSelectZone(zone);
        onSelectConduit(undefined);
      }
    },
    [project.zones, onSelectZone, onSelectConduit]
  );

  // Handle edge click
  const onEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      const conduit = project.conduits.find((c) => c.id === edge.id);
      if (conduit) {
        onSelectConduit(conduit);
        onSelectZone(undefined);
      }
    },
    [project.conduits, onSelectConduit, onSelectZone]
  );

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    onSelectZone(undefined);
    onSelectConduit(undefined);
  }, [onSelectZone, onSelectConduit]);

  // Handle node drag stop - persist positions
  const onNodeDragStop = useCallback(
    () => {
      if (!onZonePositionsChange) return;
      localDragRef.current = true; // Mark as local drag so effect skips position reset
      const currentNodes = getNodes();
      const positions = new Map<string, { x: number; y: number }>();
      for (const node of currentNodes) {
        positions.set(node.id, { x: node.position.x, y: node.position.y });
      }
      onZonePositionsChange(positions);
    },
    [getNodes, onZonePositionsChange]
  );

  // Handle connection between zones (drag to connect)
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target && onConnectProp) {
        // Check if connection already exists
        const exists = project.conduits.some(
          c => (c.from_zone === connection.source && c.to_zone === connection.target) ||
               (c.from_zone === connection.target && c.to_zone === connection.source)
        );
        if (exists) {
          alert('A conduit already exists between these zones');
          return;
        }
        onConnectProp(connection.source, connection.target);
      }
    },
    [onConnectProp, project.conduits]
  );

  // Handle right-click on node (zone)
  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      if (!onContextMenuProp) return;

      const zone = project.zones.find((z) => z.id === node.id);
      if (zone) {
        onContextMenuProp({
          x: event.clientX,
          y: event.clientY,
          type: 'zone',
          zone,
        });
      }
    },
    [project.zones, onContextMenuProp]
  );

  // Handle right-click on edge (conduit)
  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      if (!onContextMenuProp) return;

      const conduit = project.conduits.find((c) => c.id === edge.id);
      if (conduit) {
        onContextMenuProp({
          x: event.clientX,
          y: event.clientY,
          type: 'conduit',
          conduit,
        });
      }
    },
    [project.conduits, onContextMenuProp]
  );

  // Handle right-click on pane (empty space)
  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      if (!onContextMenuProp) return;

      onContextMenuProp({
        x: event.clientX,
        y: event.clientY,
        type: 'pane',
      });
    },
    [onContextMenuProp]
  );

  // MiniMap node color
  const miniMapNodeColor = useCallback((node: Node) => {
    const zone = project.zones.find((z) => z.id === node.id);
    if (zone) {
      return ZONE_TYPE_CONFIG[zone.type].color;
    }
    return '#ccc';
  }, [project.zones]);

  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <div ref={flowRef} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Strict}
        connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5,5' }}
        selectionOnDrag={false}
        onSelectionChange={(params) => {
          if (onSelectionChange) {
            onSelectionChange(params.nodes.map(n => n.id));
          }
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
      >
      <Background color="#e5e7eb" gap={20} />
      <Controls />
      {/* MiniMap — hidden on mobile */}
      <div className="hidden md:block">
        <MiniMap
          nodeColor={miniMapNodeColor}
          nodeStrokeWidth={3}
          zoomable
          pannable
        />
      </div>

      {/* Legend — always visible on md+, toggle button on mobile */}
      <div className="absolute top-4 left-4">
        {/* Mobile toggle button */}
        <button
          onClick={() => setLegendOpen(!legendOpen)}
          className="md:hidden bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          aria-label="Toggle legend"
          title="Toggle legend"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>

        {/* Legend content */}
        <div className={`${legendOpen ? 'block' : 'hidden'} md:block bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 text-xs dark:text-gray-200 mt-2 md:mt-0`}>
          <div className="flex items-center justify-between mb-2 md:block">
            <div className="font-semibold">Zone Types</div>
            <button
              onClick={() => setLegendOpen(false)}
              className="md:hidden text-gray-400 hover:text-gray-600"
              aria-label="Close legend"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-1">
            {Object.entries(ZONE_TYPE_CONFIG).map(([type, config]) => (
              <div key={type} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: config.color }}
                />
                <span>{config.label}</span>
              </div>
            ))}
          </div>
          <div className="font-semibold mt-3 mb-2">Security Levels</div>
          <div className="space-y-1">
            {Object.entries(SECURITY_LEVEL_CONFIG).map(([level, config]) => (
              <div key={level} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: config.bgColor }}
                />
                <span>{config.label}</span>
              </div>
            ))}
          </div>
          <div className="font-semibold mt-3 mb-2">Connections</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 border-t-2 border-blue-500" />
              <span>Conduit</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 border-t-2 border-dashed border-gray-400" />
              <span>Parent-Child</span>
            </div>
          </div>
          {onConnectProp && (
            <>
              <div className="font-semibold mt-3 mb-2">Tip</div>
              <div className="text-gray-600 dark:text-gray-400">
                Drag from bottom handle to top handle to create a conduit
              </div>
            </>
          )}
        </div>
      </div>
      </ReactFlow>
    </div>
  );
}

export default function ZoneEditor(props: ZoneEditorProps) {
  return (
    <div className="h-full w-full">
      <ZoneEditorInner {...props} />
    </div>
  );
}
