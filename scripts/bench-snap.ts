import paperPkg from 'paper';
import { performance } from 'node:perf_hooks';
import type paper from 'paper';

import { mulberry32 } from '../src/lib/algorithms/random';
import { makeDirections, moveHandleToward, snapHandlePositionWithDirs } from '../src/lib/algorithms/snap';
import {
  snapPenalizedNewtonBezierControl,
  snapProjectedGradientBezierControl,
  snapSequentialQPBezierControl
} from '../src/lib/algorithms/snapBezierControl';

const { PaperScope } = paperPkg;

const STRIP_WIDTH = 75;
const CANVAS_SIZE = 600;

type LobeId = 'left' | 'right';

type Finger = {
  id: string;
  lobe: LobeId;
  segments: BezierSegment[];
};

type SnapBenchMethod = 'ray' | 'local8' | 'local32' | 'pgd' | 'sqpproj' | 'newton';

type BenchCounters = { candidateIsValidCalls: number; intersectionChecks: number };

type OracleResult = { point: paper.Point; dist: number; tries: number };

type BezierSegment = { p0: paper.Point; p1: paper.Point; p2: paper.Point; p3: paper.Point };

function now() {
  return performance.now();
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const t = idx - lo;
  return sorted[lo]! * (1 - t) + sorted[hi]! * t;
}

function fmt(ms: number) {
  if (!Number.isFinite(ms)) return 'NaN';
  if (ms < 10) return ms.toFixed(2);
  if (ms < 100) return ms.toFixed(1);
  return ms.toFixed(0);
}

function withInsertItemsDisabled<T>(paper: paper.PaperScope, fn: () => T): T {
  const prev = paper.settings.insertItems;
  paper.settings.insertItems = false;
  try {
    return fn();
  } finally {
    paper.settings.insertItems = prev;
  }
}

function refineTowardDesired<TCandidate>(
  buildCandidateAt: (pos: paper.Point) => TCandidate,
  start: paper.Point,
  desired: paper.Point,
  isValidCandidate: (candidate: TCandidate) => boolean,
  dirs: paper.Point[],
  opts: { minStep?: number; maxStep?: number; itersPerStep?: number } = {}
): { point: paper.Point; dist: number; tries: number } {
  const minStep = opts.minStep ?? 0.25;
  const itersPerStep = opts.itersPerStep ?? 8;
  const maxStep = opts.maxStep ?? 60;

  // Ensure we're on the boundary (or as close as possible along the start->desired segment).
  let pt = moveHandleToward(buildCandidateAt, start, desired, isValidCandidate);
  let bestDist = pt.getDistance(desired);
  let tries = 1;

  let step = Math.min(maxStep, Math.max(4, bestDist));
  while (step >= minStep) {
    for (;;) {
      let improved = false;
      let bestLocal = pt;
      let bestLocalDist = bestDist;

      for (let iter = 0; iter < itersPerStep; iter++) {
        let iterImproved = false;
        for (const dir of dirs) {
          const target = pt.add(dir.multiply(step));
          tries++;
          if (!isValidCandidate(buildCandidateAt(target))) continue;
          const d = target.getDistance(desired);
          if (d + 1e-6 < bestLocalDist) {
            bestLocal = target;
            bestLocalDist = d;
            iterImproved = true;
          }
        }
        if (!iterImproved) break;
        pt = bestLocal;
        bestDist = bestLocalDist;
        improved = true;
      }

      if (!improved) break;

      // After improving inside the feasible region, snap back to the boundary toward desired.
      pt = moveHandleToward(buildCandidateAt, pt, desired, isValidCandidate);
      tries++;
      bestDist = pt.getDistance(desired);
    }

    step /= 2;
  }

  return { point: pt, dist: bestDist, tries };
}

