/**
 * Fit a chain of cubics with as few cubics as the tolerance allows.
 *
 * The inverse engine hands back every cut as 13–31 short cubics — one per raster
 * step of its own cut graph. That is unusable in the editor: the visitor would
 * drag 30 nodes to move one bump, and the saved heart would be thirty times
 * larger than a hand-drawn one. So each chain is sampled densely and refitted
 * with Philip J. Schneider's least-squares algorithm ("An Algorithm for
 * Automatically Fitting Digitized Curves", Graphics Gems, 1990): fit one cubic
 * to the whole point run with the endpoint tangents fixed, improve the
 * parameterisation with Newton-Raphson, and split at the worst point only when
 * the fit still misses the tolerance.
 *
 * All coordinates are in the heart's 0–100 JSON frame, so a tolerance of 0.25 is
 * a quarter of a millimetre on a 100 mm square. How coarse to go is a trade the
 * numbers settle rather than taste: the engine's cuts turn sharply — the star's
 * eight cuts hold 67 corners over 25°, several of them over 120° — and a corner
 * always costs a cubic, so no tolerance takes the star below about nine cubics
 * per cut. Loosening past that buys almost no nodes and loses fidelity fast (the
 * woven picture drifts from the engine's by roughly three points of area per
 * unit of tolerance). 0.25 sits at the knee: half the cubics, and still three
 * times closer to the engine's own weave than the 1.5% the converter promises.
 */

import type { BezierSegment } from '$lib/geometry/bezierSegments';

type Pt = { x: number; y: number };

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s });
const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
const len = (a: Pt): number => Math.hypot(a.x, a.y);
const negate = (a: Pt): Pt => ({ x: -a.x, y: -a.y });

/**
 * Newton-Raphson passes before a failing fit is split. Schneider budgets four,
 * which suits the pixel-scale tolerances he wrote for; ours are tenths of a
 * millimetre on a 100 mm square, so the parameterisation has to be much better
 * before the error measured at the sample points stops overstating the real
 * distance to the curve. Sixteen passes cut the star's cuts by a further third
 * over four, and cost nothing next to the splits they avoid.
 */
const REPARAMETERIZE_PASSES = 16;

/** Default fitting tolerance in the 0–100 frame; see the note at the top. */
export const FIT_TOLERANCE = 0.25;

/**
 * Ceiling on how finely one input cubic is sampled. The engine's cubics are a
 * few millimetres long and need a few dozen samples at our tolerances, so this
 * only ever bites on a single very long curve, where a coarser sample is still
 * far finer than anything the fit is checked against.
 */
const MAX_SAMPLES_PER_CUBIC = 256;

function normalize(a: Pt): Pt {
  const l = len(a);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Bernstein basis for a cubic. */
const b0 = (u: number) => (1 - u) ** 3;
const b1 = (u: number) => 3 * u * (1 - u) ** 2;
const b2 = (u: number) => 3 * u * u * (1 - u);
const b3 = (u: number) => u ** 3;

function evalCubic(c: BezierSegment, u: number): Pt {
  return {
    x: b0(u) * c.p0.x + b1(u) * c.p1.x + b2(u) * c.p2.x + b3(u) * c.p3.x,
    y: b0(u) * c.p0.y + b1(u) * c.p1.y + b2(u) * c.p2.y + b3(u) * c.p3.y
  };
}

/** First derivative of a cubic, evaluated as the quadratic through 3(pi+1 − pi). */
function evalCubicD1(c: BezierSegment, u: number): Pt {
  const q0 = mul(sub(c.p1, c.p0), 3);
  const q1 = mul(sub(c.p2, c.p1), 3);
  const q2 = mul(sub(c.p3, c.p2), 3);
  const mu = 1 - u;
  return add(add(mul(q0, mu * mu), mul(q1, 2 * mu * u)), mul(q2, u * u));
}

/** Second derivative of a cubic. */
function evalCubicD2(c: BezierSegment, u: number): Pt {
  const q0 = mul(sub(c.p1, c.p0), 3);
  const q1 = mul(sub(c.p2, c.p1), 3);
  const q2 = mul(sub(c.p3, c.p2), 3);
  const r0 = mul(sub(q1, q0), 2);
  const r1 = mul(sub(q2, q1), 2);
  return add(mul(r0, 1 - u), mul(r1, u));
}

/**
 * Sample a chain of cubics into a dense polyline.
 *
 * Spacing follows the tolerance: a fit is only ever checked at the sample
 * points, so samples closer together than half the tolerance leave no room for
 * the curve to wander unseen between them.
 */
export function sampleChain(segments: BezierSegment[], spacing: number): Pt[] {
  const points: Pt[] = [];
  const push = (p: Pt) => {
    const last = points[points.length - 1];
    // Repeated points break chord-length parameterisation, so drop them.
    if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) return;
    points.push(p);
  };
  if (!segments.length) return points;
  push(segments[0]!.p0);
  for (const seg of segments) {
    const polygon = len(sub(seg.p1, seg.p0)) + len(sub(seg.p2, seg.p1)) + len(sub(seg.p3, seg.p2));
    const steps = Math.max(4, Math.min(MAX_SAMPLES_PER_CUBIC, Math.ceil(polygon / Math.max(spacing, 1e-6))));
    for (let i = 1; i <= steps; i++) push(evalCubic(seg, i / steps));
  }
  return points;
}

