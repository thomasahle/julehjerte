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

  it("keeps a heart's own colours through JSON and through SVG", () => {
    const design: HeartDesign = { ...makeGridDesign(3), colors: { left: '#0b3d2c', right: '#f5c518' } };

    const json = serializeHeartDesign(design);
    expect(json.colors).toEqual({ left: '#0b3d2c', right: '#f5c518' });
    expect(normalizeHeartDesign(JSON.parse(JSON.stringify(json)) as unknown)!.colors).toEqual(
      design.colors
    );

    const svg = serializeHeartToSVG(design);
    expect(svg).toContain('data-color-left="#0b3d2c"');
    expect(parseHeartFromSVG(svg, 'grid-test.svg')!.colors).toEqual(design.colors);
  });

  it('leaves a heart without colours on the site-wide pair', () => {
    const design = makeGridDesign(3);
    expect(serializeHeartDesign(design).colors).toBeUndefined();
    expect(normalizeHeartDesign(serializeHeartDesign(design))!.colors).toBeUndefined();

    const svg = serializeHeartToSVG(design);
    expect(svg).not.toContain('data-color-left');
    expect(parseHeartFromSVG(svg, 'grid-test.svg')!.colors).toBeUndefined();
  });

  it('drops colours a hand-edited link cannot have produced', () => {
    const json = serializeHeartDesign(makeGridDesign(3));
    for (const bad of [
      'red',
      { left: '#fff' },
      { left: 'url(#x)', right: '#000000' },
      { left: '#ffffff', right: '" onload="alert(1)' }
    ]) {
      expect(normalizeHeartDesign({ ...json, colors: bad })!.colors, JSON.stringify(bad)).toBeUndefined();
    }

    // The same for an imported SVG whose attributes were edited by hand.
    const svg = serializeHeartToSVG(makeGridDesign(3)).replace(
      '<svg ',
      '<svg data-color-left="red" data-color-right="#000000" '
    );
    expect(parseHeartFromSVG(svg, 'grid-test.svg')!.colors).toBeUndefined();
  });

  it('keeps a MAX_GRID_SIZE design and clamps anything larger', () => {
    const atMax = normalizeHeartDesign(serializeHeartDesign(makeGridDesign(MAX_GRID_SIZE)));
    expect(atMax!.gridSize).toEqual({ x: MAX_GRID_SIZE, y: MAX_GRID_SIZE });
    expect(lobeFingers(atMax!.fingers, 'left')).toHaveLength(MAX_GRID_SIZE + 1);

    const tooBig = normalizeHeartDesign(serializeHeartDesign(makeGridDesign(MAX_GRID_SIZE + 2)));
    expect(tooBig!.gridSize).toEqual({ x: MAX_GRID_SIZE, y: MAX_GRID_SIZE });
  });
});