function computeOracleBest<TCandidate>(
  buildCandidateAt: (pos: paper.Point) => TCandidate,
  from: paper.Point,
  desired: paper.Point,
  isValidCandidate: (candidate: TCandidate) => boolean,
  rng: () => number,
  seedPoints: paper.Point[],
  opts: {
    randomRestarts?: number;
    dirs?: number;
  } = {}
): OracleResult {
  const randomRestarts = opts.randomRestarts ?? 12;
  const dirsCount = opts.dirs ?? 64;

  // Start with the best seed we already have.
  let best = seedPoints[0] ?? from;
  best = moveHandleToward(buildCandidateAt, best, desired, isValidCandidate);
  let bestDist = best.getDistance(desired);
  let tries = 1;

  const dirs = makeDirections(from, dirsCount);

  const seeds: paper.Point[] = [];
  for (const p of seedPoints) seeds.push(p);
  seeds.push(best);

  // Add random boundary-ish seeds by shooting from `from` toward random points around `desired`.
  for (let i = 0; i < randomRestarts; i++) {
    const a = rng() * 2 * Math.PI;
    const dir = from.multiply(0);
    dir.x = Math.cos(a);
    dir.y = Math.sin(a);
    const target = desired.add(dir.multiply(bestDist));
    const p = moveHandleToward(buildCandidateAt, from, target, isValidCandidate);
    tries++;
    seeds.push(p);
  }

  // Refine each seed and keep the best.
  for (const seed of seeds) {
    const refined = refineTowardDesired(buildCandidateAt, seed, desired, isValidCandidate, dirs, {
      minStep: 0.25,
      maxStep: Math.min(60, Math.max(8, bestDist)),
      itersPerStep: 8
    });
    tries += refined.tries;
    if (refined.dist + 1e-6 < bestDist) {
      bestDist = refined.dist;
      best = refined.point;
    }
  }

  return { point: best, dist: bestDist, tries };
}

function getSquareParams(strips: number) {
  const squareSize = strips * STRIP_WIDTH;
  const squareLeft = CANVAS_SIZE / 2 - squareSize / 2;
  const squareTop = CANVAS_SIZE / 2 - squareSize / 2;
  const earRadius = squareSize / 2;
  return { squareSize, squareLeft, squareTop, earRadius };
}

function cloneFinger(f: Finger): Finger {
  return {
    id: f.id,
    lobe: f.lobe,
    segments: f.segments.map((s) => ({
      p0: s.p0.clone(),
      p1: s.p1.clone(),
      p2: s.p2.clone(),
      p3: s.p3.clone()
    }))
  };
}

function createDefaultFingers(scope: paper.PaperScope, countPerLobe: number): Finger[] {
  const strips = countPerLobe;
  const { squareSize, squareLeft, squareTop } = getSquareParams(strips);
  const PointCtor = scope.Point;

  const result: Finger[] = [];
  const internal = Math.max(0, strips - 1);

  for (let i = 0; i < internal; i++) {
    const t = (i + 1) / strips;
    const y = squareTop + t * squareSize;
    const p0 = new PointCtor(squareLeft + squareSize, y);
    const p3 = new PointCtor(squareLeft, y);

    const bow = (t - 0.5) * squareSize * 0.12;
    const p1 = new PointCtor(p0.x - squareSize * 0.3, p0.y + bow);
    const p2 = new PointCtor(p3.x + squareSize * 0.3, p3.y - bow);

    result.push({ id: `L-${i}`, lobe: 'left', segments: [{ p0, p1, p2, p3 }] });
  }

  for (let i = 0; i < internal; i++) {
    const t = (i + 1) / strips;
    const x = squareLeft + t * squareSize;
    const p0 = new PointCtor(x, squareTop + squareSize);
    const p3 = new PointCtor(x, squareTop);

    const bow = (t - 0.5) * squareSize * 0.12;
    const p1 = new PointCtor(p0.x + bow, p0.y - squareSize * 0.3);
    const p2 = new PointCtor(p3.x - bow, p3.y + squareSize * 0.3);

    result.push({ id: `R-${i}`, lobe: 'right', segments: [{ p0, p1, p2, p3 }] });
  }

  return result;
}

