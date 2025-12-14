<script lang="ts">
  import { onMount } from 'svelte';
  import paperPkg from 'paper';
  import type { Finger, Vec, LobeId } from '$lib/types/heart';

  // Each component instance gets its own Paper.js scope
  const { PaperScope } = paperPkg;
  let paper: paper.PaperScope = new PaperScope();

  type ControlPointKey = 'p0' | 'p1' | 'p2' | 'p3' | `seg${number}_p${'0' | '1' | '2' | '3'}`;

  type DragTarget =
    | { kind: 'control'; fingerId: string; pointKey: ControlPointKey; segmentIndex?: number }
    | { kind: 'path'; fingerId: string }
    | null;

  // Props
  interface Props {
    readonly?: boolean;
    initialFingers?: Finger[];
    initialGridSize?: number;
    size?: number;
    onFingersChange?: (fingers: Finger[], gridSize: number) => void;
  }

  let {
    readonly = false,
    initialFingers = undefined,
    initialGridSize = 3,
    size = 600,
    onFingersChange = undefined
  }: Props = $props();

  const BASE_CANVAS_SIZE = 600;
  const CENTER: Vec = { x: BASE_CANVAS_SIZE / 2, y: BASE_CANVAS_SIZE / 2 };
  const ROTATION_RAD = Math.PI / 4;
  const STRIP_WIDTH = 50;
  const LEFT_FILL = { r: 1, g: 1, b: 1, a: 1 };  // White
  const RIGHT_FILL = { r: 0.85, g: 0.15, b: 0.15, a: 1 };  // Red

  // Reference grid size for normalization (so all hearts appear same size)
  const REFERENCE_GRID_SIZE = 4;

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function rotateVecAroundCenter(v: Vec, angleRad: number): Vec {
    const sin = Math.sin(angleRad);
    const cos = Math.cos(angleRad);
    const dx = v.x - CENTER.x;
    const dy = v.y - CENTER.y;
    return {
      x: CENTER.x + dx * cos - dy * sin,
      y: CENTER.y + dx * sin + dy * cos
    };
  }

  function unrotatePoint(p: paper.Point): Vec {
    return rotateVecAroundCenter({ x: p.x, y: p.y }, -ROTATION_RAD);
  }

  function unrotateDelta(delta: paper.Point): Vec {
    const sin = Math.sin(-ROTATION_RAD);
    const cos = Math.cos(-ROTATION_RAD);
    return {
      x: delta.x * cos - delta.y * sin,
      y: delta.x * sin + delta.y * cos
    };
  }

  function toPoint(v: Vec): paper.Point {
    return new paper.Point(v.x, v.y);
  }

  let canvas: HTMLCanvasElement;
  let initialized = $state(false);
  let paperReady = $state(false);

  // Editing controls
  let gridSize = $state(initialGridSize); // number of fingers/strips per lobe (2-8)
  let showCurves = $state(true);
  let symmetryWithinCurve = $state(false);
  let symmetryWithinLobe = $state(false);
  let symmetryBetweenLobes = $state(false);

  // Boundary curve model (unrotated coordinates)
  let fingers = $state<Finger[]>(initialFingers ?? []);
  let selectedFingerId = $state<string | null>(null);
  let dragTarget = $state<DragTarget>(null);

  function getSquareParams(strips = gridSize) {
    const squareSize = strips * STRIP_WIDTH;
    const squareLeft = CENTER.x - squareSize / 2;
    const squareTop = CENTER.y - squareSize / 2;
    const earRadius = squareSize / 2;
    return { squareSize, squareLeft, squareTop, earRadius };
  }

  function projectEndpoint(finger: Finger, point: Vec, pointKey: 'p0' | 'p3'): Vec {
    const { squareSize, squareLeft, squareTop } = getSquareParams();
    const minX = squareLeft;
    const maxX = squareLeft + squareSize;
    const minY = squareTop;
    const maxY = squareTop + squareSize;

    if (finger.lobe === 'left') {
      const y = clamp(point.y, minY, maxY);
      const x = pointKey === 'p0' ? maxX : minX;
      return { x, y };
    }

    const x = clamp(point.x, minX, maxX);
    const y = pointKey === 'p0' ? maxY : minY;
    return { x, y };
  }

  function createDefaultFingers(countPerLobe: number): Finger[] {
    const strips = countPerLobe;
    const { squareSize, squareLeft, squareTop } = getSquareParams(strips);

    const result: Finger[] = [];

    // Fingers are the space between adjacent curves, so we store the *boundary* curves.
    // For N strips, there are (N-1) internal boundaries per lobe (plus fixed outer edges).
    const internal = Math.max(0, strips - 1);

    // Left lobe boundaries: across overlap square (right edge -> left edge)
    for (let i = 0; i < internal; i++) {
      const t = (i + 1) / strips;
      const y = squareTop + t * squareSize;
      const p0: Vec = { x: squareLeft + squareSize, y };
      const p3: Vec = { x: squareLeft, y };

      const bow = (t - 0.5) * squareSize * 0.12;
      const p1: Vec = { x: p0.x - squareSize * 0.3, y: p0.y + bow };
      const p2: Vec = { x: p3.x + squareSize * 0.3, y: p3.y - bow };

      result.push({ id: `L-${i}`, lobe: 'left', p0, p1, p2, p3 });
    }

    // Right lobe boundaries: across overlap square (bottom edge -> top edge)
    for (let i = 0; i < internal; i++) {
      const t = (i + 1) / strips;
      const x = squareLeft + t * squareSize;
      const p0: Vec = { x, y: squareTop + squareSize };
      const p3: Vec = { x, y: squareTop };

      const bow = (t - 0.5) * squareSize * 0.12;
      const p1: Vec = { x: p0.x + bow, y: p0.y - squareSize * 0.3 };
      const p2: Vec = { x: p3.x - bow, y: p3.y + squareSize * 0.3 };

      result.push({ id: `R-${i}`, lobe: 'right', p0, p1, p2, p3 });
    }

    return result;
  }

  // Regenerate default fingers when count changes (but not for readonly components with custom fingers)
  $effect(() => {
    const n = gridSize;
    if (!initialized) {
      initialized = true;
      // On first load, only create default fingers if none were provided
      if (fingers.length === 0) {
        fingers = createDefaultFingers(n);
      }
    } else if (!readonly) {
      // After init, only regenerate when gridSize changes in editor mode
      fingers = createDefaultFingers(n);
      selectedFingerId = null;
      dragTarget = null;
    }
  });

  // Notify parent of changes
  $effect(() => {
    if (onFingersChange && initialized) {
      onFingersChange(fingers, gridSize);
    }
  });

  function buildLobeShape(
    kind: LobeId,
    squareLeft: number,
    squareTop: number,
    squareSize: number,
    earRadius: number
  ): paper.PathItem {
    const squareRect = new paper.Path.Rectangle(
      new paper.Point(squareLeft, squareTop),
      new paper.Size(squareSize, squareSize)
    );

    let semi: paper.PathItem;
    if (kind === 'left') {
      const ear = new paper.Path.Circle(
        new paper.Point(squareLeft, squareTop + squareSize / 2),
        earRadius
      );
      const cut = new paper.Path.Rectangle(
        new paper.Point(squareLeft, squareTop),
        new paper.Point(squareLeft + earRadius, squareTop + squareSize)
      );
      semi = ear.subtract(cut);
      ear.remove();
      cut.remove();
    } else {
      const ear = new paper.Path.Circle(
        new paper.Point(squareLeft + squareSize / 2, squareTop),
        earRadius
      );
      const cut = new paper.Path.Rectangle(
        new paper.Point(squareLeft, squareTop),
        new paper.Point(squareLeft + squareSize, squareTop + earRadius)
      );
      semi = ear.subtract(cut);
      ear.remove();
      cut.remove();
    }

    const lobe = squareRect.unite(semi);
    squareRect.remove();
    semi.remove();

    lobe.fillColor =
      kind === 'left'
        ? new paper.Color(LEFT_FILL.r, LEFT_FILL.g, LEFT_FILL.b, LEFT_FILL.a)
        : new paper.Color(RIGHT_FILL.r, RIGHT_FILL.g, RIGHT_FILL.b, RIGHT_FILL.a);
    lobe.strokeColor = null;
    lobe.strokeWidth = 0;

    lobe.data = { kind: 'lobe', lobe: kind };
    return lobe;
  }

  function lobeFillColor(lobe: LobeId) {
    return lobe === 'left'
      ? new paper.Color(LEFT_FILL.r, LEFT_FILL.g, LEFT_FILL.b, LEFT_FILL.a)
      : new paper.Color(RIGHT_FILL.r, RIGHT_FILL.g, RIGHT_FILL.b, RIGHT_FILL.a);
  }

  function withInsertItemsDisabled<T>(fn: () => T): T {
    const prev = paper.settings.insertItems;
    paper.settings.insertItems = false;
    try {
      return fn();
    } finally {
      paper.settings.insertItems = prev;
    }
  }

  function itemArea(item: paper.Item | null | undefined): number {
    const area = (item as unknown as { area?: number }).area;
    return typeof area === 'number' ? area : 0;
  }

  function boundaryIndexFromId(id: string): number {
    const parts = id.split('-');
    const idx = Number(parts[1]);
    return Number.isFinite(idx) ? idx : 0;
  }

  function lobePrefix(lobe: LobeId) {
    return lobe === 'left' ? 'L' : 'R';
  }

  function idForBoundary(lobe: LobeId, index: number) {
    return `${lobePrefix(lobe)}-${index}`;
  }

  function oppositeLobe(lobe: LobeId): LobeId {
    return lobe === 'left' ? 'right' : 'left';
  }

  function internalBoundaryCount(strips = gridSize) {
    return Math.max(0, strips - 1);
  }

  function mirrorBoundaryIndex(index: number) {
    return internalBoundaryCount() - 1 - index;
  }

  function getFingerById(id: string, overrides?: Map<string, Finger>) {
    return overrides?.get(id) ?? fingers.find(f => f.id === id);
  }

  function swapPointBetweenLobes(p: Vec): Vec {
    const { squareLeft, squareTop } = getSquareParams();
    return {
      x: squareLeft + (p.y - squareTop),
      y: squareTop + (p.x - squareLeft)
    };
  }

  function mirrorPointWithinLobe(lobe: LobeId, p: Vec): Vec {
    const { squareSize, squareLeft, squareTop } = getSquareParams();
    const cx = squareLeft + squareSize / 2;
    const cy = squareTop + squareSize / 2;
    if (lobe === 'left') return { x: p.x, y: 2 * cy - p.y };
    return { x: 2 * cx - p.x, y: p.y };
  }

  function mapFinger(
    source: Finger,
    targetId: string,
    targetLobe: LobeId,
    mapPoint: (p: Vec) => Vec
  ): Finger {
    const mapped: Finger = {
      id: targetId,
      lobe: targetLobe,
      p0: mapPoint(source.p0),
      p1: mapPoint(source.p1),
      p2: mapPoint(source.p2),
      p3: mapPoint(source.p3)
    };
    mapped.p0 = projectEndpoint(mapped, mapped.p0, 'p0');
    mapped.p3 = projectEndpoint(mapped, mapped.p3, 'p3');
    return mapped;
  }

  function deriveSymmetryOverrides(primary: Finger): Map<string, Finger> {
    const overrides = new Map<string, Finger>();
    overrides.set(primary.id, primary);

    const idx = boundaryIndexFromId(primary.id);
    const internal = internalBoundaryCount();
    if (idx < 0 || idx >= internal) return overrides;
    const mirrorIdx = mirrorBoundaryIndex(idx);

    if (symmetryWithinLobe && mirrorIdx !== idx && mirrorIdx >= 0 && mirrorIdx < internal) {
      const mirrorId = idForBoundary(primary.lobe, mirrorIdx);
      const existing = getFingerById(mirrorId);
      if (existing) {
        overrides.set(
          mirrorId,
          mapFinger(primary, mirrorId, primary.lobe, p => mirrorPointWithinLobe(primary.lobe, p))
        );
      }
    }

    if (symmetryBetweenLobes) {
      const otherLobe = oppositeLobe(primary.lobe);
      const otherId = idForBoundary(otherLobe, idx);
      const otherExisting = getFingerById(otherId);
      if (otherExisting) {
        overrides.set(otherId, mapFinger(primary, otherId, otherLobe, swapPointBetweenLobes));
      }

      if (symmetryWithinLobe && mirrorIdx !== idx && mirrorIdx >= 0 && mirrorIdx < internal) {
        const otherMirrorId = idForBoundary(otherLobe, mirrorIdx);
        const otherMirrorExisting = getFingerById(otherMirrorId);
        if (otherMirrorExisting) {
          overrides.set(
            otherMirrorId,
            mapFinger(primary, otherMirrorId, otherLobe, p =>
              swapPointBetweenLobes(mirrorPointWithinLobe(primary.lobe, p))
            )
          );
        }
      }
    }

    return overrides;
  }

  function candidateIsValid(
    fingerId: string,
    candidate: Finger,
    overrides?: Map<string, Finger>
  ): boolean {
    return withInsertItemsDisabled(() => {
      const { squareSize, squareLeft, squareTop } = getSquareParams();
      const minX = squareLeft;
      const maxX = squareLeft + squareSize;
      const minY = squareTop;
      const maxY = squareTop + squareSize;
      const orderEps = 1;
      const tol = 0.5;

      // Keep original boundary ordering: a boundary cannot move past its neighbors.
      const idx = boundaryIndexFromId(candidate.id);
      const prevId = idForBoundary(candidate.lobe, idx - 1);
      const nextId = idForBoundary(candidate.lobe, idx + 1);
      const prev = idx > 0 ? getFingerById(prevId, overrides) : undefined;
      const next = idx < internalBoundaryCount() - 1 ? getFingerById(nextId, overrides) : undefined;

      if (candidate.lobe === 'left') {
        const minP0Y = (prev?.p0.y ?? minY) + orderEps;
        const maxP0Y = (next?.p0.y ?? maxY) - orderEps;
        const minP3Y = (prev?.p3.y ?? minY) + orderEps;
        const maxP3Y = (next?.p3.y ?? maxY) - orderEps;
        if (candidate.p0.y < minP0Y || candidate.p0.y > maxP0Y) return false;
        if (candidate.p3.y < minP3Y || candidate.p3.y > maxP3Y) return false;
      } else {
        const minP0X = (prev?.p0.x ?? minX) + orderEps;
        const maxP0X = (next?.p0.x ?? maxX) - orderEps;
        const minP3X = (prev?.p3.x ?? minX) + orderEps;
        const maxP3X = (next?.p3.x ?? maxX) - orderEps;
        if (candidate.p0.x < minP0X || candidate.p0.x > maxP0X) return false;
        if (candidate.p3.x < minP3X || candidate.p3.x > maxP3X) return false;
      }

      const candidatePath = buildFingerPath(candidate);
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

      for (const otherBase of fingers) {
        if (otherBase.id === fingerId) continue;
        const other = overrides?.get(otherBase.id) ?? otherBase;
        if (other.lobe !== candidate.lobe) continue;
        const otherPath = buildFingerPath(other);
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

  function vecLerp(a: Vec, b: Vec, t: number): Vec {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  function vecAdd(a: Vec, b: Vec): Vec {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function vecSub(a: Vec, b: Vec): Vec {
    return { x: a.x - b.x, y: a.y - b.y };
  }

  function vecScale(a: Vec, s: number): Vec {
    return { x: a.x * s, y: a.y * s };
  }

  function vecDist(a: Vec, b: Vec): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function midpoint(a: Vec, b: Vec): Vec {
    return vecScale(vecAdd(a, b), 0.5);
  }

  function dot(a: Vec, b: Vec): number {
    return a.x * b.x + a.y * b.y;
  }

  function normalize(v: Vec): Vec {
    const len = Math.hypot(v.x, v.y);
    if (!len) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  }

  function perp(v: Vec): Vec {
    return { x: -v.y, y: v.x };
  }

  // Multi-segment bezier support
  interface BezierSegment {
    p0: Vec;
    p1: Vec;
    p2: Vec;
    p3: Vec;
  }

  function fingerToSegments(finger: Finger): BezierSegment[] {
    if (finger.pathData) {
      return parsePathDataToSegments(finger.pathData);
    }
    return [{ p0: finger.p0, p1: finger.p1, p2: finger.p2, p3: finger.p3 }];
  }

  function segmentsToPathData(segments: BezierSegment[]): string {
    if (segments.length === 0) return '';
    let d = `M ${segments[0].p0.x} ${segments[0].p0.y}`;
    for (const seg of segments) {
      d += ` C ${seg.p1.x} ${seg.p1.y} ${seg.p2.x} ${seg.p2.y} ${seg.p3.x} ${seg.p3.y}`;
    }
    return d;
  }

  function parsePathDataToSegments(pathData: string): BezierSegment[] {
    const segments: BezierSegment[] = [];
    const commands = pathData.match(/[MLCQAZ][^MLCQAZ]*/gi) || [];
    let currentX = 0;
    let currentY = 0;

    for (const cmd of commands) {
      const type = cmd[0].toUpperCase();
      const args = cmd.slice(1).trim().split(/[\s,]+/).map(Number);

      if (type === 'M') {
        currentX = args[0];
        currentY = args[1];
      } else if (type === 'C') {
        // Cubic bezier: C x1 y1 x2 y2 x y
        segments.push({
          p0: { x: currentX, y: currentY },
          p1: { x: args[0], y: args[1] },
          p2: { x: args[2], y: args[3] },
          p3: { x: args[4], y: args[5] }
        });
        currentX = args[4];
        currentY = args[5];
      }
    }
    return segments;
  }

  function updateFingerSegments(finger: Finger, segments: BezierSegment[]): Finger {
    if (segments.length === 1) {
      // Single segment: use simple p0-p3 format (no pathData)
      return {
        ...finger,
        p0: segments[0].p0,
        p1: segments[0].p1,
        p2: segments[0].p2,
        p3: segments[0].p3,
        pathData: undefined
      };
    }
    // Multi-segment: use pathData
    return {
      ...finger,
      p0: segments[0].p0,
      p1: segments[0].p1,
      p2: segments[0].p2,
      p3: segments[segments.length - 1].p3,
      pathData: segmentsToPathData(segments)
    };
  }

  function splitBezierAt(seg: BezierSegment, t: number): [BezierSegment, BezierSegment] {
    // De Casteljau's algorithm to split a cubic bezier at parameter t
    const p0 = seg.p0;
    const p1 = seg.p1;
    const p2 = seg.p2;
    const p3 = seg.p3;

    const p01 = vecLerp(p0, p1, t);
    const p12 = vecLerp(p1, p2, t);
    const p23 = vecLerp(p2, p3, t);

    const p012 = vecLerp(p01, p12, t);
    const p123 = vecLerp(p12, p23, t);

    const p0123 = vecLerp(p012, p123, t); // Point on curve at t

    return [
      { p0: p0, p1: p01, p2: p012, p3: p0123 },
      { p0: p0123, p1: p123, p2: p23, p3: p3 }
    ];
  }

  function addSegmentToFinger(fingerId: string) {
    const finger = getFingerById(fingerId);
    if (!finger) return;

    const segments = fingerToSegments(finger);
    // Split the last segment in half
    const lastIdx = segments.length - 1;
    const [first, second] = splitBezierAt(segments[lastIdx], 0.5);
    segments.splice(lastIdx, 1, first, second);

    updateFinger(fingerId, () => updateFingerSegments(finger, segments));
    draw();
  }

  function removeSegmentFromFinger(fingerId: string) {
    const finger = getFingerById(fingerId);
    if (!finger) return;

    const segments = fingerToSegments(finger);
    if (segments.length <= 1) return; // Can't remove the only segment

    // Merge last two segments into one
    const lastIdx = segments.length - 1;
    const seg1 = segments[lastIdx - 1];
    const seg2 = segments[lastIdx];

    // Simple merge: use endpoints and averaged control points
    const merged: BezierSegment = {
      p0: seg1.p0,
      p1: vecLerp(seg1.p1, vecLerp(seg1.p2, seg2.p1, 0.5), 0.5),
      p2: vecLerp(vecLerp(seg1.p2, seg2.p1, 0.5), seg2.p2, 0.5),
      p3: seg2.p3
    };

    segments.splice(lastIdx - 1, 2, merged);
    updateFinger(fingerId, () => updateFingerSegments(finger, segments));
    draw();
  }

  function getSegmentCount(finger: Finger | undefined): number {
    if (!finger) return 0;
    return fingerToSegments(finger).length;
  }

  // Reflect a point across the perpendicular bisector of the segment p0->p3.
  // This keeps the point on the "same side" of the chord line (mirror symmetry),
  // rather than flipping it to the other side (point symmetry).
  function reflectAcrossChordBisector(p0: Vec, p3: Vec, p: Vec): Vec {
    const mid = midpoint(p0, p3);
    const u = normalize(vecSub(p3, p0));
    const v = perp(u);
    const r = vecSub(p, mid);
    const uComp = dot(r, u);
    const vComp = dot(r, v);
    const mirrored = vecAdd(vecScale(u, -uComp), vecScale(v, vComp));
    return vecAdd(mid, mirrored);
  }

  function applyWithinCurveSymmetry(
    finger: Finger,
    driver: 'p1' | 'p2' = 'p1'
  ): Finger {
    if (driver === 'p2') {
      return { ...finger, p1: reflectAcrossChordBisector(finger.p0, finger.p3, finger.p2) };
    }
    return { ...finger, p2: reflectAcrossChordBisector(finger.p0, finger.p3, finger.p1) };
  }

  function moveControlToward(
    fingerId: string,
    base: Finger,
    pointKey: 'p1' | 'p2',
    from: Vec,
    to: Vec,
    isValidCandidate: (candidate: Finger) => boolean = candidate => candidateIsValid(fingerId, candidate)
  ): Vec {
    const desired = { ...base, [pointKey]: to } as Finger;
    if (isValidCandidate(desired)) return to;

    const startOk = isValidCandidate({ ...base, [pointKey]: from } as Finger);
    if (!startOk) return from;

    let lo = 0;
    let hi = 1;
    let best = 0;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      const pt = vecLerp(from, to, mid);
      const cand = { ...base, [pointKey]: pt } as Finger;
      if (isValidCandidate(cand)) {
        best = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return vecLerp(from, to, best);
  }

  function snapFreeControlPoint(
    fingerId: string,
    base: Finger,
    pointKey: 'p1' | 'p2',
    desired: Vec,
    isValidCandidate: (candidate: Finger) => boolean = candidate => candidateIsValid(fingerId, candidate)
  ): Vec {
    const direct = { ...base, [pointKey]: desired } as Finger;
    if (isValidCandidate(direct)) return desired;

    // Start with the furthest point toward the cursor that remains valid
    let pt = moveControlToward(fingerId, base, pointKey, base[pointKey], desired, isValidCandidate);
    let bestDist = vecDist(pt, desired);

    const dirs: Vec[] = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 1, y: 1 },
      { x: 1, y: -1 },
      { x: -1, y: 1 },
      { x: -1, y: -1 }
    ].map(d => {
      const len = Math.hypot(d.x, d.y);
      return { x: d.x / len, y: d.y / len };
    });

    const startStep = Math.min(30, Math.max(4, bestDist));
    for (let step = startStep; step >= 1; step /= 2) {
      for (let iter = 0; iter < 4; iter++) {
        let improved = false;
        let bestPt = pt;
        let bestLocalDist = bestDist;

        for (const dir of dirs) {
          const target = { x: pt.x + dir.x * step, y: pt.y + dir.y * step };
          const candPt = moveControlToward(fingerId, base, pointKey, pt, target, isValidCandidate);
          const d = vecDist(candPt, desired);
          if (d + 0.1 < bestLocalDist) {
            bestPt = candPt;
            bestLocalDist = d;
            improved = true;
          }
        }

        if (!improved) break;
        pt = bestPt;
        bestDist = bestLocalDist;
      }
    }

    return pt;
  }

  function overridesAreValid(overrides: Map<string, Finger>): boolean {
    for (const [id, candidate] of overrides) {
      if (!candidateIsValid(id, candidate, overrides)) return false;
    }
    return true;
  }

  function applyOverrides(overrides: Map<string, Finger>) {
    fingers = fingers.map(f => overrides.get(f.id) ?? f);
  }

  function applyConstrainedUpdate(
    fingerId: string,
    buildCandidate: (current: Finger, fraction: number) => Finger
  ) {
    const current = getFingerById(fingerId);
    if (!current) return;

    const desiredPrimary = buildCandidate(current, 1);
    const desiredOverrides = deriveSymmetryOverrides(desiredPrimary);
    if (overridesAreValid(desiredOverrides)) {
      applyOverrides(desiredOverrides);
      return;
    }

    let lo = 0;
    let hi = 1;
    let best = 0;
    let bestOverrides: Map<string, Finger> | null = null;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      const primaryCandidate = buildCandidate(current, mid);
      const overrides = deriveSymmetryOverrides(primaryCandidate);
      if (overridesAreValid(overrides)) {
        best = mid;
        lo = mid;
        bestOverrides = overrides;
      } else {
        hi = mid;
      }
    }

    if (!bestOverrides || best <= 0.001) return;
    applyOverrides(bestOverrides);
  }

  function buildFingerPath(finger: Finger): paper.Path {
    // Use SVG path data if provided (for complex multi-segment paths)
    if (finger.pathData) {
      return new paper.Path(finger.pathData);
    }

    // Otherwise use simple p0-p3 cubic bezier (backwards compatible)
    const path = new paper.Path();
    path.moveTo(toPoint(finger.p0));
    path.cubicCurveTo(toPoint(finger.p1), toPoint(finger.p2), toPoint(finger.p3));
    return path;
  }

  function samplePath(path: paper.Path, samples: number): paper.Point[] {
    const length = path.length;
    if (!length) return [];
    const pts: paper.Point[] = [];
    for (let i = 0; i <= samples; i++) {
      const offset = (length * i) / samples;
      const pt = path.getPointAt(offset);
      if (pt) pts.push(pt);
    }
    return pts;
  }

  function buildRibbonBetween(a: paper.Path, b: paper.Path, samples = 40): paper.Path {
    const aPts = samplePath(a, samples);
    const bPts = samplePath(b, samples);
    const ribbon = new paper.Path();
    ribbon.addSegments(aPts.map(p => new paper.Segment(p)));
    ribbon.addSegments(bPts.reverse().map(p => new paper.Segment(p)));
    ribbon.closed = true;
    return ribbon;
  }

  function buildStripRegionBetween(
    a: paper.Path,
    b: paper.Path,
    overlap: paper.PathItem,
    ribbonSamples: number
  ): paper.PathItem | null {
    return withInsertItemsDisabled(() => {
      const ribbon = buildRibbonBetween(a, b, ribbonSamples);
      const clipped = ribbon.intersect(overlap, { insert: false });
      ribbon.remove();
      return clipped;
    });
  }

  function buildLobeStrips(
    lobe: LobeId,
    overlap: paper.PathItem,
    squareLeft: number,
    squareTop: number,
    squareSize: number,
    ribbonSamples: number
  ): Array<{ index: number; item: paper.PathItem }> {
    const squareRight = squareLeft + squareSize;
    const squareBottom = squareTop + squareSize;

    const internal = fingers
      .filter(f => f.lobe === lobe)
      .slice()
      .sort((a, b) => (lobe === 'left' ? a.p0.y - b.p0.y : a.p0.x - b.p0.x));

    const boundaries: Array<() => paper.Path> = [];

    if (lobe === 'left') {
      boundaries.push(
        () => new paper.Path.Line(new paper.Point(squareRight, squareTop), new paper.Point(squareLeft, squareTop))
      );
      internal.forEach(f => boundaries.push(() => buildFingerPath(f)));
      boundaries.push(
        () =>
          new paper.Path.Line(
            new paper.Point(squareRight, squareBottom),
            new paper.Point(squareLeft, squareBottom)
          )
      );
    } else {
      boundaries.push(
        () =>
          new paper.Path.Line(new paper.Point(squareLeft, squareBottom), new paper.Point(squareLeft, squareTop))
      );
      internal.forEach(f => boundaries.push(() => buildFingerPath(f)));
      boundaries.push(
        () =>
          new paper.Path.Line(new paper.Point(squareRight, squareBottom), new paper.Point(squareRight, squareTop))
      );
    }

    const strips: Array<{ index: number; item: paper.PathItem }> = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const a = boundaries[i]();
      const b = boundaries[i + 1]();
      const strip = buildStripRegionBetween(a, b, overlap, ribbonSamples);
      a.remove();
      b.remove();
      if (!strip || Math.abs(itemArea(strip)) < 1) {
        strip?.remove();
        continue;
      }
      strip.fillColor = lobeFillColor(lobe);
      strip.strokeColor = null;
      strip.data = { kind: 'strip', lobe, stripIndex: i };
      strips.push({ index: i, item: strip });
    }
    return strips;
  }

  function draw() {
    if (!paper.project) return;
    paper.activate();
    paper.project.clear();

    const strips = gridSize;
    const { squareSize, squareLeft, squareTop, earRadius } = getSquareParams(strips);
    const ribbonSamples = clamp(Math.round((size / BASE_CANVAS_SIZE) * 60), 16, 80);

    const items: paper.Item[] = [];

    // Lobes (build full shapes, then render outsides + woven overlap)
    const leftLobe = buildLobeShape('left', squareLeft, squareTop, squareSize, earRadius);
    const rightLobe = buildLobeShape('right', squareLeft, squareTop, squareSize, earRadius);

    // Overlap and outside fills (avoid blended overlap)
    const overlap = leftLobe.intersect(rightLobe, { insert: false });
    const leftOutside = leftLobe.subtract(overlap, { insert: false });
    const rightOutside = rightLobe.subtract(overlap, { insert: false });
    leftLobe.remove();
    rightLobe.remove();

    leftOutside.fillColor = lobeFillColor('left');
    leftOutside.strokeColor = null;
    rightOutside.fillColor = lobeFillColor('right');
    rightOutside.strokeColor = null;
    items.push(leftOutside, rightOutside);

    // Build strip areas as the space between adjacent boundary curves, clipped to overlap
    const leftStrips = buildLobeStrips('left', overlap, squareLeft, squareTop, squareSize, ribbonSamples);
    const rightStrips = buildLobeStrips('right', overlap, squareLeft, squareTop, squareSize, ribbonSamples);
    overlap.remove();

    // Weave: cut the under-strip at each crossing (space between lines)
    for (const l of leftStrips) {
      for (const r of rightStrips) {
        const inter = l.item.intersect(r.item, { insert: false });
        if (!inter || Math.abs(itemArea(inter)) < 1) {
          inter?.remove();
          continue;
        }
        const leftOnTop = (l.index + r.index) % 2 === 0;
        if (leftOnTop) {
          const fill = r.item.fillColor;
          const next = r.item.subtract(inter, { insert: false });
          next.fillColor = fill;
          next.strokeColor = null;
          r.item.remove();
          r.item = next;
        } else {
          const fill = l.item.fillColor;
          const next = l.item.subtract(inter, { insert: false });
          next.fillColor = fill;
          next.strokeColor = null;
          l.item.remove();
          l.item = next;
        }
        inter.remove();
      }
    }

    // Render woven strips
    leftStrips.forEach(s => items.push(s.item));
    rightStrips.forEach(s => items.push(s.item));

    // Render boundary curves on top (for editing/selection) - skip in readonly mode
    if (!readonly) {
      for (const finger of fingers) {
        const isSelected = finger.id === selectedFingerId;
        const hidden = !showCurves;
        const strokeColor = hidden
          ? new paper.Color(0, 0, 0, 0.001)
          : isSelected
            ? new paper.Color('#111111')
            : new paper.Color('#0088aa'); // Cyan - visible on both red and white

        // Use buildFingerPath to properly handle multi-segment paths
        const path = buildFingerPath(finger);
        path.strokeColor = strokeColor;
        path.strokeWidth = hidden ? 2 : isSelected ? 4 : 2;
        path.strokeCap = 'round';
        path.strokeJoin = 'round';
        path.fillColor = null;
        path.data = { kind: 'finger', fingerId: finger.id };
        items.push(path);
      }

      // Selected finger handles (drawn on top of weave)
      const selected = fingers.find(f => f.id === selectedFingerId);
      if (selected) {
        const segments = fingerToSegments(selected);
        const endpointSize = 10;
        const handleRadius = 5;
        const midpointSize = 8;

        // Draw all segments' control handles
        for (let segIdx = 0; segIdx < segments.length; segIdx++) {
          const seg = segments[segIdx];
          const isFirst = segIdx === 0;
          const isLast = segIdx === segments.length - 1;

          // Control handle lines
          const c1 = new paper.Path.Line(toPoint(seg.p0), toPoint(seg.p1));
          c1.strokeColor = new paper.Color('#666666');
          c1.strokeWidth = 1;
          items.push(c1);

          const c2 = new paper.Path.Line(toPoint(seg.p3), toPoint(seg.p2));
          c2.strokeColor = new paper.Color('#666666');
          c2.strokeWidth = 1;
          items.push(c2);

          // Endpoint p0 (only for first segment)
          if (isFirst) {
            const p0Handle = new paper.Path.Rectangle({
              point: new paper.Point(seg.p0.x - endpointSize / 2, seg.p0.y - endpointSize / 2),
              size: endpointSize
            });
            p0Handle.fillColor = new paper.Color('#ffffff');
            p0Handle.strokeColor = new paper.Color('#111111');
            p0Handle.strokeWidth = 2;
            p0Handle.data = { kind: 'control', fingerId: selected.id, pointKey: 'p0', segmentIndex: 0 };
            items.push(p0Handle);
          }

          // Endpoint p3 (only for last segment)
          if (isLast) {
            const p3Handle = new paper.Path.Rectangle({
              point: new paper.Point(seg.p3.x - endpointSize / 2, seg.p3.y - endpointSize / 2),
              size: endpointSize
            });
            p3Handle.fillColor = new paper.Color('#ffffff');
            p3Handle.strokeColor = new paper.Color('#111111');
            p3Handle.strokeWidth = 2;
            p3Handle.data = { kind: 'control', fingerId: selected.id, pointKey: 'p3', segmentIndex: segIdx };
            items.push(p3Handle);
          }

          // Midpoint (junction between segments) - diamond shape
          if (!isFirst) {
            const midHandle = new paper.Path.RegularPolygon(toPoint(seg.p0), 4, midpointSize / 2);
            midHandle.rotate(45);
            midHandle.fillColor = new paper.Color('#ffcc00');
            midHandle.strokeColor = new paper.Color('#111111');
            midHandle.strokeWidth = 1.5;
            midHandle.data = { kind: 'control', fingerId: selected.id, pointKey: `seg${segIdx}_p0`, segmentIndex: segIdx };
            items.push(midHandle);
          }

          // Control point p1
          const p1Handle = new paper.Path.Circle(toPoint(seg.p1), handleRadius);
          p1Handle.fillColor = new paper.Color(0.9);
          p1Handle.strokeColor = new paper.Color('#111111');
          p1Handle.strokeWidth = 1.5;
          p1Handle.data = { kind: 'control', fingerId: selected.id, pointKey: `seg${segIdx}_p1`, segmentIndex: segIdx };
          items.push(p1Handle);

          // Control point p2
          const p2Handle = new paper.Path.Circle(toPoint(seg.p2), handleRadius);
          p2Handle.fillColor = new paper.Color(0.9);
          p2Handle.strokeColor = new paper.Color('#111111');
          p2Handle.strokeWidth = 1.5;
          p2Handle.data = { kind: 'control', fingerId: selected.id, pointKey: `seg${segIdx}_p2`, segmentIndex: segIdx };
          items.push(p2Handle);
        }
      }
    }

    // Rotate for the classic heart angle (keep state unrotated)
    const group = new paper.Group(items);
    group.rotate(45, new paper.Point(CENTER.x, CENTER.y));

    // Normalize so all hearts appear the same size regardless of gridSize
    const normalizeScale = REFERENCE_GRID_SIZE / gridSize;

    if (normalizeScale !== 1) {
      group.scale(normalizeScale, new paper.Point(CENTER.x, CENTER.y));
    }
  }

  function updateFinger(fingerId: string, updater: (f: Finger) => Finger) {
    fingers = fingers.map(f => (f.id === fingerId ? updater(f) : f));
  }

  function clampEndpoints(fingerId: string) {
    updateFinger(fingerId, f => ({
      ...f,
      p0: projectEndpoint(f, f.p0, 'p0'),
      p3: projectEndpoint(f, f.p3, 'p3')
    }));
  }

  function handleMouseDown(event: any) {
    const hits = paper.project.hitTestAll(event.point, {
      fill: true,
      stroke: true,
      tolerance: 10
    });
    const hit = hits.find(h => h.item?.data?.kind === 'control' || h.item?.data?.kind === 'finger');

    if (!hit) {
      selectedFingerId = null;
      dragTarget = null;
      draw();
      return;
    }

    const data = hit.item.data;
    if (data.kind === 'control') {
      selectedFingerId = data.fingerId;
      dragTarget = {
        kind: 'control',
        fingerId: data.fingerId,
        pointKey: data.pointKey,
        segmentIndex: data.segmentIndex
      };
      draw();
      return;
    }

    selectedFingerId = data.fingerId;
    dragTarget = { kind: 'path', fingerId: data.fingerId };
    draw();
  }

  // Build a candidate finger with updated segment control point (without modifying state)
  function buildSegmentUpdateCandidate(
    finger: Finger,
    segmentIndex: number,
    pointKey: string,
    newPos: Vec
  ): Finger | null {
    const segments = fingerToSegments(finger);
    if (segmentIndex < 0 || segmentIndex >= segments.length) return null;

    const seg = segments[segmentIndex];

    // Determine which point within the segment to update
    if (pointKey.endsWith('_p0')) {
      // Midpoint (diamond) - also update previous segment's p3 and translate adjacent controls
      if (segmentIndex > 0) {
        const prevSeg = segments[segmentIndex - 1];
        const oldPos = seg.p0;
        const delta = vecSub(newPos, oldPos);

        // Update the junction point
        seg.p0 = newPos;
        prevSeg.p3 = newPos;

        // Translate adjacent control points to maintain curve shape
        prevSeg.p2 = vecAdd(prevSeg.p2, delta);
        seg.p1 = vecAdd(seg.p1, delta);
      } else {
        return null; // Can't move p0 of first segment this way
      }
    } else if (pointKey.endsWith('_p1')) {
      seg.p1 = newPos;
    } else if (pointKey.endsWith('_p2')) {
      seg.p2 = newPos;
    }

    return updateFingerSegments(finger, segments);
  }

  // Update a segment control point within a multi-segment finger (with validation)
  function updateSegmentControlPoint(
    fingerId: string,
    segmentIndex: number,
    pointKey: string,
    newPos: Vec
  ): boolean {
    const finger = getFingerById(fingerId);
    if (!finger) return false;

    const candidate = buildSegmentUpdateCandidate(finger, segmentIndex, pointKey, newPos);
    if (!candidate) return false;

    // Validate: check that the candidate doesn't intersect other curves
    if (!candidateIsValid(fingerId, candidate)) {
      return false;
    }

    updateFinger(fingerId, () => candidate);
    return true;
  }

  function handleMouseDrag(event: any) {
    const target = dragTarget;
    if (!target) return;

    if (target.kind === 'control') {
      const p = unrotatePoint(event.point);
      const pointKey = target.pointKey;
      const segIdx = target.segmentIndex ?? 0;

      // Check if this is a multi-segment control point (has seg prefix)
      if (typeof pointKey === 'string' && pointKey.startsWith('seg')) {
        updateSegmentControlPoint(target.fingerId, segIdx, pointKey, p);
        draw();
        return;
      }

      if (pointKey === 'p1' || pointKey === 'p2') {
        const driverKey = pointKey;
        const base = getFingerById(target.fingerId);
        if (!base) return;

        const isValidCandidate = (candidate: Finger) => {
          const symCandidate = symmetryWithinCurve
            ? applyWithinCurveSymmetry(candidate, driverKey)
            : candidate;
          return overridesAreValid(deriveSymmetryOverrides(symCandidate));
        };
        const snapped = snapFreeControlPoint(
          target.fingerId,
          base,
          driverKey,
          p,
          isValidCandidate
        );
        let primaryCandidate = { ...base, [driverKey]: snapped } as Finger;
        if (symmetryWithinCurve) {
          primaryCandidate = applyWithinCurveSymmetry(primaryCandidate, driverKey);
        }
        const overrides = deriveSymmetryOverrides(primaryCandidate);
        if (!overridesAreValid(overrides)) return;
        applyOverrides(overrides);
        draw();
        return;
      }
      if (pointKey !== 'p0' && pointKey !== 'p3') return;

      applyConstrainedUpdate(target.fingerId, (current, fraction) => {
        const oldPt = current[pointKey];
        const desiredPt = projectEndpoint(current, p, pointKey);
        const dx = (desiredPt.x - oldPt.x) * fraction;
        const dy = (desiredPt.y - oldPt.y) * fraction;
        let next = {
          ...current,
          [pointKey]: { x: oldPt.x + dx, y: oldPt.y + dy }
        } as Finger;

        next[pointKey] = projectEndpoint(next, next[pointKey], pointKey);

        if (symmetryWithinCurve) {
          const prevMid = midpoint(current.p0, current.p3);
          const nextMid = midpoint(next.p0, next.p3);
          const dMid = vecSub(nextMid, prevMid);
          next = {
            ...next,
            p1: vecAdd(current.p1, dMid),
            p2: vecAdd(current.p2, dMid)
          };
          next = applyWithinCurveSymmetry(next, 'p1');
        }

        return next;
      });
      draw();
      return;
    }

    // Drag whole path: translate while keeping endpoints snapped and boundaries non-intersecting
    const dRaw = unrotateDelta(event.delta);
    applyConstrainedUpdate(target.fingerId, (current, fraction) => {
      const { squareSize, squareLeft, squareTop } = getSquareParams();
      const minX = squareLeft;
      const maxX = squareLeft + squareSize;
      const minY = squareTop;
      const maxY = squareTop + squareSize;

      let dx = dRaw.x;
      let dy = dRaw.y;

      if (current.lobe === 'left') {
        dx = 0;
        const dyMin = minY - Math.min(current.p0.y, current.p3.y);
        const dyMax = maxY - Math.max(current.p0.y, current.p3.y);
        dy = clamp(dRaw.y, dyMin, dyMax);
      } else {
        dy = 0;
        const dxMin = minX - Math.min(current.p0.x, current.p3.x);
        const dxMax = maxX - Math.max(current.p0.x, current.p3.x);
        dx = clamp(dRaw.x, dxMin, dxMax);
      }

      dx *= fraction;
      dy *= fraction;

      const moved: Finger = {
        ...current,
        p0: { x: current.p0.x + dx, y: current.p0.y + dy },
        p1: { x: current.p1.x + dx, y: current.p1.y + dy },
        p2: { x: current.p2.x + dx, y: current.p2.y + dy },
        p3: { x: current.p3.x + dx, y: current.p3.y + dy }
      };

      moved.p0 = projectEndpoint(moved, moved.p0, 'p0');
      moved.p3 = projectEndpoint(moved, moved.p3, 'p3');
      return moved;
    });
    draw();
  }

  function handleMouseUp() {
    if (dragTarget?.kind === 'path') {
      clampEndpoints(dragTarget.fingerId);
    }
    dragTarget = null;
    draw();
  }

  onMount(() => {
    paper.activate();
    paper.setup(canvas);
    // Ensure view uses correct coordinate space (600x600) regardless of CSS display size
    paper.view.viewSize = new paper.Size(BASE_CANVAS_SIZE, BASE_CANVAS_SIZE);
    if (!readonly) {
      paper.view.onMouseDown = handleMouseDown;
      paper.view.onMouseDrag = handleMouseDrag;
      paper.view.onMouseUp = handleMouseUp;
    }
    paperReady = true;
  });

  $effect(() => {
    if (!paperReady || !canvas || !paper.project) return;
    draw();
  });
</script>

<div class="paper-heart">
  {#if !readonly}
    <div class="controls">
      <label>
        Fingers:
        <input type="number" bind:value={gridSize} min="2" max="8" />
      </label>
      <label class="checkbox">
        <input type="checkbox" bind:checked={showCurves} />
        Show curves
      </label>
      <label class="checkbox">
        <input type="checkbox" bind:checked={symmetryWithinCurve} />
        Symmetric (within curve)
      </label>
      <label class="checkbox">
        <input type="checkbox" bind:checked={symmetryWithinLobe} />
        Symmetric (within lobe)
      </label>
      <label class="checkbox">
        <input type="checkbox" bind:checked={symmetryBetweenLobes} />
        Symmetric (between lobes)
      </label>
    </div>
    {#if selectedFingerId}
      {@const selectedFinger = fingers.find(f => f.id === selectedFingerId)}
      {@const segCount = getSegmentCount(selectedFinger)}
      <div class="segment-controls">
        <span class="segment-label">Curve segments: {segCount}</span>
        <button class="segment-btn" onclick={() => addSegmentToFinger(selectedFingerId!)}>
          + Add
        </button>
        <button class="segment-btn" onclick={() => removeSegmentFromFinger(selectedFingerId!)} disabled={segCount <= 1}>
          - Remove
        </button>
      </div>
    {/if}
  {/if}
  <div class="canvas-wrapper" style:width="{size}px" style:height="{size}px">
    <canvas
      bind:this={canvas}
      width={BASE_CANVAS_SIZE}
      height={BASE_CANVAS_SIZE}
      style:transform="scale({size / BASE_CANVAS_SIZE})"
      style:transform-origin="top left"
    ></canvas>
  </div>
</div>

<style>
  .paper-heart {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
    z-index: 10;
    position: relative;
    align-items: center;
    justify-content: center;
    background: white;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
    font-size: 0.85rem;
  }

  .controls label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    color: #444;
    cursor: pointer;
    white-space: nowrap;
  }

  .controls input[type='number'] {
    width: 50px;
    padding: 0.25rem 0.4rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .controls input[type='checkbox'] {
    accent-color: #cc0000;
  }

  .segment-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    background: #fff;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  }

  .segment-label {
    font-size: 0.85rem;
    color: #666;
    margin-right: 0.25rem;
  }

  .segment-btn {
    padding: 0.25rem 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #f5f5f5;
    cursor: pointer;
    font-size: 0.8rem;
    transition: background 0.2s;
  }

  .segment-btn:hover:not(:disabled) {
    background: #e0e0e0;
  }

  .segment-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .canvas-wrapper {
    /* dimensions set via inline styles */
  }

  canvas {
    background: transparent;
    cursor: default;
  }
</style>
