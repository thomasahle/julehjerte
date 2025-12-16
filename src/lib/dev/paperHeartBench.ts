import { mulberry32 } from '$lib/algorithms/random';
import {
  snapPenalizedNewtonBezierControl,
  snapProjectedGradientBezierControl,
  snapSequentialQPBezierControl,
  snapSequentialQPBezierJunction
} from '$lib/algorithms/snapBezierControl';
import {
  makeDirections,
  moveHandleToward as moveHandleTowardPoint,
  snapHandlePositionWithDirs as snapHandlePositionWithDirsPoint
} from '$lib/algorithms/snap';

type IntersectionBenchMode = 'candidate-p1' | 'snap-p1' | 'candidate-midpoint';
type IntersectionBenchOptions = {
  gridSize?: number;
  cases?: number;
  mode?: IntersectionBenchMode;
  multiSegment?: boolean;
};
type IntersectionBenchResult = {
  gridSize: number;
  cases: number;
  mode: IntersectionBenchMode;
  multiSegment: boolean;
  candidateIsValidCalls: number;
  intersectionChecks: number;
  msTotal: number;
  msAvg: number;
  msP95: number;
};

type SnapBenchMethod = 'ray' | 'local8' | 'local32' | 'pgd' | 'sqpproj' | 'newton';
type SnapBenchOptions = {
  gridSize?: number;
  hearts?: number;
  randomSteps?: number;
  cases?: number;
  seed?: number;
  methods?: SnapBenchMethod[];
  pointKey?: 'p1' | 'p2';
};
type SnapBenchMethodResult = {
  method: SnapBenchMethod;
  cases: number;
  successRate: number;
  distAvg: number;
  distP95: number;
  msAvg: number;
  msP95: number;
  validCallsTotal: number;
  intersectionChecksTotal: number;
  iterationsAvg: number;
};
type SnapBenchResult = {
  gridSize: number;
  hearts: number;
  randomSteps: number;
  cases: number;
  pointKey: 'p1' | 'p2';
  methods: SnapBenchMethodResult[];
};

type Vec = { x: number; y: number };
type BezierSegment = { p0: Vec; p1: Vec; p2: Vec; p3: Vec };

function cloneSegments(segments: BezierSegment[]): BezierSegment[] {
  return segments.map((seg) => ({
    p0: { ...seg.p0 },
    p1: { ...seg.p1 },
    p2: { ...seg.p2 },
    p3: { ...seg.p3 }
  }));
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1));
  return sorted[idx]!;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