function boundaryIndexFromId(id: string): number {
  const match = id.match(/^[LR]-(\d+)$/);
  if (!match) return -1;
  return Number(match[1]);
}

function lobePrefix(lobe: LobeId): 'L' | 'R' {
  return lobe === 'left' ? 'L' : 'R';
}

function fingerP0(f: Finger): paper.Point {
  return f.segments[0]!.p0;
}

function fingerP3(f: Finger): paper.Point {
  return f.segments[f.segments.length - 1]!.p3;
}

function splitBezierAt(seg: BezierSegment, t: number): [BezierSegment, BezierSegment] {
  // De Casteljau.
  const p01 = seg.p0.add(seg.p1.subtract(seg.p0).multiply(t));
  const p12 = seg.p1.add(seg.p2.subtract(seg.p1).multiply(t));
  const p23 = seg.p2.add(seg.p3.subtract(seg.p2).multiply(t));

  const p012 = p01.add(p12.subtract(p01).multiply(t));
  const p123 = p12.add(p23.subtract(p12).multiply(t));

  const p0123 = p012.add(p123.subtract(p012).multiply(t));

  return [
    { p0: seg.p0, p1: p01, p2: p012, p3: p0123 },
    { p0: p0123, p1: p123, p2: p23, p3: seg.p3 }
  ];
}

function splitSegmentsToCount(segments: BezierSegment[], targetCount: number): BezierSegment[] {
  let out = segments.slice();
  while (out.length < targetCount) {
    // Split the longest segment (approx by chord length).
    let bestIdx = 0;
    let bestLen = -Infinity;
    for (let i = 0; i < out.length; i++) {
      const s = out[i]!;
      const len = s.p0.getDistance(s.p3);
      if (len > bestLen) {
        bestLen = len;
        bestIdx = i;
      }
    }
    const seg = out[bestIdx]!;
    const [a, b] = splitBezierAt(seg, 0.5);
    out.splice(bestIdx, 1, a, b);
  }
  return out;
}

function withSegmentCount(fingers: Finger[], segmentsPerFinger: number): Finger[] {
  if (segmentsPerFinger <= 1) return fingers.map(cloneFinger);
  return fingers.map((f) => ({ ...f, segments: splitSegmentsToCount(f.segments, segmentsPerFinger) }));
}

function buildFingerPath(scope: paper.PaperScope, finger: Finger): paper.Path {
  const path = new scope.Path();
  const first = finger.segments[0]!;
  path.moveTo(first.p0);
  for (const seg of finger.segments) {
    path.cubicCurveTo(seg.p1, seg.p2, seg.p3);
  }
  return path;
}

