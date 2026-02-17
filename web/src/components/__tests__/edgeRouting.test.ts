import { describe, it, expect } from 'vitest';
import {
  findObstructingNodes,
  computeSmartPath,
  buildSmoothPath,
  getPathMidpoint,
  NodeRect,
} from '../edgeRouting';

describe('findObstructingNodes', () => {
  const makeNode = (id: string, x: number, y: number, width = 200, height = 100): NodeRect => ({
    id, x, y, width, height,
  });

  it('excludes source and target nodes', () => {
    const nodes = [
      makeNode('src', 100, 0),
      makeNode('tgt', 100, 400),
      makeNode('mid', 100, 200),
    ];
    const result = findObstructingNodes(200, 50, 200, 450, 'src', 'tgt', nodes);
    expect(result.map(n => n.id)).toEqual(['mid']);
  });

  it('returns empty array when path is clear', () => {
    const nodes = [
      makeNode('src', 100, 0),
      makeNode('tgt', 100, 400),
      makeNode('far', 800, 200), // far to the right
    ];
    const result = findObstructingNodes(200, 50, 200, 450, 'src', 'tgt', nodes);
    expect(result).toEqual([]);
  });

  it('finds nodes in the corridor between source and target', () => {
    const nodes = [
      makeNode('src', 0, 0),
      makeNode('tgt', 0, 600),
      makeNode('mid1', 50, 200),
      makeNode('mid2', 50, 400),
    ];
    const result = findObstructingNodes(100, 50, 100, 650, 'src', 'tgt', nodes);
    expect(result.map(n => n.id)).toEqual(['mid1', 'mid2']);
  });

  it('sorts by Y ascending when going down', () => {
    const nodes = [
      makeNode('mid2', 50, 400),
      makeNode('mid1', 50, 200),
    ];
    // Source above target (going down)
    const result = findObstructingNodes(100, 50, 100, 650, 'x', 'y', nodes);
    expect(result.map(n => n.id)).toEqual(['mid1', 'mid2']);
  });

  it('sorts by Y descending when going up', () => {
    const nodes = [
      makeNode('mid1', 50, 200),
      makeNode('mid2', 50, 400),
    ];
    // Source below target (going up)
    const result = findObstructingNodes(100, 650, 100, 50, 'x', 'y', nodes);
    expect(result.map(n => n.id)).toEqual(['mid2', 'mid1']);
  });

  it('ignores nodes outside horizontal band', () => {
    const nodes = [
      makeNode('offscreen', 500, 200, 50, 50),
    ];
    // Edge from x=100 to x=100, padding=40 → band is [60, 140]
    const result = findObstructingNodes(100, 0, 100, 400, 'x', 'y', nodes);
    expect(result).toEqual([]);
  });
});

describe('computeSmartPath', () => {
  const makeNode = (id: string, x: number, y: number, width = 200, height = 100): NodeRect => ({
    id, x, y, width, height,
  });

  it('returns null when there are no obstructions', () => {
    const result = computeSmartPath(100, 0, 100, 400, []);
    expect(result).toBeNull();
  });

  it('returns a valid SVG path for a single obstruction', () => {
    const obstruction = makeNode('mid', 50, 180);
    const result = computeSmartPath(150, 50, 150, 400, [obstruction]);
    expect(result).not.toBeNull();
    expect(result!.path).toMatch(/^M /);
    expect(result!.path).toContain('L');
  });

  it('returns label coordinates', () => {
    const obstruction = makeNode('mid', 50, 180);
    const result = computeSmartPath(150, 50, 150, 400, [obstruction]);
    expect(result).not.toBeNull();
    expect(typeof result!.labelX).toBe('number');
    expect(typeof result!.labelY).toBe('number');
    expect(Number.isFinite(result!.labelX)).toBe(true);
    expect(Number.isFinite(result!.labelY)).toBe(true);
  });

  it('handles multiple obstructions', () => {
    const obstructions = [
      makeNode('mid1', 50, 150),
      makeNode('mid2', 50, 350),
    ];
    const result = computeSmartPath(150, 50, 150, 600, obstructions);
    expect(result).not.toBeNull();
    expect(result!.path).toMatch(/^M /);
  });

  it('routes consistently to one side for multiple obstructions', () => {
    // Both obstructions centered right of edge midline → should route left
    const obstructions = [
      makeNode('mid1', 120, 150, 200, 100),
      makeNode('mid2', 120, 350, 200, 100),
    ];
    const result = computeSmartPath(100, 50, 100, 600, obstructions);
    expect(result).not.toBeNull();
    // Path should contain detour X coordinates that are all to the left
    // (less than the node x positions)
    expect(result!.path).toBeTruthy();
  });
});

describe('buildSmoothPath', () => {
  it('returns empty string for less than 2 points', () => {
    expect(buildSmoothPath([])).toBe('');
    expect(buildSmoothPath([{ x: 0, y: 0 }])).toBe('');
  });

  it('returns a straight line for 2 points', () => {
    const path = buildSmoothPath([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(path).toBe('M 0 0 L 100 0');
  });

  it('produces M start, L and A commands for corners', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ];
    const path = buildSmoothPath(points);
    expect(path).toMatch(/^M 0 0/);
    expect(path).toContain('A');
    expect(path).toMatch(/L 100 100$/);
  });

  it('clamps border radius to half shortest segment', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 10 }, // short segment (length 10)
      { x: 100, y: 10 },
    ];
    // borderRadius=8, but segment is 10, so clamped to min(8, 5, 50) = 5
    const path = buildSmoothPath(points, 8);
    expect(path).toContain('A 5 5');
  });

  it('produces valid SVG path with multiple corners', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 50, y: 100 },
      { x: 50, y: 200 },
      { x: 100, y: 200 },
    ];
    const path = buildSmoothPath(points);
    expect(path).toMatch(/^M /);
    // Should have 3 arc commands (one per interior corner)
    const arcCount = (path.match(/A /g) || []).length;
    expect(arcCount).toBe(3);
  });
});

describe('getPathMidpoint', () => {
  it('returns origin for empty points', () => {
    expect(getPathMidpoint([])).toEqual({ x: 0, y: 0 });
  });

  it('returns the point for single point', () => {
    expect(getPathMidpoint([{ x: 5, y: 10 }])).toEqual({ x: 5, y: 10 });
  });

  it('returns midpoint of a 2-point segment', () => {
    const mid = getPathMidpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(0);
  });

  it('returns correct midpoint for multi-segment path', () => {
    // L-shaped path: 100 units right, then 100 units down. Total = 200, midpoint at 100 along path.
    const mid = getPathMidpoint([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    // Midpoint should be at the corner (100 along the 200 total)
    expect(mid.x).toBeCloseTo(100);
    expect(mid.y).toBeCloseTo(0);
  });

  it('interpolates correctly within a segment', () => {
    // Path: 200 right, then 100 down. Total = 300, midpoint at 150.
    const mid = getPathMidpoint([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
    ]);
    // 150 along path: first 200 units covers first segment, so midpoint is at x=150, y=0
    expect(mid.x).toBeCloseTo(150);
    expect(mid.y).toBeCloseTo(0);
  });
});