async function runSnapBench(ctx: any, opts: SnapBenchOptions = {}): Promise<SnapBenchResult> {
  if (!ctx.paperReady || !ctx.paper?.project) {
    throw new Error('PaperHeart not ready');
  }

  const benchGridSize = opts.gridSize ?? 8;
  const hearts = opts.hearts ?? 25;
  const randomSteps = opts.randomSteps ?? 200;
  const cases = opts.cases ?? 300;
  const seed = opts.seed ?? 1337;
  const pointKey: 'p1' | 'p2' = opts.pointKey ?? 'p1';
  const methods: SnapBenchMethod[] = opts.methods ?? ['ray', 'local8', 'local32', 'pgd', 'sqpproj', 'newton'];

  const saved = {
    gridSize: ctx.gridSize,
    lastGridSize: ctx.lastGridSize,
    fingers: ctx.fingers.map((f: any) => ({ ...f })),
    selectedFingerId: ctx.selectedFingerId,
    dragTarget: ctx.dragTarget,
    symmetryWithinCurve: ctx.symmetryWithinCurve,
    symmetryWithinLobe: ctx.symmetryWithinLobe,
    symmetryBetweenLobes: ctx.symmetryBetweenLobes,
    antiWithinCurve: ctx.antiWithinCurve,
    antiWithinLobe: ctx.antiWithinLobe,
    antiBetweenLobes: ctx.antiBetweenLobes,
    showCurves: ctx.showCurves
  };

  try {
    ctx.lastGridSize = benchGridSize;
    ctx.gridSize = benchGridSize;
    ctx.showCurves = false;
    ctx.symmetryWithinCurve = false;
    ctx.symmetryWithinLobe = false;
    ctx.symmetryBetweenLobes = false;
    ctx.antiWithinCurve = false;
    ctx.antiWithinLobe = false;
    ctx.antiBetweenLobes = false;
    ctx.selectedFingerId = null;
    ctx.dragTarget = null;

    const rng = mulberry32(seed);
    const { squareSize, squareLeft, squareTop } = ctx.getSquareParams(benchGridSize);
    const square = {
      minX: squareLeft,
      maxX: squareLeft + squareSize,
      minY: squareTop,
      maxY: squareTop + squareSize
    };

    const randomHearts: any[] = [];
    ctx.benchActive = false;
    ctx.benchCounters = { candidateIsValidCalls: 0, intersectionChecks: 0 };

    for (let h = 0; h < hearts; h++) {
      ctx.fingers = ctx.createDefaultFingers(benchGridSize);
      const range = squareSize * 0.18;
      for (let s = 0; s < randomSteps; s++) {
        const idx = Math.floor(rng() * ctx.fingers.length);
        const f = ctx.fingers[idx];
        if (!f) continue;
        const key: 'p1' | 'p2' = rng() < 0.5 ? 'p1' : 'p2';
        const delta = new ctx.paper.Point((rng() * 2 - 1) * range, (rng() * 2 - 1) * range);
        const nextPosPoint = ctx.toPoint(f[key]).add(delta);
        const candidate = { ...f, [key]: { x: nextPosPoint.x, y: nextPosPoint.y } };
        if (ctx.candidateIsValid(f.id, candidate)) {
          ctx.fingers = ctx.fingers.map((ff: any) => (ff.id === f.id ? candidate : ff));
        }
      }
      randomHearts.push(ctx.fingers.map((f: any) => ({ ...f })));
    }

    const methodStats = new Map<
      SnapBenchMethod,
      {
        ms: number[];
        dist: number[];
        ok: number;
        total: number;
        validCalls: number;
        intersectionChecks: number;
        iterations: number[];
      }
    >();
    for (const m of methods) {
      methodStats.set(m, {
        ms: [],
        dist: [],
        ok: 0,
        total: 0,
        validCalls: 0,
        intersectionChecks: 0,
        iterations: []
      });
    }

    ctx.benchActive = true;
    ctx.benchCounters = { candidateIsValidCalls: 0, intersectionChecks: 0 };

    let produced = 0;
    let attempts = 0;
    while (produced < cases && attempts < cases * 10) {
      attempts++;
      const heart = randomHearts[Math.floor(rng() * randomHearts.length)];
      if (!heart) break;
      ctx.fingers = heart;

      const internal = Math.max(0, benchGridSize - 1);
      const idx = Math.floor(rng() * internal);
      const lobe = rng() < 0.5 ? 'left' : 'right';
      const targetId = `${ctx.lobePrefix(lobe)}-${idx}`;
      const base = ctx.getFingerById(targetId);
      if (!base) continue;
      const baseSegments = ctx.fingerToSegments(base) as BezierSegment[];
      const seg0 = baseSegments[0];
      if (!seg0) continue;
      const from = ctx.toPoint(pointKey === 'p1' ? seg0.p1 : seg0.p2);

      let desired: any = null;
      for (let k = 0; k < 20; k++) {
        const candDesired = new ctx.paper.Point(square.minX + rng() * squareSize, square.minY + rng() * squareSize);
        const segs = cloneSegments(baseSegments);
        if (pointKey === 'p1') segs[0]!.p1 = { x: candDesired.x, y: candDesired.y };
        else segs[0]!.p2 = { x: candDesired.x, y: candDesired.y };
        const candidate = ctx.updateFingerSegments(base, segs);
        if (!ctx.candidateIsValid(targetId, candidate)) {
          desired = candDesired;
          break;
        }
      }
      if (!desired) continue;

      const buildCandidateAt = (pos: any) => {
        const segs = cloneSegments(baseSegments);
        if (pointKey === 'p1') segs[0]!.p1 = { x: pos.x, y: pos.y };
        else segs[0]!.p2 = { x: pos.x, y: pos.y };
        return ctx.updateFingerSegments(base, segs);
      };
      const isValidCandidate = (candidate: any) => ctx.candidateIsValid(targetId, candidate);

      const obstacles = ctx.withInsertItemsDisabled(() => ctx.buildObstaclePaths(targetId, base.lobe));

      for (const method of methods) {
        const stats = methodStats.get(method);
        if (!stats) continue;
        stats.total++;

        const beforeCalls = ctx.benchCounters.candidateIsValidCalls;
        const beforeIntersections = ctx.benchCounters.intersectionChecks;

        const t0 = performance.now();
        let out: { point: any; iterations: number };

        if (method === 'ray') {
          const pt = moveHandleTowardPoint(buildCandidateAt, from, desired, isValidCandidate);
          out = { point: pt, iterations: 1 };
        } else if (method === 'local8') {
          out = snapHandlePositionWithDirsPoint(
            buildCandidateAt,
            from,
            desired,
            isValidCandidate,
            makeDirections(from, 8),
            4
          );
        } else if (method === 'local32') {
          out = snapHandlePositionWithDirsPoint(
            buildCandidateAt,
            from,
            desired,
            isValidCandidate,
            makeDirections(from, 32),
            2
          );
        } else if (method === 'pgd') {
          const p0 = ctx.toPoint(seg0.p0);
          const p3 = ctx.toPoint(seg0.p3);
          const other = pointKey === 'p1' ? ctx.toPoint(seg0.p2) : ctx.toPoint(seg0.p1);
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
          const p0 = ctx.toPoint(seg0.p0);
          const p3 = ctx.toPoint(seg0.p3);
          const other = pointKey === 'p1' ? ctx.toPoint(seg0.p2) : ctx.toPoint(seg0.p1);
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
          const p0 = ctx.toPoint(seg0.p0);
          const p3 = ctx.toPoint(seg0.p3);
          const other = pointKey === 'p1' ? ctx.toPoint(seg0.p2) : ctx.toPoint(seg0.p1);
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
        const t1 = performance.now();

        const afterCalls = ctx.benchCounters.candidateIsValidCalls;
        const afterIntersections = ctx.benchCounters.intersectionChecks;
        stats.validCalls += afterCalls - beforeCalls;
        stats.intersectionChecks += afterIntersections - beforeIntersections;

        stats.ms.push(t1 - t0);
        stats.dist.push(out.point.getDistance(desired));
        stats.iterations.push(out.iterations);

        const okCandidate = buildCandidateAt(out.point);
        if (ctx.candidateIsValid(targetId, okCandidate)) stats.ok++;
      }

      for (const p of obstacles) p.remove();
      produced++;
    }

    ctx.benchActive = false;

    const results: SnapBenchMethodResult[] = [];
    for (const method of methods) {
      const stats = methodStats.get(method);
      if (!stats) continue;
      const msSorted = stats.ms.slice().sort((a, b) => a - b);
      const distSorted = stats.dist.slice().sort((a, b) => a - b);
      const msTotal = stats.ms.reduce((a, b) => a + b, 0);
      const distTotal = stats.dist.reduce((a, b) => a + b, 0);
      const iterTotal = stats.iterations.reduce((a, b) => a + b, 0);
      results.push({
        method,
        cases: stats.total,
        successRate: stats.total ? stats.ok / stats.total : 0,
        distAvg: stats.total ? distTotal / stats.total : 0,
        distP95: percentile(distSorted, 0.95),
        msAvg: stats.total ? msTotal / stats.total : 0,
        msP95: percentile(msSorted, 0.95),
        validCallsTotal: stats.validCalls,
        intersectionChecksTotal: stats.intersectionChecks,
        iterationsAvg: stats.total ? iterTotal / stats.total : 0
      });
    }

    return {
      gridSize: benchGridSize,
      hearts,
      randomSteps,
      cases: produced,
      pointKey,
      methods: results
    };
  } finally {
    ctx.benchActive = false;
    ctx.benchCounters = { candidateIsValidCalls: 0, intersectionChecks: 0 };
    ctx.lastGridSize = saved.lastGridSize;
    ctx.gridSize = saved.gridSize;
    ctx.fingers = saved.fingers;
    ctx.selectedFingerId = saved.selectedFingerId;
    ctx.dragTarget = saved.dragTarget;
    ctx.symmetryWithinCurve = saved.symmetryWithinCurve;
    ctx.symmetryWithinLobe = saved.symmetryWithinLobe;
    ctx.symmetryBetweenLobes = saved.symmetryBetweenLobes;
    ctx.antiWithinCurve = saved.antiWithinCurve;
    ctx.antiWithinLobe = saved.antiWithinLobe;
    ctx.antiBetweenLobes = saved.antiBetweenLobes;
    ctx.showCurves = saved.showCurves;
    ctx.draw();
  }
}

async function runIntersectionBench(
  ctx: any,
  opts: IntersectionBenchOptions = {}
): Promise<IntersectionBenchResult> {
  if (!ctx.paperReady || !ctx.paper?.project) {
    throw new Error('PaperHeart not ready');
  }

  const mode: IntersectionBenchMode = opts.mode ?? 'snap-p1';
  const benchGridSize = opts.gridSize ?? 8;
  const cases = opts.cases ?? 200;
  const multiSegment = Boolean(opts.multiSegment);

  const saved = {
    gridSize: ctx.gridSize,
    lastGridSize: ctx.lastGridSize,
    fingers: ctx.fingers.map((f: any) => ({ ...f })),
    selectedFingerId: ctx.selectedFingerId,
    dragTarget: ctx.dragTarget,
    symmetryWithinCurve: ctx.symmetryWithinCurve,
    symmetryWithinLobe: ctx.symmetryWithinLobe,
    symmetryBetweenLobes: ctx.symmetryBetweenLobes,
    antiWithinCurve: ctx.antiWithinCurve,
    antiWithinLobe: ctx.antiWithinLobe,
    antiBetweenLobes: ctx.antiBetweenLobes,
    showCurves: ctx.showCurves
  };

  try {
    ctx.lastGridSize = benchGridSize;
    ctx.gridSize = benchGridSize;
    ctx.showCurves = false;
    ctx.symmetryWithinCurve = false;
    ctx.symmetryWithinLobe = false;
    ctx.symmetryBetweenLobes = false;
    ctx.antiWithinCurve = false;
    ctx.antiWithinLobe = false;
    ctx.antiBetweenLobes = false;
    ctx.fingers = ctx.createDefaultFingers(benchGridSize);
    ctx.selectedFingerId = null;
    ctx.dragTarget = null;

    const targetId = `L-${Math.max(0, Math.min(benchGridSize - 2, 3))}`;
    const target = ctx.getFingerById(targetId);
    if (!target) {
      throw new Error('No target finger found for benchmark');
    }

    if (multiSegment) {
      const tmp = ctx.getFingerById(targetId);
      if (tmp) {
        let segs = ctx.fingerToSegments(tmp);
        const [a, b] = ctx.splitBezierAt(segs[0], 0.5);
        segs = [a, b];
        const [c, d] = ctx.splitBezierAt(segs[0], 0.5);
        segs = [c, d, segs[1]];
        ctx.updateFinger(targetId, (f: any) => ctx.updateFingerSegments(f, segs));
      }
    }

    const { squareSize, squareLeft, squareTop } = ctx.getSquareParams(benchGridSize);
    const minX = squareLeft;
    const maxX = squareLeft + squareSize;
    const minY = squareTop;
    const maxY = squareTop + squareSize;

    const durations: number[] = [];
    ctx.benchCounters = { candidateIsValidCalls: 0, intersectionChecks: 0 };
    ctx.benchActive = true;

    for (let i = 0; i < cases; i++) {
      const base = ctx.getFingerById(targetId);
      if (!base) break;

      const desired =
        base.lobe === 'left'
          ? { x: randomBetween(minX, maxX), y: randomBetween(minY, maxY) }
          : { x: randomBetween(minX, maxX), y: randomBetween(minY, maxY) };

      const t0 = performance.now();

      if (mode === 'candidate-p1') {
        const baseSegments = ctx.fingerToSegments(base) as BezierSegment[];
        if (baseSegments.length) {
          const segs = cloneSegments(baseSegments);
          segs[0]!.p1 = desired;
          const candidate = ctx.updateFingerSegments(base, segs);
          ctx.candidateIsValid(targetId, candidate);
        } else {
          ctx.candidateIsValid(targetId, base);
        }
      } else if (mode === 'candidate-midpoint') {
        const segments = ctx.fingerToSegments(base);
        if (segments.length >= 2) {
          const segIdx = Math.min(1, segments.length - 1);
          const oldPos = segments[segIdx].p0;
          const delta = { x: randomBetween(-20, 20), y: randomBetween(-20, 20) };
          const newPos = { x: oldPos.x + delta.x, y: oldPos.y + delta.y };
          const cand = ctx.buildSegmentUpdateCandidate(base, segIdx, `seg${segIdx}_p0`, newPos);
          if (cand) {
            const overrides = ctx.deriveSymmetryOverrides(cand);
            ctx.overridesAreValid(overrides);
          }
        } else {
          ctx.candidateIsValid(targetId, base);
        }
      } else {
        const baseSegments = ctx.fingerToSegments(base) as BezierSegment[];
        const seg0 = baseSegments[0];
        if (!seg0) {
          ctx.candidateIsValid(targetId, base);
        } else {
          const from = ctx.toPoint(seg0.p1);
          const desiredPt = ctx.toPoint(desired);

          const buildCandidateAtPoint = (pos: any) => {
            const segs = cloneSegments(baseSegments);
            segs[0]!.p1 = { x: pos.x, y: pos.y };
            return ctx.updateFingerSegments(base, segs);
          };

          const isValidCandidate = (candidate: any) =>
            ctx.overridesAreValid(ctx.deriveSymmetryOverrides(candidate));

          const obstacles = ctx.withInsertItemsDisabled(() => ctx.buildObstaclePaths(targetId, base.lobe));
          try {
            snapSequentialQPBezierControl(
              buildCandidateAtPoint,
              from,
              desiredPt,
              isValidCandidate,
              'p1',
              ctx.toPoint(seg0.p0),
              ctx.toPoint(seg0.p2),
              ctx.toPoint(seg0.p3),
              obstacles,
              { minX, maxX, minY, maxY }
            );
          } finally {
            for (const p of obstacles) p.remove();
          }
        }
      }

      const t1 = performance.now();
      durations.push(t1 - t0);
    }

    ctx.benchActive = false;
    const sorted = durations.slice().sort((a, b) => a - b);
    const msTotal = durations.reduce((a, b) => a + b, 0);

    return {
      gridSize: benchGridSize,
      cases: durations.length,
      mode,
      multiSegment,
      candidateIsValidCalls: ctx.benchCounters.candidateIsValidCalls,
      intersectionChecks: ctx.benchCounters.intersectionChecks,
      msTotal,
      msAvg: durations.length ? msTotal / durations.length : 0,
      msP95: percentile(sorted, 0.95)
    };
  } finally {
    ctx.benchActive = false;
    ctx.benchCounters = { candidateIsValidCalls: 0, intersectionChecks: 0 };
    ctx.lastGridSize = saved.lastGridSize;
    ctx.gridSize = saved.gridSize;
    ctx.fingers = saved.fingers;
    ctx.selectedFingerId = saved.selectedFingerId;
    ctx.dragTarget = saved.dragTarget;
    ctx.symmetryWithinCurve = saved.symmetryWithinCurve;
    ctx.symmetryWithinLobe = saved.symmetryWithinLobe;
    ctx.symmetryBetweenLobes = saved.symmetryBetweenLobes;
    ctx.antiWithinCurve = saved.antiWithinCurve;
    ctx.antiWithinLobe = saved.antiWithinLobe;
    ctx.antiBetweenLobes = saved.antiBetweenLobes;
    ctx.showCurves = saved.showCurves;
    ctx.draw();
  }
}

export function attachPaperHeartBench(target: any, ctx: any): () => void {
  const api = {
    runIntersectionBench: (opts: IntersectionBenchOptions) => runIntersectionBench(ctx, opts),
    runSnapBench: (opts: SnapBenchOptions) => runSnapBench(ctx, opts)
  };

  target.__julefletPaperHeartBench = api;
  return () => {
    if (target.__julefletPaperHeartBench === api) {
      delete target.__julefletPaperHeartBench;
    }
  };
}
