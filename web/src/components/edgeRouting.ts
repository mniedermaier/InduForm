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
 *
 * Uses a merged bounding box of all obstructions to create a single clean detour,
 * avoiding issues with overlapping/adjacent obstructions.
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

  // Compute merged bounding box of all obstructions
  let bboxLeft = Infinity;
  let bboxRight = -Infinity;
  let bboxTop = Infinity;
  let bboxBottom = -Infinity;

  for (const node of obstructingNodes) {
    bboxLeft = Math.min(bboxLeft, node.x);
    bboxRight = Math.max(bboxRight, node.x + node.width);
    bboxTop = Math.min(bboxTop, node.y);
    bboxBottom = Math.max(bboxBottom, node.y + node.height);
  }

  const edgeMidX = (sourceX + targetX) / 2;
  const bboxCenterX = (bboxLeft + bboxRight) / 2;

  // Route left or right of the merged bounding box
  const routeLeft = bboxCenterX >= edgeMidX;
  const detourX = routeLeft
    ? bboxLeft - gap
    : bboxRight + gap;

  const goingDown = targetY >= sourceY;
  const entryY = goingDown
    ? bboxTop - gap
    : bboxBottom + gap;
  const exitY = goingDown
    ? bboxBottom + gap
    : bboxTop - gap;

  // Build waypoints: source → detour around merged bbox → target
  const waypoints: Point[] = [
    { x: sourceX, y: sourceY },
    { x: detourX, y: entryY },
    { x: detourX, y: exitY },
    { x: targetX, y: targetY },
  ];

  // Convert to orthogonal segments and clean up
  const orthoPoints = cleanPath(toOrthogonal(waypoints));

  if (orthoPoints.length < 2) return null;

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
 * Remove consecutive duplicate points and collinear points from a path.
 */
function cleanPath(points: Point[]): Point[] {
  if (points.length < 2) return points;

  // Remove consecutive duplicates
  const deduped: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (prev.x !== points[i].x || prev.y !== points[i].y) {
      deduped.push(points[i]);
    }
  }

  if (deduped.length < 3) return deduped;

  // Remove collinear points (points that don't change direction)
  const result: Point[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = deduped[i];
    const next = deduped[i + 1];

    const sameX = prev.x === curr.x && curr.x === next.x;
    const sameY = prev.y === curr.y && curr.y === next.y;

    if (!sameX && !sameY) {
      result.push(curr);
    }
  }
  result.push(deduped[deduped.length - 1]);

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

    // Skip arc for collinear points (cross product ~0)
    const cross = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(cross) < 0.01) {
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
