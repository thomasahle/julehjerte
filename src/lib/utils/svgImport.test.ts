import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ballInkscape from './fixtures/ball-inkscape.svg?raw';
import ballPrestitched from './fixtures/ball-prestitched.svg?raw';
import type { Finger, HeartDesign, LobeId, Vec } from '$lib/types/heart';
import {
  arcToCubic,
  parsePathDataToSegments,
  parsePathDataToSubpaths,
  tokenizePathData,
  type BezierSegment
} from '$lib/geometry/bezierSegments';
import { parseHeartFromSVG, parseHeartFromSVGWithReport, serializeHeartToSVG } from '$lib/utils/heartDesign';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { importSummary } from '$lib/utils/svgImportSummary';

const bezierAt = (s: BezierSegment, t: number): Vec => {
  const u = 1 - t;
  return {
    x: u * u * u * s.p0.x + 3 * u * u * t * s.p1.x + 3 * u * t * t * s.p2.x + t * t * t * s.p3.x,
    y: u * u * u * s.p0.y + 3 * u * u * t * s.p1.y + 3 * u * t * t * s.p2.y + t * t * t * s.p3.y
  };
};
const samples = (segs: BezierSegment[], n = 40): Vec[] =>
  segs.flatMap((s) => Array.from({ length: n + 1 }, (_, i) => bezierAt(s, i / n)));
const close = (a: Vec, b: Vec, eps = 1e-9) => {
  expect(a.x).toBeCloseTo(b.x, -Math.log10(eps));
  expect(a.y).toBeCloseTo(b.y, -Math.log10(eps));
};

const issues = (d: HeartDesign) =>
  findFingersWithIssues(d.fingers, intersectionMarginPx(inferOverlapRect(d.fingers, d.gridSize)));

// Boundaries per lobe, sorted by position, outer edges included.
function lobe(d: HeartDesign, l: LobeId): Finger[] {
  const pos = (f: Finger) => (l === 'left' ? f.segments[0]!.p0.y : f.segments[0]!.p0.x);
  return d.fingers.filter((f) => f.lobe === l).sort((a, b) => pos(a) - pos(b));
}
const isCurved = (f: Finger, l: LobeId) =>
  samples(f.segments).some((p) => Math.abs((l === 'left' ? p.y : p.x) - (l === 'left' ? f.segments[0]!.p0.y : f.segments[0]!.p0.x)) > 0.5);

// Largest distance from a sampled point of `a` to the sampled polyline of `b`, in
// the 0–100 units of the overlap square.
function curveDistance(a: Finger, b: Finger, d: HeartDesign): number {
  const rect = inferOverlapRect(d.fingers, d.gridSize);
  const scale = 100 / (rect.right - rect.left);
  const pb = samples(b.segments, 200);
  let worst = 0;
  for (const p of samples(a.segments, 40)) {
    let best = Infinity;
    for (const q of pb) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y));
    worst = Math.max(worst, best);
  }
  return worst * scale;
}

