import { describe, it, expect } from 'vitest';
import type { Finger, HeartDesign, LobeId, Vec } from '$lib/types/heart';
import { MAX_GRID_SIZE } from '$lib/constants';
import { getCenteredRectParams } from '$lib/utils/overlapRect';
import { heartName } from '$lib/utils/heartName';
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

  it('keeps the names per language through SVG export/import and through JSON', () => {
    const names = { da: 'Flet <1> & "kopi"', en: 'Weave <1> & "copy"' };
    const design: HeartDesign = { ...makeGridDesign(3), name: 'Weave 1', names };

    const svg = serializeHeartToSVG(design);
    expect(svg).toContain('<title>Weave 1</title>');
    expect(svg).toContain('<title xml:lang="da">Flet &lt;1&gt; &amp; &quot;kopi&quot;</title>');
    // Right after the plain title, before the paragraphs.
    expect(svg.indexOf('<title>')).toBeLessThan(svg.indexOf('<title xml:lang="da">'));
    expect(svg.indexOf('<title xml:lang="en">')).toBeLessThan(svg.indexOf('<desc xml:lang="da">'));
    const parsed = parseHeartFromSVG(svg, 'grid-test.svg')!;
    // The plain title stays the heart's own name; the others are its names.
    expect(parsed.name).toBe('Weave 1');
    expect(parsed.names).toEqual(names);
    expect(heartName(parsed, 'da')).toBe(names.da);
    expect(heartName(parsed, 'en')).toBe(names.en);
    // Import → export → import is stable.
    expect(parseHeartFromSVG(serializeHeartToSVG(parsed), 'again.svg')!.names).toEqual(names);

    const json = serializeHeartDesign(design);
    const back = normalizeHeartDesign(JSON.parse(JSON.stringify(json)) as unknown)!;
    expect(back.name).toBe('Weave 1');
    expect(back.names).toEqual(names);
  });

  it('writes empty title placeholders for a heart without names, and falls back to its own name', () => {
    const design = { ...makeGridDesign(3), name: 'Mit hjerte' };
    const svg = serializeHeartToSVG(design);
    expect(svg).toContain('<title xml:lang="da"></title>');
    expect(svg).toContain('<title xml:lang="en"></title>');
    const parsed = parseHeartFromSVG(svg, 'grid-test.svg')!;
    expect(parsed.name).toBe('Mit hjerte');
    expect(parsed.names).toBeUndefined();
    expect(heartName(parsed, 'en')).toBe('Mit hjerte');
  });

  it('takes the name from the plain title even when a language title comes first, or from dc:title', () => {
    const first = serializeHeartToSVG({ ...makeGridDesign(3), name: 'Plain', names: { en: 'English' } }).replace(
      / {2}<title>Plain<\/title>\n((?: {2}<title xml:lang="..">.*<\/title>\n)+)/,
      '$1  <title>Plain</title>\n'
    );
    expect(first.indexOf('<title xml:lang')).toBeLessThan(first.indexOf('<title>Plain'));
    const parsed = parseHeartFromSVG(first, 'grid-test.svg')!;
    expect(parsed.name).toBe('Plain');
    expect(parsed.names).toEqual({ en: 'English' });
    // No plain <title>: the Dublin Core title, as before, and not a language's.
    const noPlain = first.replace('  <title>Plain</title>\n', '');
    expect(parseHeartFromSVG(noPlain, 'grid-test.svg')!.name).toBe('Plain');
  });

  it('loads a saved heart without names, and drops malformed ones', () => {
    const json = serializeHeartDesign(makeGridDesign(3));
    const { names: _omitted, ...legacy } = json;
    expect(normalizeHeartDesign(legacy)!.names).toBeUndefined();
    for (const bad of ['text', 42, { da: 3 }, { da: '  ', en: '' }]) {
      expect(normalizeHeartDesign({ ...json, names: bad })!.names, JSON.stringify(bad)).toBeUndefined();
    }
    expect(normalizeHeartDesign({ ...json, names: { en: ' Only English ', fr: 'x' } })!.names).toEqual({
      en: 'Only English'
    });
  });

  it('keeps the written paragraphs through SVG export/import and through JSON', () => {
    const descriptions = {
      da: 'Et hjerte med <tre> striber & "citater". Klip lige.',
      en: 'A heart with <three> strips & "quotes". Cut straight.'
    };
    const design: HeartDesign = { ...makeGridDesign(3), description: 'One-liner', descriptions };

    const svg = serializeHeartToSVG(design);
    expect(svg).toContain('<desc xml:lang="da">Et hjerte med &lt;tre&gt; striber &amp; &quot;citater&quot;. Klip lige.</desc>');
    // Right after the title, before the legacy plain <desc>.
    expect(svg.indexOf('<title>')).toBeLessThan(svg.indexOf('<desc xml:lang="da">'));
    expect(svg.indexOf('<desc xml:lang="en">')).toBeLessThan(svg.indexOf('<desc>One-liner</desc>'));
    const parsed = parseHeartFromSVG(svg, 'grid-test.svg')!;
    expect(parsed.descriptions).toEqual(descriptions);
    // The legacy summary is still the plain <desc>, not the first paragraph.
    expect(parsed.description).toBe('One-liner');
    // Import → export → import is stable.
    expect(serializeHeartToSVG(parsed)).toContain('<desc xml:lang="en">A heart with &lt;three&gt;');
    expect(parseHeartFromSVG(serializeHeartToSVG(parsed), 'again.svg')!.descriptions).toEqual(descriptions);

    const json = serializeHeartDesign(design);
    expect(normalizeHeartDesign(JSON.parse(JSON.stringify(json)) as unknown)!.descriptions).toEqual(
      descriptions
    );
  });

  it('writes empty desc placeholders for a heart without paragraphs, and reads them as none', () => {
    const design = makeGridDesign(3);
    const svg = serializeHeartToSVG(design);
    expect(svg).toContain('<desc xml:lang="da"></desc>');
    expect(svg).toContain('<desc xml:lang="en"></desc>');
    const parsed = parseHeartFromSVG(svg, 'grid-test.svg')!;
    expect(parsed.descriptions).toBeUndefined();
    expect(parsed.description).toBeUndefined();
  });

  it('loads a saved heart without descriptions, and drops malformed ones', () => {
    const json = serializeHeartDesign(makeGridDesign(3));
    const { descriptions: _omitted, ...legacy } = json;
    expect(normalizeHeartDesign(legacy)!.descriptions).toBeUndefined();
    for (const bad of ['text', 42, { da: 3 }, { da: '  ', en: '' }]) {
      expect(normalizeHeartDesign({ ...json, descriptions: bad })!.descriptions, JSON.stringify(bad)).toBeUndefined();
    }
    expect(normalizeHeartDesign({ ...json, descriptions: { da: ' Kun dansk ', fr: 'x' } })!.descriptions).toEqual({
      da: 'Kun dansk'
    });
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