/** Unit tangent leaving the start of the chain, from its own control polygon. */
function startTangent(segments: BezierSegment[]): Pt {
  const first = segments[0]!;
  for (const p of [first.p1, first.p2, first.p3]) {
    const t = normalize(sub(p, first.p0));
    if (t.x || t.y) return t;
  }
  return { x: 0, y: 0 };
}

/** Unit tangent entering the end of the chain, pointing back along the curve. */
function endTangent(segments: BezierSegment[]): Pt {
  const last = segments[segments.length - 1]!;
  for (const p of [last.p2, last.p1, last.p0]) {
    const t = normalize(sub(p, last.p3));
    if (t.x || t.y) return t;
  }
  return { x: 0, y: 0 };
}

/** Preserve intentional corners emitted by the main fitter. */
export function isSharpJoin(before: BezierSegment, after: BezierSegment): boolean {
  const incoming = negate(endTangent([before]));
  const outgoing = startTangent([after]);
  return dot(incoming, outgoing) < Math.SQRT1_2;
}

function chordLengthParameterize(points: Pt[], first: number, last: number): number[] {
  const u: number[] = [0];
  for (let i = first + 1; i <= last; i++) {
    u.push(u[u.length - 1]! + len(sub(points[i]!, points[i - 1]!)));
  }
  const total = u[u.length - 1]!;
  if (total <= 0) return u.map((_, i) => i / (u.length - 1 || 1));
  return u.map((v) => v / total);
}

/** Least-squares cubic through the run, with both endpoints and tangents fixed. */
function generateBezier(points: Pt[], first: number, last: number, u: number[], tHat1: Pt, tHat2: Pt): BezierSegment {
  const p0 = points[first]!;
  const p3 = points[last]!;
  const n = last - first + 1;

  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < n; i++) {
    const ui = u[i]!;
    const a0 = mul(tHat1, b1(ui));
    const a1 = mul(tHat2, b2(ui));
    c00 += dot(a0, a0);
    c01 += dot(a0, a1);
    c11 += dot(a1, a1);
    const onLine = add(mul(p0, b0(ui) + b1(ui)), mul(p3, b2(ui) + b3(ui)));
    const tmp = sub(points[first + i]!, onLine);
    x0 += dot(a0, tmp);
    x1 += dot(a1, tmp);
  }

  const detC = c00 * c11 - c01 * c01;
  const detXC1 = x0 * c11 - x1 * c01;
  const detC0X = c00 * x1 - c01 * x0;
  let alphaL = detC === 0 ? 0 : detXC1 / detC;
  let alphaR = detC === 0 ? 0 : detC0X / detC;

  // Degenerate least squares (collinear or near-zero run): fall back to the
  // Wu/Barsky heuristic of putting the handles a third of the chord out.
  const segLength = len(sub(p3, p0));
  const epsilon = 1e-6 * segLength;
  if (alphaL < epsilon || alphaR < epsilon) {
    alphaL = segLength / 3;
    alphaR = segLength / 3;
  }

  return { p0, p1: add(p0, mul(tHat1, alphaL)), p2: add(p3, mul(tHat2, alphaR)), p3 };
}

