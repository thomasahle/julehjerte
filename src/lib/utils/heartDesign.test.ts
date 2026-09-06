import { describe, it, expect } from 'vitest';
import type { Finger, HeartDesign, LobeId, Vec } from '$lib/types/heart';
import { MAX_GRID_SIZE } from '$lib/constants';
import { getCenteredRectParams } from '$lib/utils/overlapRect';
import {
  normalizeHeartDesign,
  parseHeartFromSVG,
  serializeHeartDesign,
  serializeHeartToSVG
} from './heartDesign';

// Build an n x n design the way the editor holds it: n + 1 boundary curves per lobe,
// including the two outer edges, evenly spaced across the overlap square.
function makeGridDesign(n: number): HeartDesign {
  const rect = getCenteredRectParams({ x: n, y: n });
  const fingers: Finger[] = [];
  for (let i = 0; i <= n; i++) {
    const y = rect.top + (i / n) * rect.height;
    const p0: Vec = { x: rect.right, y };
    const p3: Vec = { x: rect.left, y };
    const p1: Vec = { x: p0.x - rect.width / 3, y };
    const p2: Vec = { x: p3.x + rect.width / 3, y };
    fingers.push({ id: `L-${i}`, lobe: 'left', segments: [{ p0, p1, p2, p3 }] });
  }
  for (let i = 0; i <= n; i++) {
    const x = rect.left + (i / n) * rect.width;
    const p0: Vec = { x, y: rect.bottom };
    const p3: Vec = { x, y: rect.top };
    const p1: Vec = { x, y: p0.y - rect.height / 3 };
    const p2: Vec = { x, y: p3.y + rect.height / 3 };
    fingers.push({ id: `R-${i}`, lobe: 'right', segments: [{ p0, p1, p2, p3 }] });
  }
  return { id: 'grid-test', name: 'Grid test', author: '', weaveParity: 0, gridSize: { x: n, y: n }, fingers };
}

function lobeFingers(fingers: Finger[], lobe: LobeId): Finger[] {
  return fingers.filter((f) => f.lobe === lobe);
}

// Position of a boundary across its lobe (y for left-lobe curves, x for right-lobe curves), sorted.
function boundaryPositions(fingers: Finger[], lobe: LobeId): number[] {
  return lobeFingers(fingers, lobe)
    .map((f) => (lobe === 'left' ? f.segments[0]!.p0.y : f.segments[0]!.p0.x))
    .sort((a, b) => a - b);
}

function expectClose(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 6));
}

describe('heartDesign round trips', () => {
  it('keeps a 10x10 design (10 strips, 11 boundary curves per lobe) through JSON serialize/parse', () => {
    const design = makeGridDesign(10);
    expect(lobeFingers(design.fingers, 'left')).toHaveLength(11);
    expect(lobeFingers(design.fingers, 'right')).toHaveLength(11);

    const json = serializeHeartDesign(design);
    expect(json.gridSize).toEqual({ x: 10, y: 10 });
    // The two outer edges of each lobe are editor scaffolding and are not stored.
    expect(json.fingers.filter((f) => f.lobe === 'left')).toHaveLength(9);
    expect(json.fingers.filter((f) => f.lobe === 'right')).toHaveLength(9);

    const parsed = normalizeHeartDesign(JSON.parse(JSON.stringify(json)) as unknown);
    expect(parsed).not.toBeNull();
    expect(parsed!.gridSize).toEqual({ x: 10, y: 10 });
    expect(lobeFingers(parsed!.fingers, 'left')).toHaveLength(11);
    expect(lobeFingers(parsed!.fingers, 'right')).toHaveLength(11);
    expectClose(boundaryPositions(parsed!.fingers, 'left'), boundaryPositions(design.fingers, 'left'));
    expectClose(boundaryPositions(parsed!.fingers, 'right'), boundaryPositions(design.fingers, 'right'));
  });

  it('keeps a 10x10 design through SVG export/import', () => {
    const design = makeGridDesign(10);
    const parsed = parseHeartFromSVG(serializeHeartToSVG(design), 'grid-test.svg');
    expect(parsed).not.toBeNull();
    expect(parsed!.gridSize).toEqual({ x: 10, y: 10 });
    expect(lobeFingers(parsed!.fingers, 'left')).toHaveLength(11);
    expect(lobeFingers(parsed!.fingers, 'right')).toHaveLength(11);
    expectClose(boundaryPositions(parsed!.fingers, 'left'), boundaryPositions(design.fingers, 'left'));
    expectClose(boundaryPositions(parsed!.fingers, 'right'), boundaryPositions(design.fingers, 'right'));
  });

  it('keeps a MAX_GRID_SIZE design and clamps anything larger', () => {
    const atMax = normalizeHeartDesign(serializeHeartDesign(makeGridDesign(MAX_GRID_SIZE)));
    expect(atMax!.gridSize).toEqual({ x: MAX_GRID_SIZE, y: MAX_GRID_SIZE });
    expect(lobeFingers(atMax!.fingers, 'left')).toHaveLength(MAX_GRID_SIZE + 1);

    const tooBig = normalizeHeartDesign(serializeHeartDesign(makeGridDesign(MAX_GRID_SIZE + 2)));
    expect(tooBig!.gridSize).toEqual({ x: MAX_GRID_SIZE, y: MAX_GRID_SIZE });
  });
});
