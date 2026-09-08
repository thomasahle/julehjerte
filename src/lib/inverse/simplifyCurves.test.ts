import { describe, it, expect } from 'vitest';
import type { BezierSegment } from '$lib/geometry/bezierSegments';
import { splitBezierAt } from '$lib/geometry/bezierSegments';
import { simplifyCubicChain, sampleChain, chainDeviation, FIT_TOLERANCE } from '$lib/inverse/simplifyCurves';
import { type CutGeometry } from '$lib/inverse/toHeartDesign';
import starSolution from '../../../static/inverse/examples/star.saved.json';

/** Cut one cubic into `pieces` equal-parameter pieces. */
function subdivide(seg: BezierSegment, pieces: number): BezierSegment[] {
  let rest = seg;
  const out: BezierSegment[] = [];
  for (let i = 1; i < pieces; i++) {
    const [head, tail] = splitBezierAt(rest, 1 / (pieces - i + 1));
    out.push(head);
    rest = tail;
  }
  out.push(rest);
  return out;
}

function line(from: [number, number], to: [number, number]): BezierSegment {
  const p0 = { x: from[0], y: from[1] };
  const p3 = { x: to[0], y: to[1] };
  return {
    p0,
    p1: { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 },
    p2: { x: p0.x + ((p3.x - p0.x) * 2) / 3, y: p0.y + ((p3.y - p0.y) * 2) / 3 },
    p3
  };
}

/** Every cut of the star, in the 0–100 frame, as the converter reads them. */
function starChains(): BezierSegment[][] {
  const g = starSolution as unknown as CutGeometry;
  const scale = 100 / g.square_width_mm;
  return [...g.A_overlap_paths, ...g.B_overlap_paths].map((cut) => {
    const segments = cut.map((ref) => {
      const p = g.curves[ref.curve]!.control_points.map((q) => ({ x: q[0]! * scale, y: q[1]! * scale }));
      if (ref.reverse) p.reverse();
      return { p0: p[0]!, p1: p[1]!, p2: p[2]!, p3: p[3]! };
    });
    for (let i = 1; i < segments.length; i++) segments[i]!.p0 = { ...segments[i - 1]!.p3 };
    return segments;
  });
}

const S_CURVE: BezierSegment = {
  p0: { x: 0, y: 0 },
  p1: { x: 40, y: 5 },
  p2: { x: 60, y: 95 },
  p3: { x: 100, y: 100 }
};

describe('simplifyCubicChain', () => {
  it('puts a subdivided cubic back together as one', () => {
    const pieces = subdivide(S_CURVE, 12);
    const fitted = simplifyCubicChain(pieces, 0.05);
    expect(fitted).toHaveLength(1);
    expect(chainDeviation(fitted, sampleChain(pieces, 0.1))).toBeLessThan(0.05);
  });

  it('keeps the endpoints and the directions it leaves them in', () => {
    const pieces = subdivide(S_CURVE, 9);
    const fitted = simplifyCubicChain(pieces, 0.2);
    const first = fitted[0]!;
    const last = fitted[fitted.length - 1]!;
    expect(first.p0).toEqual(S_CURVE.p0);
    expect(last.p3).toEqual(S_CURVE.p3);
    // The handles may be shorter or longer, but they must point the same way.
    const dir = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.atan2(b.y - a.y, b.x - a.x);
    expect(dir(first.p0, first.p1)).toBeCloseTo(dir(S_CURVE.p0, S_CURVE.p1), 6);
    expect(dir(last.p3, last.p2)).toBeCloseTo(dir(S_CURVE.p3, S_CURVE.p2), 6);
  });

  // Three tolerances over all eight cuts of the star, each sampled every tenth
  // of a millimetre: a second or two on its own, and four times that when
  // vitest is running the rest of the suite on the other cores. The default 5 s
  // is what it outgrew, not the machine — hence a limit rather than a smaller
  // sweep, which is the coverage this test is for.
  it('stays inside the tolerance it was given, on every cut of the star', { timeout: 30000 }, () => {
    for (const tolerance of [0.15, FIT_TOLERANCE, 0.6]) {
      for (const chain of starChains()) {
        const fitted = simplifyCubicChain(chain, tolerance);
        // The measurement is a little coarse in itself, hence the small margin.
        expect(chainDeviation(fitted, sampleChain(chain, 0.1))).toBeLessThan(tolerance * 1.05);
      }
    }
  });

  it('is monotone in the tolerance: coarser never costs more cubics', () => {
    for (const chain of starChains()) {
      const fine = simplifyCubicChain(chain, 0.15).length;
      const coarse = simplifyCubicChain(chain, 0.6).length;
      expect(coarse).toBeLessThanOrEqual(fine);
      expect(coarse).toBeLessThan(chain.length);
    }
  });

  it('breaks at a corner instead of rounding it away', () => {
    const corner: BezierSegment[] = [
      ...subdivide(line([0, 0], [50, 0]), 3),
      ...subdivide(line([50, 0], [50, 50]), 3)
    ];
    const fitted = simplifyCubicChain(corner, 0.25);
    // Two straight legs, so a handful of cubics at most, and one of the joints
    // has to sit on the corner itself: rounding it off would cost 25 units.
    expect(fitted.length).toBeLessThanOrEqual(3);
    const joints = fitted.map((c) => c.p3);
    expect(joints.some((p) => Math.hypot(p.x - 50, p.y - 0) < 0.25)).toBe(true);
  });

  it('leaves a single cubic and a zero tolerance alone', () => {
    expect(simplifyCubicChain([S_CURVE], 0.25)).toEqual([S_CURVE]);
    const pieces = subdivide(S_CURVE, 6);
    expect(simplifyCubicChain(pieces, 0)).toEqual(pieces);
    expect(simplifyCubicChain([], 0.25)).toEqual([]);
  });

  it('never returns more cubics than it was given', () => {
    for (const chain of starChains()) {
      expect(simplifyCubicChain(chain, 0.01).length).toBeLessThanOrEqual(chain.length);
    }
  });
});

describe('sampleChain', () => {
  it('samples closely enough to see the curve between the points', () => {
    const points = sampleChain([S_CURVE], 1);
    expect(points[0]).toEqual(S_CURVE.p0);
    expect(points[points.length - 1]).toEqual(S_CURVE.p3);
    // The chord between two samples is shorter than the arc between them, so
    // asking for a spacing of one unit has to leave every step under it.
    for (let i = 1; i < points.length; i++) {
      expect(Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)).toBeLessThan(1);
    }
  });

  it('drops repeated points so the parameterisation stays usable', () => {
    const degenerate: BezierSegment = {
      p0: { x: 5, y: 5 },
      p1: { x: 5, y: 5 },
      p2: { x: 5, y: 5 },
      p3: { x: 5, y: 5 }
    };
    expect(sampleChain([degenerate], 0.5)).toHaveLength(1);
  });
});