function candidateIsValid(
  scope: paper.PaperScope,
  gridSize: number,
  fingers: Finger[],
  candidate: Finger,
  benchActive: boolean,
  counters: BenchCounters
): boolean {
  return withInsertItemsDisabled(scope, () => {
    if (benchActive) counters.candidateIsValidCalls++;

    const { squareSize, squareLeft, squareTop } = getSquareParams(gridSize);
    const minX = squareLeft;
    const maxX = squareLeft + squareSize;
    const minY = squareTop;
    const maxY = squareTop + squareSize;
    const orderEps = 1;
    const tol = 0.5;

    const idx = boundaryIndexFromId(candidate.id);
    const internal = Math.max(0, gridSize - 1);
    const prevId = `${lobePrefix(candidate.lobe)}-${idx - 1}`;
    const nextId = `${lobePrefix(candidate.lobe)}-${idx + 1}`;
  const prev = idx > 0 ? fingers.find((f) => f.id === prevId) : undefined;
  const next = idx < internal - 1 ? fingers.find((f) => f.id === nextId) : undefined;

  if (candidate.lobe === 'left') {
      const p0 = fingerP0(candidate);
      const p3 = fingerP3(candidate);
      const minP0Y = (prev ? fingerP0(prev).y : minY) + orderEps;
      const maxP0Y = (next ? fingerP0(next).y : maxY) - orderEps;
      const minP3Y = (prev ? fingerP3(prev).y : minY) + orderEps;
      const maxP3Y = (next ? fingerP3(next).y : maxY) - orderEps;
      if (p0.y < minP0Y || p0.y > maxP0Y) return false;
      if (p3.y < minP3Y || p3.y > maxP3Y) return false;
    } else {
      const p0 = fingerP0(candidate);
      const p3 = fingerP3(candidate);
      const minP0X = (prev ? fingerP0(prev).x : minX) + orderEps;
      const maxP0X = (next ? fingerP0(next).x : maxX) - orderEps;
      const minP3X = (prev ? fingerP3(prev).x : minX) + orderEps;
      const maxP3X = (next ? fingerP3(next).x : maxX) - orderEps;
      if (p0.x < minP0X || p0.x > maxP0X) return false;
      if (p3.x < minP3X || p3.x > maxP3X) return false;
    }

    const candidatePath = buildFingerPath(scope, candidate);
    const bounds = candidatePath.bounds;
    const insideSquare =
      bounds.left >= minX - tol &&
      bounds.right <= maxX + tol &&
      bounds.top >= minY - tol &&
      bounds.bottom <= maxY + tol;
    if (!insideSquare) {
      candidatePath.remove();
      return false;
    }

    for (const other of fingers) {
      if (other.id === candidate.id) continue;
      if (other.lobe !== candidate.lobe) continue;
      const otherPath = buildFingerPath(scope, other);
      if (benchActive) counters.intersectionChecks++;
      const intersections = candidatePath.getIntersections(otherPath);
      otherPath.remove();
      if (intersections.length > 0) {
        candidatePath.remove();
        return false;
      }
    }

    candidatePath.remove();
    return true;
  });
}

function buildObstaclePaths(scope: paper.PaperScope, fingers: Finger[], targetId: string, lobe: LobeId): paper.Path[] {
  return withInsertItemsDisabled(scope, () =>
    fingers
      .filter((f) => f.id !== targetId && f.lobe === lobe)
      .map((f) => buildFingerPath(scope, f))
  );
}

function summarizeMethod(
  ms: number[],
  dist: number[],
  gap: number[],
  optGap: number[],
  posGap: number[],
  iterations: number[],
  ok: number,
  total: number,
  bestHits: number,
  validCalls: number,
  intersectionChecks: number
) {
  const msSorted = ms.slice().sort((a, b) => a - b);
  const distSorted = dist.slice().sort((a, b) => a - b);
  const gapSorted = gap.slice().sort((a, b) => a - b);

  const optGapFinite = optGap.filter(Number.isFinite);
  const posGapFinite = posGap.filter(Number.isFinite);
  const optGapSorted = optGapFinite.slice().sort((a, b) => a - b);
  const posGapSorted = posGapFinite.slice().sort((a, b) => a - b);

  const msTotal = ms.reduce((a, b) => a + b, 0);
  const distTotal = dist.reduce((a, b) => a + b, 0);
  const gapTotal = gap.reduce((a, b) => a + b, 0);
  const optGapTotal = optGapFinite.reduce((a, b) => a + b, 0);
  const posGapTotal = posGapFinite.reduce((a, b) => a + b, 0);
  const iterTotal = iterations.reduce((a, b) => a + b, 0);
  return {
    total,
    successRate: total ? ok / total : 0,
    bestRate: total ? bestHits / total : 0,
    distAvg: total ? distTotal / total : 0,
    distP95: quantile(distSorted, 0.95),
    gapAvg: total ? gapTotal / total : 0,
    gapP95: quantile(gapSorted, 0.95),
    optGapAvg: optGapFinite.length ? optGapTotal / optGapFinite.length : NaN,
    optGapP95: quantile(optGapSorted, 0.95),
    posGapAvg: posGapFinite.length ? posGapTotal / posGapFinite.length : NaN,
    posGapP95: quantile(posGapSorted, 0.95),
    msAvg: total ? msTotal / total : 0,
    msP95: quantile(msSorted, 0.95),
    validCalls,
    intersectionChecks,
    iterationsAvg: total ? iterTotal / total : 0
  };
}