function expectSameDesign(a: HeartDesign, b: HeartDesign, tol = 0.05) {
  expect(a.gridSize).toEqual(b.gridSize);
  for (const l of ['left', 'right'] as const) {
    const fa = lobe(a, l);
    const fb = lobe(b, l);
    expect(fa).toHaveLength(fb.length);
    fa.forEach((f, i) => {
      expect(curveDistance(f, fb[i]!, a)).toBeLessThan(tol);
      expect(curveDistance(fb[i]!, f, a)).toBeLessThan(tol);
    });
  }
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('path data', () => {
  it('reads numbers run together and single-digit arc flags', () => {
    expect(tokenizePathData('M1.5.5L-1-2e1,3')).toEqual([
      { type: 'M', args: [1.5, 0.5] },
      { type: 'L', args: [-1, -20, 3] }
    ]);
    expect(tokenizePathData('a5 5 0 01 10 0')).toEqual([{ type: 'a', args: [5, 5, 0, 0, 1, 10, 0] }]);
    expect(tokenizePathData('A5,5,30,1,0,10,0')).toEqual([{ type: 'A', args: [5, 5, 30, 1, 0, 10, 0] }]);
  });

  it('turns a quarter circle into one cubic with control points on the tangents', () => {
    // Maisonobe's alpha for 90°: sin(90°)(√(4 + 3 tan²45°) − 1)/3 = (√7 − 1)/3.
    const k = (Math.sqrt(7) - 1) / 3; // 0.5485837…
    const [seg, ...rest] = arcToCubic({ x: 1, y: 0 }, 1, 1, 0, false, true, { x: 0, y: 1 });
    expect(rest).toHaveLength(0);
    close(seg!.p0, { x: 1, y: 0 });
    close(seg!.p1, { x: 1, y: k });
    close(seg!.p2, { x: k, y: 1 });
    close(seg!.p3, { x: 0, y: 1 });
    // Within 0.2 % of the radius everywhere.
    for (const p of samples([seg!])) expect(Math.abs(Math.hypot(p.x, p.y) - 1)).toBeLessThan(2e-3);
  });

  it('splits arcs over 90° and keeps every point on the ellipse, rotated or not', () => {
    // Half circle: two quarter segments, through (0, 1) or (0, -1) by the sweep flag.
    const cw = arcToCubic({ x: 1, y: 0 }, 1, 1, 0, false, true, { x: -1, y: 0 });
    expect(cw).toHaveLength(2);
    close(cw[0]!.p3, { x: 0, y: 1 });
    const ccw = arcToCubic({ x: 1, y: 0 }, 1, 1, 0, false, false, { x: -1, y: 0 });
    close(ccw[0]!.p3, { x: 0, y: -1 });
    // Large arc: 270° in three segments.
    expect(arcToCubic({ x: 1, y: 0 }, 1, 1, 0, true, false, { x: 0, y: 1 })).toHaveLength(3);

    // A 30°-rotated ellipse with rx 4, ry 2 centred on the origin: the end points of
    // a large arc between two of its points, and every sample, must lie on it.
    const phi = Math.PI / 6;
    const on = (t: number): Vec => ({
      x: 4 * Math.cos(phi) * Math.cos(t) - 2 * Math.sin(phi) * Math.sin(t),
      y: 4 * Math.sin(phi) * Math.cos(t) + 2 * Math.cos(phi) * Math.sin(t)
    });
    const small2 = arcToCubic(on(0.2), 4, 2, 30, false, true, on(2.0));
    const large = arcToCubic(on(0.2), 4, 2, 30, true, false, on(2.0));
    expect(small2).toHaveLength(2);
    expect(large).toHaveLength(3); // 257°
    close(small2[0]!.p3, on(1.1), 1e-6);
    close(large[0]!.p3, on(0.2 - (2 * Math.PI - 1.8) / 3), 1e-6);
    for (const p of samples([...small2, ...large])) {
      const x = p.x * Math.cos(phi) + p.y * Math.sin(phi);
      const y = -p.x * Math.sin(phi) + p.y * Math.cos(phi);
      expect(Math.abs((x / 4) ** 2 + (y / 2) ** 2 - 1)).toBeLessThan(5e-3);
    }
    // An arc with too small radii is scaled up to just reach (a half ellipse).
    const small = arcToCubic({ x: 0, y: 0 }, 1, 1, 0, false, true, { x: 10, y: 0 });
    close(small[0]!.p3, { x: 5, y: -5 }, 1e-6);
  });

  it('reads relative commands, H/V/S/Q/T/Z and implicit repeats like the absolute ones', () => {
    const rel = parsePathDataToSegments('m 10 10 20 0 h 10 v 10 c 0 5 5 10 10 10 s 10 5 10 10 q 5 5 10 0 t 10 0 z');
    const abs = parsePathDataToSegments('M 10 10 L 30 10 H 40 V 20 C 40 25 45 30 50 30 S 60 35 60 40 Q 65 45 70 40 T 80 40 Z');
    expect(rel).toHaveLength(abs.length);
    rel.forEach((s, i) => {
      for (const k of ['p0', 'p1', 'p2', 'p3'] as const) close(s[k], abs[i]![k]);
    });
    // S reflects the previous control point (40, 25)->(45, 30) about (50, 30).
    close(abs[4]!.p1, { x: 55, y: 30 });
    // T reflects Q's control point (65, 45) about (70, 40).
    const tElev = abs[6]!;
    close(tElev.p1, { x: 70 + (2 / 3) * (75 - 70), y: 40 + (2 / 3) * (35 - 40) });
    // Z closes back to the start.
    close(abs[abs.length - 1]!.p3, { x: 10, y: 10 });
  });

  it('keeps subpaths apart, and starts a new one after Z', () => {
    const subs = parsePathDataToSubpaths('M 0 0 L 10 0 m 5 0 l 10 0 M 50 50 L 60 50 Z l 5 5');
    expect(subs.map((s) => s.length)).toEqual([1, 1, 2, 1]);
    close(subs[1]![0]!.p0, { x: 15, y: 0 });
    close(subs[3]![0]!.p0, { x: 50, y: 50 });
  });
});

// A 3×3 drawing in an 80 × 80 viewBox: two straight horizontal cuts and two vertical
// ones, one of them bowed with an arc. Optionally with the square's outline drawn,
// and with every coordinate multiplied by `k` (to be undone by a transform).
function drawing({ outline = false, extra = '', k = 1, wrap = (s: string) => s } = {}): string {
  const c = (v: number) => String(v * k);
  const paths = [
    `<path id="h1" d="M 0 ${c(26.6667)} H ${c(80)}"/>`,
    `<path id="h2" d="M ${c(80)} ${c(53.3333)} H 0"/>`,
    `<path id="v1" d="M ${c(26.6667)} ${c(80)} V 0"/>`,
    `<path id="v2" d="M ${c(53.3333)} ${c(80)} V ${c(60)} A ${c(20)} ${c(20)} 0 0 1 ${c(53.3333)} ${c(20)} V 0"/>`
  ];
  const edges = outline
    ? [
        `<path id="top" d="M 0 0 H ${c(80)}"/>`,
        `<path id="bottom" d="M 0 ${c(80)} H ${c(80)}"/>`,
        `<line x1="0" y1="0" x2="0" y2="${c(80)}"/>`,
        `<polyline points="${c(80)},0 ${c(80)},${c(80)}"/>`
      ]
    : [];
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="80mm" height="80mm" viewBox="0 0 80 80">${wrap(
    [...edges, ...paths].join('') + extra
  )}</svg>`;
}

describe('importing a drawing', () => {
  const reference = parseHeartFromSVG(drawing(), 'ref.svg')!;

  it('scales any viewBox to the editor and reads arcs', () => {
    const { design, report } = parseHeartFromSVGWithReport(drawing(), 'ref.svg');
    expect(report.square).toBe('viewBox');
    expect(report.droppedEdges).toBe(0);
    expect(design!.gridSize).toEqual({ x: 3, y: 3 });
    expect(report.cutsPerHalf).toEqual({ left: 2, right: 2 });
    const right = lobe(design!, 'right');
    expect(isCurved(right[2]!, 'right')).toBe(true);
    expect(issues(design!).size).toBe(0);
  });

  it('drops a drawn outline of the square and uses it as the square', () => {
    const { design, report } = parseHeartFromSVGWithReport(drawing({ outline: true }), 'o.svg');
    expect(report.square).toBe('outline');
    expect(report.droppedEdges).toBe(4);
    expectSameDesign(design!, reference);
  });

  it('finds the outline when it is one closed rectangle and the viewBox is something else', () => {
    const svg = drawing({ extra: '<path d="M 0 0 H 80 V 80 H 0 Z"/>' }).replace('viewBox="0 0 80 80"', 'viewBox="-10 -10 100 100"');
    const { design, report } = parseHeartFromSVGWithReport(svg, 'o.svg');
    expect(report.square).toBe('outline');
    expect(report.droppedEdges).toBe(4);
    expectSameDesign(design!, reference);
  });

  it('does not take the outermost cuts of a one-way drawing for an outline', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M 100 33 C 66 33 33 33 0 33"/><path d="M 100 66 C 66 66 33 66 0 66"/></svg>';
    const { design, report } = parseHeartFromSVGWithReport(svg, 'h.svg');
    expect(report.square).toBe('viewBox');
    expect(lobe(design!, 'left')).toHaveLength(4);
  });

  it('applies translate, scale and matrix transforms on groups and paths', () => {
    // Drawn at half size (no outline, so the viewBox is the square), put back by
    // nested group transforms (translate and matrix cancel out, scale doubles).
    const svg = drawing({
      k: 0.5,
      wrap: (inner) =>
        `<g transform="translate(-5 7)"><g transform="matrix(1 0 0 1 5 -7)"><g transform="scale(2)">${inner}</g></g></g>`
    });
    expectSameDesign(parseHeartFromSVG(svg, 't.svg')!, reference);
    expect(() => expectSameDesign(parseHeartFromSVG(drawing({ k: 0.5 }), 't.svg')!, reference)).toThrow();
    // A transform on the path itself: shifted by 10 and moved back.
    const shifted = drawing().replace('<path id="v2" d="M 53.3333', '<path id="v2" transform="translate(-10, 0)" d="M 63.3333').replace('A 20 20 0 0 1 53.3333 20', 'A 20 20 0 0 1 63.3333 20');
    expectSameDesign(parseHeartFromSVG(shifted, 't.svg')!, reference);
  });

  it('joins a cut split into subpaths, in any order and direction', () => {
    const split = drawing().replace(
      'd="M 53.3333 80 V 60 A 20 20 0 0 1 53.3333 20 V 0"',
      'd="M 53.3333 0 V 20.0004 M 53.3333 60 A 20 20 0 0 1 53.3333 20 M 53.3333 60.0003 V 80"'
    );
    const { design, report } = parseHeartFromSVGWithReport(split, 's.svg');
    expect(report.stitchedSubpaths).toBe(2);
    expect(report.unjoined).toEqual([]);
    expectSameDesign(design!, reference);
  });

  it('names a cut it cannot join instead of dropping it silently', () => {
    const broken = drawing().replace(
      '<path id="v1" d="M 26.6667 80 V 0"/>',
      '<path id="v1" inkscape:label="Venstre klip" d="M 26.6667 80 V 50 M 26.6667 40 V 0"/>'
    );
    const { report } = parseHeartFromSVGWithReport(broken, 'b.svg');
    expect(report.unjoined).toEqual(['Venstre klip #1', 'Venstre klip #2']);
  });

  it('reports a path with no clear direction as skipped', () => {
    const { report } = parseHeartFromSVGWithReport(drawing({ extra: '<path id="blob" d="M 30 30 L 50 50"/>' }), 'x.svg');
    expect(report.skipped).toEqual(['blob']);
  });
});

describe('the Kugle drawing from Inkscape', () => {
  // ball-inkscape.svg is the drawing as saved by Inkscape: an 80 mm viewBox, the
  // square's outline drawn, each curved cut as three subpaths with relative arcs.
  // ball-prestitched.svg is the same drawing after the one-off preprocessor that
  // was used before the importer could read it (outline dropped, subpaths joined,
  // scaled to 0–100).
  it('imports as 8 × 8 with 7 cuts per half, 4 of them curved, and no warnings', () => {
    const { design, report } = parseHeartFromSVGWithReport(ballInkscape, 'ball.svg');
    expect(design!.gridSize).toEqual({ x: 8, y: 8 });
    expect(report).toMatchObject({ square: 'outline', droppedEdges: 4, stitchedSubpaths: 16, unjoined: [], skipped: [] });
    expect(report.cutsPerHalf).toEqual({ left: 7, right: 7 });
    for (const l of ['left', 'right'] as const) {
      const cuts = lobe(design!, l).slice(1, -1);
      expect(cuts.filter((f) => isCurved(f, l))).toHaveLength(4);
    }
    expect(issues(design!).size).toBe(0);
  });

  it('gives the same cuts as the preprocessed file, within 0.05 units', () => {
    expectSameDesign(parseHeartFromSVG(ballInkscape, 'ball.svg')!, parseHeartFromSVG(ballPrestitched, 'ball.svg')!);
  });

  it('survives export and re-import', () => {
    const design = parseHeartFromSVG(ballInkscape, 'ball.svg')!;
    const again = parseHeartFromSVG(serializeHeartToSVG(design), 'ball.svg')!;
    expectSameDesign(again, design, 0.01);
  });

  it("sums the import up in one line for the editor's notice", () => {
    const { design, report } = parseHeartFromSVGWithReport(ballInkscape, 'ball.svg');
    expect(importSummary(design!, report, 'da')).toEqual({
      text: 'Importeret: 8 × 8 striber. Klip i hver halvdel: 7. Tegnede yderkanter fjernet: 4. Delstykker sat sammen til hele klip: 16. Ingen advarsler.',
      warnings: 0
    });
    const broken = parseHeartFromSVGWithReport(
      drawing({ extra: '<path id="blob" d="M 30 30 L 50 50"/>' }).replace('d="M 26.6667 80 V 0"', 'd="M 26.6667 80 V 50 M 26.6667 40 V 0"'),
      'b.svg'
    );
    const summary = importSummary(broken.design!, broken.report, 'en');
    // The incomplete cut also pulls the imported endpoint back into its own
    // last segment. The stricter geometry check reports that reversal.
    expect(summary.warnings).toBe(4);
    expect(summary.text).toContain('Curves that cross or touch: 1.');
    expect(summary.text).toContain('Not edge to edge (check them): v1 #1, v1 #2.');
    expect(summary.text).toContain('horizontal cuts belong to the left half, vertical ones to the right): blob.');
  });
});
