/**
 * Heart → mask: draw a design's weave into the paint mode's cell grid.
 *
 * The mask has to show exactly what the visitor sees on the canvas, so this
 * rasteriser takes the strips straight from `computeWeaveData` — the single
 * source of truth for which strip lies on top of which — and fills them with the
 * same even-odd rule the SVG renderer hands to the browser: base 0 (the left
 * lobe's paper), then the even-odd union of every strip as 1 (the right lobe's).
 * A cell covered by two strips at once falls back to 0, which is precisely the
 * over-under of the weave.
 *
 * Pure: no DOM, no canvas, so it runs in tests and in a worker.
 */

import type { HeartDesign } from '$lib/types/heart';
import type { BezierSegment } from '$lib/geometry/bezierSegments';
import { parsePathDataToSegments } from '$lib/geometry/bezierSegments';
import { computeWeaveData } from '$lib/rendering/svgWeave';
import { MASK_SIZE, type Mask } from '$lib/paint/mask';

/** Largest deviation, in cells, a flattened chord may have from its curve. */
const FLATTEN_TOLERANCE_CELLS = 0.25;

/** Guard against a pathological control polygon subdividing forever. */
const MAX_FLATTEN_DEPTH = 16;

type Pt = { x: number; y: number };

/** Perpendicular distance from `p` to the line through `a` and `b`. */
function lineDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  // A degenerate chord: fall back to the plain distance from the shared endpoint.
  if (len < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Append the flattened curve to `out`, which must already end at `p0`. */
function flattenCubic(seg: BezierSegment, tolerance: number, depth: number, out: Pt[]): void {
  const flat =
    Math.max(lineDistance(seg.p1, seg.p0, seg.p3), lineDistance(seg.p2, seg.p0, seg.p3)) <= tolerance;
  if (flat || depth >= MAX_FLATTEN_DEPTH) {
    out.push(seg.p3);
    return;
  }
  // de Casteljau at t = 0.5
  const p01 = midpoint(seg.p0, seg.p1);
  const p12 = midpoint(seg.p1, seg.p2);
  const p23 = midpoint(seg.p2, seg.p3);
  const p012 = midpoint(p01, p12);
  const p123 = midpoint(p12, p23);
  const mid = midpoint(p012, p123);
  flattenCubic({ p0: seg.p0, p1: p01, p2: p012, p3: mid }, tolerance, depth + 1, out);
  flattenCubic({ p0: mid, p1: p123, p2: p23, p3: seg.p3 }, tolerance, depth + 1, out);
}

type Edge = { x0: number; y0: number; x1: number; y1: number };

/**
 * Fill `edges` into `mask` with the even-odd rule, sampled at cell centres.
 *
 * The scanline walks each row left to right and flips the running value at every
 * crossing, the same way the engine's own `sampleRings` does, so the two agree
 * cell for cell on the same geometry.
 */
function fillEvenOdd(mask: Mask, edges: Edge[]): void {
  const { size, data } = mask;
  const crossings: number[] = [];
  for (let row = 0; row < size; row++) {
    const y = row + 0.5;
    crossings.length = 0;
    for (const e of edges) {
      // Half-open in y so a vertex shared by two edges is counted exactly once.
      if (e.y0 > y === e.y1 > y) continue;
      crossings.push(e.x0 + ((y - e.y0) * (e.x1 - e.x0)) / (e.y1 - e.y0));
    }
    if (!crossings.length) continue;
    crossings.sort((a, b) => a - b);
    let next = 0;
    let inside = 0;
    const base = row * size;
    for (let col = 0; col < size; col++) {
      const x = col + 0.5;
      while (next < crossings.length && crossings[next]! < x) {
        inside ^= 1;
        next++;
      }
      if (inside) data[base + col] = 1;
    }
  }
}

/**
 * Rasterise a heart's weave into a `size × size` mask of the overlap rectangle.
 *
 * The overlap rectangle — the woven square — is mapped onto the whole grid, so
 * the lobes' ears fall outside and are not drawn; they are painted as flat paper
 * by the canvas instead.
 */
export function rasterizeDesign(design: HeartDesign, size = MASK_SIZE): Mask {
  const mask: Mask = { size, data: new Uint8Array(size * size) };
  if (!design.fingers.length) return mask;

  const weave = computeWeaveData(design.fingers, design.gridSize, (design.weaveParity ?? 0) as 0 | 1);
  const { overlap } = weave;
  if (!(overlap.width > 0) || !(overlap.height > 0)) return mask;

  const sx = size / overlap.width;
  const sy = size / overlap.height;
  const toCells = (p: Pt): Pt => ({ x: (p.x - overlap.left) * sx, y: (p.y - overlap.top) * sy });

  const edges: Edge[] = [];
  for (const strip of [...weave.rightOnTopStrips, ...weave.leftOnTopStrips]) {
    // Every strip path is one closed subpath, so its parsed segments already
    // carry the closing chord and form a complete boundary loop.
    const segments = parsePathDataToSegments(strip.pathData);
    if (!segments.length) continue;
    const points: Pt[] = [toCells(segments[0]!.p0)];
    for (const seg of segments) {
      flattenCubic(
        { p0: toCells(seg.p0), p1: toCells(seg.p1), p2: toCells(seg.p2), p3: toCells(seg.p3) },
        FLATTEN_TOLERANCE_CELLS,
        0,
        points
      );
    }
    for (let i = 1; i < points.length; i++) {
      edges.push({ x0: points[i - 1]!.x, y0: points[i - 1]!.y, x1: points[i]!.x, y1: points[i]!.y });
    }
    // Close the loop in case the path data did not come back to its start.
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (first.x !== last.x || first.y !== last.y) {
      edges.push({ x0: last.x, y0: last.y, x1: first.x, y1: first.y });
    }
  }

  fillEvenOdd(mask, edges);
  return mask;
}

/** Fraction of cells where two equally sized masks disagree. */
export function maskMismatch(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || !a.length) throw new Error('Masks must have the same size.');
  let differing = 0;
  for (let i = 0; i < a.length; i++) if ((a[i] ? 1 : 0) !== (b[i] ? 1 : 0)) differing++;
  return differing / a.length;
}
