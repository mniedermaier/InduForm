export interface NodeRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SmartPathResult {
  path: string;
  labelX: number;
  labelY: number;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Find nodes whose bounding box lies in the corridor between source and target,
 * excluding the source and target nodes themselves.
 */
export function findObstructingNodes(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourceId: string,
  targetId: string,
  allNodes: NodeRect[],
  padding = 40,
): NodeRect[] {
  const minY = Math.min(sourceY, targetY);
  const maxY = Math.max(sourceY, targetY);
  const minX = Math.min(sourceX, targetX) - padding;
  const maxX = Math.max(sourceX, targetX) + padding;

  const goingDown = targetY >= sourceY;

  const obstructing = allNodes.filter((node) => {
    if (node.id === sourceId || node.id === targetId) return false;

    const nodeLeft = node.x;
    const nodeRight = node.x + node.width;
    const nodeTop = node.y;
    const nodeBottom = node.y + node.height;

    // Node must overlap the vertical corridor (between source and target Y)
    const verticalOverlap = nodeBottom > minY && nodeTop < maxY;
    // Node must overlap the horizontal band
    const horizontalOverlap = nodeRight > minX && nodeLeft < maxX;

    return verticalOverlap && horizontalOverlap;
  });

  // Sort by Y in encounter order
  obstructing.sort((a, b) =>
    goingDown ? a.y - b.y : b.y - a.y,
  );

  return obstructing;
}

/**
 * Compute a smart orthogonal path that routes around obstructing nodes.
 * Returns null if there are no obstructions (caller should use bezier fallback).
 */
export function computeSmartPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  obstructingNodes: NodeRect[],
  gap = 20,
): SmartPathResult | null {
  if (obstructingNodes.length === 0) return null;

  const edgeMidX = (sourceX + targetX) / 2;

  // Decide which side to route: pick the side that requires less horizontal offset.
  // Use majority vote across all obstructions to avoid zig-zag.
  let leftVotes = 0;
  let rightVotes = 0;

  for (const node of obstructingNodes) {
    const nodeCenterX = node.x + node.width / 2;
    const distToGoLeft = edgeMidX - (node.x - gap);
    const distToGoRight = (node.x + node.width + gap) - edgeMidX;

    if (nodeCenterX > edgeMidX) {
      // Node is to the right of edge midline, prefer going left
      leftVotes++;
    } else if (nodeCenterX < edgeMidX) {
      rightVotes++;
    } else {
      // Node centered on midline — pick side with shorter detour
      if (distToGoLeft <= distToGoRight) leftVotes++;
      else rightVotes++;
    }
  }

  const routeLeft = leftVotes >= rightVotes;

  // Build waypoints: source → detour around each obstruction → target
  const waypoints: Point[] = [{ x: sourceX, y: sourceY }];
  const goingDown = targetY >= sourceY;

  for (const node of obstructingNodes) {
    const detourX = routeLeft
      ? node.x - gap
      : node.x + node.width + gap;

    const entryY = goingDown
      ? node.y - gap
      : node.y + node.height + gap;
    const exitY = goingDown
      ? node.y + node.height + gap
      : node.y - gap;

    // Move horizontally to detour position, then vertically past node
    waypoints.push({ x: detourX, y: entryY });
    waypoints.push({ x: detourX, y: exitY });
  }

  waypoints.push({ x: targetX, y: targetY });

  // Convert to orthogonal segments: ensure we only move along one axis at a time
  const orthoPoints = toOrthogonal(waypoints);

  const path = buildSmoothPath(orthoPoints);
  const mid = getPathMidpoint(orthoPoints);

  return { path, labelX: mid.x, labelY: mid.y };
}

/**
 * Convert a list of waypoints into an orthogonal path (only horizontal or vertical segments).
 * Between each pair of waypoints that differ in both X and Y, insert a corner point.
 */
function toOrthogonal(points: Point[]): Point[] {
  if (points.length < 2) return points;

  const result: Point[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];

    if (prev.x !== curr.x && prev.y !== curr.y) {
      // Insert corner: go vertical first, then horizontal
      result.push({ x: prev.x, y: curr.y });
    }

    result.push(curr);
  }

  return result;
}

/**
 * Build an SVG path from orthogonal points with rounded corners at each turn.
 */
export function buildSmoothPath(points: Point[], borderRadius = 8): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    // Vectors from corner to adjacent points
    const dx1 = prev.x - curr.x;
    const dy1 = prev.y - curr.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    if (len1 === 0 || len2 === 0) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    // Clamp radius to half of the shortest adjacent segment
    const r = Math.min(borderRadius, len1 / 2, len2 / 2);

    // Points where the arc begins and ends
    const startX = curr.x + (dx1 / len1) * r;
    const startY = curr.y + (dy1 / len1) * r;
    const endX = curr.x + (dx2 / len2) * r;
    const endY = curr.y + (dy2 / len2) * r;

    // Sweep flag: determined by cross product (clockwise vs counter-clockwise)
    const cross = dx1 * dy2 - dy1 * dx2;
    const sweep = cross > 0 ? 1 : 0;

    d += ` L ${startX} ${startY}`;
    d += ` A ${r} ${r} 0 0 ${sweep} ${endX} ${endY}`;
  }

  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;

  return d;
}

/**
 * Find the midpoint along a polyline defined by the given points.
 */
export function getPathMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0] };

  // Compute total length
  let totalLength = 0;
  const segmentLengths: number[] = [];

  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segmentLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) return { ...points[0] };

  const halfLength = totalLength / 2;
  let accumulated = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    const segLen = segmentLengths[i];
    if (accumulated + segLen >= halfLength) {
      const remaining = halfLength - accumulated;
      const t = remaining / segLen;
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    accumulated += segLen;
  }

  return { ...points[points.length - 1] };
}