async function runSnapBench({
  gridSize = 8,
  hearts = 25,
  randomSteps = 200,
  cases = 300,
  seed = 1337,
  segmentsPerFinger = 1,
  pointKey = 'p1' as 'p1' | 'p2',
  methods = ['ray', 'local8', 'local32', 'pgd', 'sqpproj', 'newton'] as SnapBenchMethod[]
} = {}) {
  const paper = new PaperScope();
  paper.setup([CANVAS_SIZE, CANVAS_SIZE]);

  const rng = mulberry32(seed);
  const { squareSize, squareLeft, squareTop } = getSquareParams(gridSize);
  const square = {
    minX: squareLeft,
    maxX: squareLeft + squareSize,
    minY: squareTop,
    maxY: squareTop + squareSize
  };

  // Generate random valid hearts by perturbing control points with rejection sampling.
  const randomHearts: Finger[][] = [];
  const counters: BenchCounters = { candidateIsValidCalls: 0, intersectionChecks: 0 };
  let benchActive = false;

  for (let h = 0; h < hearts; h++) {
    let fingers = withSegmentCount(createDefaultFingers(paper, gridSize), segmentsPerFinger);
    const range = squareSize * 0.18;
    for (let s = 0; s < randomSteps; s++) {
      const idx = Math.floor(rng() * fingers.length);
      const f = fingers[idx];
      if (!f) continue;
      const segIdx = Math.floor(rng() * f.segments.length);
      const seg = f.segments[segIdx]!;
      const key: 'p1' | 'p2' = rng() < 0.5 ? 'p1' : 'p2';
      const delta = new paper.Point((rng() * 2 - 1) * range, (rng() * 2 - 1) * range);
      const nextPos = seg[key].add(delta);
      const nextSegments = f.segments.slice();
      nextSegments[segIdx] = { ...seg, [key]: nextPos } as BezierSegment;
      const candidate: Finger = { ...f, segments: nextSegments };
      if (candidateIsValid(paper, gridSize, fingers, candidate, benchActive, counters)) {
        fingers = fingers.map((ff) => (ff.id === f.id ? candidate : ff));
      }
    }
    randomHearts.push(fingers.map(cloneFinger));
  }

  // Per-method accumulators.
  const stats = new Map<
    SnapBenchMethod,
    {
      ms: number[];
      dist: number[];
      gap: number[];
      optGap: number[];
      posGap: number[];
      ok: number;
      total: number;
      bestHits: number;
      validCalls: number;
      intersectionChecks: number;
      iterations: number[];
    }
  >();
  for (const m of methods) {
    stats.set(m, {
      ms: [],
      dist: [],
      gap: [],
      optGap: [],
      posGap: [],
      ok: 0,
      total: 0,
      bestHits: 0,
      validCalls: 0,
      intersectionChecks: 0,
      iterations: []
    });
  }

  benchActive = true;
  counters.candidateIsValidCalls = 0;
  counters.intersectionChecks = 0;

  const obstacleBuildMs: number[] = [];

  let produced = 0;
  let attempts = 0;
  while (produced < cases && attempts < cases * 10) {
    attempts++;
    const heart = randomHearts[Math.floor(rng() * randomHearts.length)];
    if (!heart) break;
    const fingers = heart;

    const internal = Math.max(0, gridSize - 1);
    const idx = Math.floor(rng() * internal);
    const lobe: LobeId = rng() < 0.5 ? 'left' : 'right';
    const targetId = `${lobePrefix(lobe)}-${idx}`;
    const base = fingers.find((f) => f.id === targetId);
    if (!base) continue;
    const segIdx = Math.floor(rng() * base.segments.length);
    const baseSeg = base.segments[segIdx]!;
    const from = baseSeg[pointKey];

    // Pick a random desired location in the square; prefer invalid to stress snapping.
    let desired: paper.Point | null = null;
    for (let k = 0; k < 20; k++) {
      const candDesired = new paper.Point(square.minX + rng() * squareSize, square.minY + rng() * squareSize);
      const candSegs = base.segments.slice();
      candSegs[segIdx] = { ...baseSeg, [pointKey]: candDesired } as BezierSegment;
      const candidate: Finger = { ...base, segments: candSegs };
      if (!candidateIsValid(paper, gridSize, fingers, candidate, benchActive, counters)) {
        desired = candDesired;
        break;
      }
    }
    if (!desired) continue;

    const buildCandidateAt = (pos: paper.Point): Finger => {
      const segs = base.segments.slice();
      segs[segIdx] = { ...baseSeg, [pointKey]: pos } as BezierSegment;
      return { ...base, segments: segs };
    };
    const isValidCandidate = (candidate: Finger): boolean =>
      candidateIsValid(paper, gridSize, fingers, candidate, benchActive, counters);

    // Build obstacle paths once per case for obstacle-aware methods.
    const obs0 = now();
    const obstacles = buildObstaclePaths(paper, fingers, targetId, base.lobe);
    const obs1 = now();
    obstacleBuildMs.push(obs1 - obs0);
    const p0 = baseSeg.p0;
    const p3 = baseSeg.p3;
    const other = pointKey === 'p1' ? baseSeg.p2 : baseSeg.p1;

    const caseResults = new Map<SnapBenchMethod, { point: paper.Point; dist: number; ok: boolean }>();

    for (const method of methods) {
      const s = stats.get(method);
      if (!s) continue;
      s.total++;

      const beforeCalls = counters.candidateIsValidCalls;
      const beforeIntersections = counters.intersectionChecks;

      const t0 = now();
      let out: { point: paper.Point; iterations: number };

      if (method === 'ray') {
        out = { point: moveHandleToward(buildCandidateAt, from, desired, isValidCandidate), iterations: 1 };
      } else if (method === 'local8') {
        out = snapHandlePositionWithDirs(buildCandidateAt, from, desired, isValidCandidate, makeDirections(from, 8), 4);
      } else if (method === 'local32') {
        out = snapHandlePositionWithDirs(buildCandidateAt, from, desired, isValidCandidate, makeDirections(from, 32), 2);
      } else if (method === 'pgd') {
        out = snapProjectedGradientBezierControl(
          buildCandidateAt,
          from,
          desired,
          isValidCandidate,
          pointKey,
          p0,
          other,
          p3,
          obstacles,
          square
        );
      } else if (method === 'sqpproj') {
        out = snapSequentialQPBezierControl(
          buildCandidateAt,
          from,
          desired,
          isValidCandidate,
          pointKey,
          p0,
          other,
          p3,
          obstacles,
          square
        );
      } else {
        out = snapPenalizedNewtonBezierControl(
          buildCandidateAt,
          from,
          desired,
          isValidCandidate,
          pointKey,
          p0,
          other,
          p3,
          obstacles,
          square
        );
      }
      const t1 = now();

      const afterCalls = counters.candidateIsValidCalls;
      const afterIntersections = counters.intersectionChecks;
      s.validCalls += afterCalls - beforeCalls;
      s.intersectionChecks += afterIntersections - beforeIntersections;

      s.ms.push(t1 - t0);
      const distToDesired = out.point.getDistance(desired);
      s.dist.push(distToDesired);
      s.iterations.push(out.iterations);

      // Validate without affecting counters.
      const prevBench = benchActive;
      benchActive = false;
      const ok = isValidCandidate(buildCandidateAt(out.point));
      benchActive = prevBench;
      if (ok) s.ok++;
      caseResults.set(method, { point: out.point, dist: distToDesired, ok });
    }

    // Compute per-case best known distance (min among valid results) and record gaps.
    let best = Infinity;
    for (const { dist, ok } of caseResults.values()) {
      if (!ok) continue;
      if (dist < best) best = dist;
    }
    if (!Number.isFinite(best)) best = Infinity;

    const bestEps = 1e-6;
    for (const method of methods) {
      const s = stats.get(method);
      const r = caseResults.get(method);
      if (!s || !r || !Number.isFinite(best)) continue;
      const gap = r.ok ? r.dist - best : Infinity;
      s.gap.push(gap);
      if (r.ok && r.dist <= best + bestEps) s.bestHits++;
    }

    // Compute a heavy "oracle" approximation of the true optimum and record optimality gaps.
    const prevBench = benchActive;
    benchActive = false;
    const seedPoints = Array.from(caseResults.values())
      .filter((r) => r.ok)
      .map((r) => r.point);
    seedPoints.sort((a, b) => a.getDistance(desired) - b.getDistance(desired));
    seedPoints.unshift(from);
    const oracle = computeOracleBest(buildCandidateAt, from, desired, isValidCandidate, rng, seedPoints, {
      randomRestarts: 12,
      dirs: 64
    });
    benchActive = prevBench;

    for (const method of methods) {
      const s = stats.get(method);
      const r = caseResults.get(method);
      if (!s || !r) continue;
      s.optGap.push(r.ok ? r.dist - oracle.dist : Infinity);
      s.posGap.push(r.ok ? r.point.getDistance(oracle.point) : Infinity);
    }

    for (const p of obstacles) p.remove();

    produced++;
    if (produced % 50 === 0) {
      // Clear any project items that might have slipped in (best-effort).
      paper.project.clear();
    }
  }

  console.log(
    `\nSnap bench gridSize=${gridSize}, segs=${segmentsPerFinger}, hearts=${hearts}, randomSteps=${randomSteps}, cases=${produced}, pointKey=${pointKey}`
  );
  if (obstacleBuildMs.length) {
    const sorted = obstacleBuildMs.slice().sort((a, b) => a - b);
    const mean = obstacleBuildMs.reduce((a, b) => a + b, 0) / obstacleBuildMs.length;
    console.log(`obstacles: build ms avg=${fmt(mean)}, p95=${fmt(quantile(sorted, 0.95))}`);
  }
  console.log(
    'method    ok%  best%  msAvg  msP95  optGap optP95  posGap posP95  distAvg  distP95  validCalls  intersections  itersAvg'
  );

  for (const method of methods) {
    const s = stats.get(method);
    if (!s) continue;
    const summary = summarizeMethod(
      s.ms,
      s.dist,
      s.gap,
      s.optGap,
      s.posGap,
      s.iterations,
      s.ok,
      s.total,
      s.bestHits,
      s.validCalls,
      s.intersectionChecks
    );
    console.log(
      `${method.padEnd(8)} ${(summary.successRate * 100).toFixed(1).padStart(5)} ` +
        `${(summary.bestRate * 100).toFixed(1).padStart(6)} ` +
        `${fmt(summary.msAvg).padStart(6)} ${fmt(summary.msP95).padStart(6)} ` +
        `${fmt(summary.optGapAvg).padStart(6)} ${fmt(summary.optGapP95).padStart(6)} ` +
        `${fmt(summary.posGapAvg).padStart(6)} ${fmt(summary.posGapP95).padStart(6)} ` +
        `${summary.distAvg.toFixed(2).padStart(8)} ${summary.distP95.toFixed(2).padStart(8)} ` +
        `${String(summary.validCalls).padStart(10)} ${String(summary.intersectionChecks).padStart(13)} ` +
        `${summary.iterationsAvg.toFixed(2).padStart(8)}`
    );
  }

  paper.project.clear();
}

async function main() {
  const cases = 200;
  await runSnapBench({ pointKey: 'p1', segmentsPerFinger: 2, cases });
  await runSnapBench({ pointKey: 'p2', segmentsPerFinger: 2, cases });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