/** One Newton-Raphson step towards the parameter that puts `p` closest to the curve. */
function newtonRaphsonRootFind(curve: BezierSegment, p: Pt, u: number): number {
  const d = sub(evalCubic(curve, u), p);
  const d1 = evalCubicD1(curve, u);
  const d2 = evalCubicD2(curve, u);
  const numerator = dot(d, d1);
  const denominator = dot(d1, d1) + dot(d, d2);
  if (Math.abs(denominator) < 1e-12) return u;
  return u - numerator / denominator;
}

function computeMaxError(
  points: Pt[],
  first: number,
  last: number,
  curve: BezierSegment,
  u: number[]
): { maxError: number; splitPoint: number } {
  let maxError = 0;
  let splitPoint = Math.floor((last - first + 1) / 2) + first;
  for (let i = first + 1; i < last; i++) {
    const dist = len(sub(evalCubic(curve, u[i - first]!), points[i]!));
    if (dist >= maxError) {
      maxError = dist;
      splitPoint = i;
    }
  }
  return { maxError, splitPoint };
}

/** One cubic together with the run of sample points it was fitted to. */
type Fitted = {
  curve: BezierSegment;
  first: number;
  last: number;
  maxError: number;
  /** Where to cut the run if this fit is not good enough. */
  splitPoint: number;
};

/**
 * Fit one cubic to `points[first..last]`, keeping both endpoints and both
 * tangents. Returns the best of the plain least-squares fit and the
 * Newton-Raphson reparameterisations that follow it.
 */
function fitRun(
  points: Pt[],
  first: number,
  last: number,
  tHat1: Pt,
  tHat2: Pt,
  tolerance: number
): Fitted {
  if (last - first + 1 === 2) {
    const dist = len(sub(points[last]!, points[first]!)) / 3;
    const curve = {
      p0: points[first]!,
      p1: add(points[first]!, mul(tHat1, dist)),
      p2: add(points[last]!, mul(tHat2, dist)),
      p3: points[last]!
    };
    return { curve, first, last, maxError: 0, splitPoint: first };
  }

  let u = chordLengthParameterize(points, first, last);
  let curve = generateBezier(points, first, last, u, tHat1, tHat2);
  let best = { curve, first, last, ...computeMaxError(points, first, last, curve, u) };
  if (best.maxError < tolerance) return best;

  // A better parameterisation may still bring the fit inside the tolerance.
  // Schneider gates this on the error already being close, but his threshold is
  // a squared distance while ours is a real one in millimetres — always smaller
  // than its own square — so the gate would never open. The passes run every
  // time instead; see REPARAMETERIZE_PASSES.
  for (let pass = 0; pass < REPARAMETERIZE_PASSES; pass++) {
    const uPrime = u.map((ui, i) => newtonRaphsonRootFind(curve, points[first + i]!, ui));
    curve = generateBezier(points, first, last, uPrime, tHat1, tHat2);
    const measured = { curve, first, last, ...computeMaxError(points, first, last, curve, uPrime) };
    // Keep the best fit seen: a diverging reparameterisation must not lose the
    // split point the plain least-squares fit already found.
    if (measured.maxError < best.maxError) best = measured;
    if (measured.maxError < tolerance) return measured;
    u = uPrime;
  }
  return best;
}

/**
 * Tangents at the sample points, in the convention the fitter wants: `back`
 * points against the direction of travel (that is `tHat2`), `forward` with it
 * (`tHat1`). Using the same tangent on both sides of a junction is what makes
 * neighbouring fitted cubics meet smoothly, and lets two of them be merged into
 * one later without moving anything else.
 */
function tangentsFor(segments: BezierSegment[], points: Pt[]) {
  const first = startTangent(segments);
  const last = endTangent(segments);
  const back = (index: number): Pt => {
    if (index >= points.length - 1) return last;
    if (index <= 0) return negate(first);
    return normalize(sub(points[index - 1]!, points[index + 1]!));
  };
  return { back, forward: (index: number): Pt => (index <= 0 ? first : negate(back(index))) };
}

