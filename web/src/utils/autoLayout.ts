import dagre from '@dagrejs/dagre';
import type { Zone, Conduit, ZoneType } from '../types/models';
import { ZONE_TYPE_CONFIG } from '../types/models';

const NODE_WIDTH = 250;
const NODE_HEIGHT = 150;
const HORIZONTAL_SPACING = 200;
const VERTICAL_SPACING = 150;

/**
 * Map zone type level (from ZONE_TYPE_CONFIG) to a dagre rank.
 * Enterprise (level 6) is at the top (rank 0), safety/cell at the bottom.
 * Safety (level 1) and cell (level 2) share the same rank (rank 4).
 */
function zoneTypeToRank(type: ZoneType): number {
  const level = ZONE_TYPE_CONFIG[type]?.level ?? 3;
  switch (level) {
    case 6: return 0; // enterprise
    case 5: return 1; // dmz
    case 4: return 2; // site
    case 3: return 3; // area
    case 2: return 4; // cell
    case 1: return 4; // safety (same level as cell)
    default: return 3;
  }
}

/**
 * Auto-layout zones using dagre graph layout following the Purdue model hierarchy.
 *
 * Enterprise zones appear at the top, DMZ in the middle, and cell/safety
 * zones at the bottom. Conduits define the edges in the directed graph.
 * The zone type's level property from ZONE_TYPE_CONFIG determines rank
 * assignment so the visual layout matches the IEC 62443 Purdue model.
 *
 * @param zones - Current zones in the project
 * @param conduits - Current conduits connecting zones
 * @returns New zone array with updated x_position and y_position
 */
export function autoLayoutZones(zones: Zone[], conduits: Conduit[]): Zone[] {
  if (zones.length === 0) return zones;

  // If only one zone, just center it
  if (zones.length === 1) {
    return zones.map(z => ({
      ...z,
      x_position: 400,
      y_position: 50,
    }));
  }

  const g = new dagre.graphlib.Graph();

  g.setGraph({
    rankdir: 'TB',
    nodesep: HORIZONTAL_SPACING,
    ranksep: VERTICAL_SPACING,
    marginx: 50,
    marginy: 50,
  });

  // Required for dagre
  g.setDefaultEdgeLabel(() => ({}));

  // Build a set of zone IDs for quick lookup
  const zoneIdSet = new Set(zones.map(z => z.id));

  // Add nodes with their zone type rank
  for (const zone of zones) {
    g.setNode(zone.id, {
      label: zone.name,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      // Use rank to enforce Purdue hierarchy ordering
      rank: zoneTypeToRank(zone.type),
    });
  }

  // Add edges from conduits
  for (const conduit of conduits) {
    if (zoneIdSet.has(conduit.from_zone) && zoneIdSet.has(conduit.to_zone)) {
      // Orient edges top-to-bottom: from higher-level (lower rank number) to lower-level
      const fromRank = zoneTypeToRank(
        zones.find(z => z.id === conduit.from_zone)?.type ?? 'area'
      );
      const toRank = zoneTypeToRank(
        zones.find(z => z.id === conduit.to_zone)?.type ?? 'area'
      );

      if (fromRank <= toRank) {
        g.setEdge(conduit.from_zone, conduit.to_zone);
      } else {
        g.setEdge(conduit.to_zone, conduit.from_zone);
      }
    }
  }

  // Add invisible edges between zones to enforce Purdue hierarchy rank ordering.
  // Group zones by rank and create inter-rank constraints.
  const zonesByRank = new Map<number, Zone[]>();
  for (const zone of zones) {
    const rank = zoneTypeToRank(zone.type);
    if (!zonesByRank.has(rank)) {
      zonesByRank.set(rank, []);
    }
    zonesByRank.get(rank)!.push(zone);
  }

  const sortedRanks = Array.from(zonesByRank.keys()).sort((a, b) => a - b);

  // Create invisible edges between rank groups to enforce ordering
  for (let i = 0; i < sortedRanks.length - 1; i++) {
    const currentRankZones = zonesByRank.get(sortedRanks[i])!;
    const nextRankZones = zonesByRank.get(sortedRanks[i + 1])!;

    // Connect first zone of each rank level to enforce rank ordering
    // Only if there isn't already an edge between these ranks
    const hasExistingEdge = currentRankZones.some(cz =>
      nextRankZones.some(nz =>
        g.hasEdge(cz.id, nz.id) || g.hasEdge(nz.id, cz.id)
      )
    );

    if (!hasExistingEdge) {
      g.setEdge(currentRankZones[0].id, nextRankZones[0].id, {
        minlen: 1,
        weight: 0, // Low weight so it doesn't distort the layout
      });
    }
  }

  // For safety zones at the same rank as cell zones, add a slight horizontal
  // offset after layout by nudging safety zones to the right
  dagre.layout(g);

  // Extract positions from the dagre layout
  // Dagre returns center coordinates; React Flow uses top-left positioning,
  // so we adjust by subtracting half the node dimensions.
  const safetyZoneIds = new Set(
    zones.filter(z => z.type === 'safety').map(z => z.id)
  );
  const cellZoneIds = new Set(
    zones.filter(z => z.type === 'cell').map(z => z.id)
  );

  // Check if safety and cell zones coexist at the same rank level
  const hasBothCellAndSafety = safetyZoneIds.size > 0 && cellZoneIds.size > 0;

  return zones.map(zone => {
    const nodeData = g.node(zone.id);
    if (!nodeData) return zone;

    let x = nodeData.x - NODE_WIDTH / 2;
    const y = nodeData.y - NODE_HEIGHT / 2;

    // If both cell and safety zones exist, offset safety zones slightly to
    // the right so they visually separate at the same hierarchical level
    if (hasBothCellAndSafety && safetyZoneIds.has(zone.id)) {
      x += HORIZONTAL_SPACING / 2;
    }

    return {
      ...zone,
      x_position: Math.round(x),
      y_position: Math.round(y),
    };
  });
}