/** Schneider's recursion: fit, and split at the worst point when it misses. */
function subdivide(
  points: Pt[],
  first: number,
  last: number,
  tangents: ReturnType<typeof tangentsFor>,
  tolerance: number,
  out: Fitted[]
): void {
  const fit = fitRun(points, first, last, tangents.forward(first), tangents.back(last), tolerance);
  if (fit.maxError < tolerance || last - first < 2) {
    out.push(fit);
    return;
  }
  subdivide(points, first, fit.splitPoint, tangents, tolerance, out);
  subdivide(points, fit.splitPoint, last, tangents, tolerance, out);
}

/**
 * Refit a chain of cubics with fewer cubics, staying within `tolerance` of it.
 *
 * Two passes: Schneider's recursive subdivision, which splits at the worst point
 * until every piece fits, and then a greedy merge that walks those pieces and
 * takes the longest run one cubic can still cover. The subdivision is top-down
 * and greedy, so it keeps splits it no longer needs once its neighbours have
 * moved; the merge takes about one cubic in ten back off the engine's cuts.
 *
 * The chain's two endpoints and the directions it leaves and enters them are
 * kept exactly, so a cut that ran edge to edge still does, at the same place and
 * the same angle.
 */
export function simplifyCubicChain(segments: BezierSegment[], tolerance = FIT_TOLERANCE): BezierSegment[] {
  if (segments.length <= 1 || !(tolerance > 0)) return segments.map((s) => ({ ...s }));

  // Refitting across a right angle would undo the fitter's straight-span and
  // corner preservation. Fit the smooth runs on either side independently.
  const corners = segments.flatMap((s, i) => i > 0 && isSharpJoin(segments[i - 1]!, s) ? [i] : []);
  if (corners.length) {
    const out: BezierSegment[] = [];
    let from = 0;
    for (const to of [...corners, segments.length]) {
      out.push(...simplifyCubicChain(segments.slice(from, to), tolerance));
      from = to;
    }
    return out;
  }

  const points = sampleChain(segments, tolerance / 2);
  if (points.length < 2) return segments.map((s) => ({ ...s }));

  const tangents = tangentsFor(segments, points);
  const pieces: Fitted[] = [];
  subdivide(points, 0, points.length - 1, tangents, tolerance, pieces);

  const merged: BezierSegment[] = [];
  for (let i = 0; i < pieces.length; ) {
    let curve = pieces[i]!.curve;
    let end = i;
    for (let j = i + 1; j < pieces.length; j++) {
      const fit = fitRun(
        points,
        pieces[i]!.first,
        pieces[j]!.last,
        tangents.forward(pieces[i]!.first),
        tangents.back(pieces[j]!.last),
        tolerance
      );
      // The runs only get harder to cover, so the first failure ends the merge.
      if (fit.maxError >= tolerance) break;
      curve = fit.curve;
      end = j;
    }
    merged.push(curve);
    i = end + 1;
  }

  // A fit that came out no shorter is not worth the loss of fidelity.
  return merged.length < segments.length ? merged : segments.map((s) => ({ ...s }));
}

/**
 * Largest distance from `points` to the nearest place on `curves`, for tests and
 * for reporting how far a fit strayed. `resolution` is the sample spacing along
 * the curves, so it bounds how much the answer can overstate the true distance.
 *
 * One-sided on purpose, and only useful as such: it bounds how far the original
 * strayed from the fit, not how far the fit strayed from the original, so a
 * curve that bulges out into empty space while still passing near every sample
 * scores well here. What actually catches a bulge is the whole-design comparison
 * in `toHeartDesign.test.ts`, where an area error shows up in `maskMismatch` at
 * once; this only tells the fitter when to subdivide.
 */
export function chainDeviation(curves: BezierSegment[], points: Pt[], resolution = 0.05): number {
  const dense: Pt[] = [];
  for (const c of curves) {
    const polygon = len(sub(c.p1, c.p0)) + len(sub(c.p2, c.p1)) + len(sub(c.p3, c.p2));
    const steps = Math.max(8, Math.min(4096, Math.ceil(polygon / Math.max(resolution, 1e-6))));
    for (let i = 0; i <= steps; i++) dense.push(evalCubic(c, i / steps));
  }
  let worst = 0;
  for (const p of points) {
    let best = Infinity;
    for (const q of dense) best = Math.min(best, len(sub(q, p)));
    worst = Math.max(worst, best);
  }
  return worst;
}
