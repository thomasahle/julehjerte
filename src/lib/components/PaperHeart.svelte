<script lang="ts">
  import { onMount } from 'svelte';
  import paperPkg from 'paper';
  import type { Finger, Vec, LobeId } from '$lib/types/heart';
  import { snapSequentialQPBezierControl, snapSequentialQPBezierJunction } from '$lib/algorithms/snapBezierControl';
  import {
    type BezierSegment,
    cloneSegments,
    fingerToSegments,
    getInternalSegments,
    setInternalSegments,
    splitBezierAt,
    updateFingerSegments
  } from '$lib/geometry/bezierSegments';
  import { dot, midpoint, normalize, perp, vecAdd, vecDist, vecLerp, vecScale, vecSub } from '$lib/geometry/vec';
  import { getColors, subscribeColors, type HeartColors } from '$lib/stores/colors';

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
  // Overlap square size is `gridSize * STRIP_WIDTH` (600px canvas, 75px per strip).
  const STRIP_WIDTH = 75;

  // Colors from store
  let heartColors = $state<HeartColors>({ left: '#ffffff', right: '#cc0000' });

  function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16) / 255,
          g: parseInt(result[2], 16) / 255,
          b: parseInt(result[3], 16) / 255,
          a: 1
        }
      : { r: 1, g: 1, b: 1, a: 1 };
  }


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
  // Use non-reactive variables to prevent effects from re-running when these change
  let initialized = false;
  let paperReady = $state(false);
  let didInitialFingerSetup = false;

  // Editing controls
  let gridSize = $state(initialGridSize); // number of fingers/strips per lobe (2-8)
  let showCurves = $state(true);
  let symmetryWithinCurve = $state(false);
  let symmetryWithinLobe = $state(false);
  let symmetryBetweenLobes = $state(false);

  // Boundary curve model (unrotated coordinates)
  let fingers = $state<Finger[]>([]);
  let selectedFingerId = $state<string | null>(null);
  let dragTarget = $state<DragTarget>(null);

  // Initialize fingers from prop BEFORE first render using $effect.pre
  // This ensures initialFingers is properly captured even in Svelte 5
  $effect.pre(() => {
    if (!didInitialFingerSetup) {
      didInitialFingerSetup = true;
      if (initialFingers && initialFingers.length > 0) {
        // Deep copy the initial fingers to avoid mutating the prop
        fingers = initialFingers.map(f => ({ ...f }));
      } else {
        fingers = createDefaultFingers(gridSize);
      }
    }
  });

  function getSquareParams(strips = gridSize) {
    const squareSize = strips * STRIP_WIDTH;
    const squareLeft = CENTER.x - squareSize / 2;
    const squareTop = CENTER.y - squareSize / 2;
    const earRadius = squareSize / 2;
    const stripWidth = STRIP_WIDTH;
    return { squareSize, squareLeft, squareTop, earRadius, stripWidth };
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

  // Regenerate default fingers when gridSize changes in editor mode
  // Initial finger setup is handled by $effect.pre above
  // Track the previous gridSize to detect actual changes
  let lastGridSize = gridSize;
  $effect(() => {
    const n = gridSize;
    if (!initialized) {
      initialized = true;
      lastGridSize = n;
      // Initial setup already done by $effect.pre, just mark as initialized
    } else if (!readonly && n !== lastGridSize) {
      // Only regenerate when gridSize actually changes (not on every effect run)
      lastGridSize = n;
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

  // Apply symmetry when symmetry options are enabled
  function applySymmetryToAllFingers() {
    if (!initialized || readonly) return;

    let updated = fingers.map(f => ({ ...f }));

    // Apply within-curve symmetry first
    if (symmetryWithinCurve) {
      updated = updated.map(f => applyWithinCurveSymmetry(f, 'p1'));
    }

    // Apply between-lobes symmetry: left lobe is the source, right lobe copies
    if (symmetryBetweenLobes) {
      const leftFingers = updated.filter(f => f.lobe === 'left');
      for (const leftFinger of leftFingers) {
        const idx = boundaryIndexFromId(leftFinger.id);
        const rightId = idForBoundary('right', idx);
        const rightIdx = updated.findIndex(f => f.id === rightId);
        if (rightIdx >= 0) {
          updated[rightIdx] = mapFinger(leftFinger, rightId, 'right', swapPointBetweenLobes);
        }
      }
    }

    // Apply within-lobe symmetry: first half is source, second half mirrors
    if (symmetryWithinLobe) {
      const internal = internalBoundaryCount();
      for (const lobe of ['left', 'right'] as const) {
        const lobeFingers = updated.filter(f => f.lobe === lobe);
        for (const finger of lobeFingers) {
          const idx = boundaryIndexFromId(finger.id);
          const mirrorIdx = mirrorBoundaryIndex(idx);
          if (mirrorIdx > idx && mirrorIdx >= 0 && mirrorIdx < internal) {
            const mirrorId = idForBoundary(lobe, mirrorIdx);
            const mirrorArrayIdx = updated.findIndex(f => f.id === mirrorId);
            if (mirrorArrayIdx >= 0) {
              updated[mirrorArrayIdx] = mapFinger(finger, mirrorId, lobe, p => mirrorPointWithinLobe(lobe, p));
            }
          }
        }
      }
    }

    fingers = updated;
  }

  // Track previous symmetry state to detect changes
  let prevSymmetryWithinCurve = false;
  let prevSymmetryWithinLobe = false;
  let prevSymmetryBetweenLobes = false;

  $effect(() => {
    // Only apply when a symmetry option is newly enabled
    const withinCurveChanged = symmetryWithinCurve && !prevSymmetryWithinCurve;
    const withinLobeChanged = symmetryWithinLobe && !prevSymmetryWithinLobe;
    const betweenLobesChanged = symmetryBetweenLobes && !prevSymmetryBetweenLobes;

    prevSymmetryWithinCurve = symmetryWithinCurve;
    prevSymmetryWithinLobe = symmetryWithinLobe;
    prevSymmetryBetweenLobes = symmetryBetweenLobes;

    if (withinCurveChanged || withinLobeChanged || betweenLobesChanged) {
      applySymmetryToAllFingers();
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

    const fill = hexToRgba(kind === 'left' ? heartColors.left : heartColors.right);
    lobe.fillColor = new paper.Color(fill.r, fill.g, fill.b, fill.a);
    lobe.strokeColor = null;
    lobe.strokeWidth = 0;

    lobe.data = { kind: 'lobe', lobe: kind };
    return lobe;
  }

  function lobeFillColor(lobe: LobeId) {
    const fill = hexToRgba(lobe === 'left' ? heartColors.left : heartColors.right);
    return new paper.Color(fill.r, fill.g, fill.b, fill.a);
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

  // Clean up compound paths by removing very small children (artifacts from boolean ops)
  function cleanupPath(item: paper.PathItem, minArea: number = 10): paper.PathItem {
    if (item.className === 'CompoundPath') {
      const compound = item as paper.CompoundPath;
      const children = compound.children.slice();
      for (const child of children) {
        if (Math.abs(itemArea(child)) < minArea) {
          child.remove();
        }
      }
      // If only one child left, return it directly
      if (compound.children.length === 1) {
        const single = compound.children[0] as paper.Path;
        single.fillColor = compound.fillColor;
        single.remove();
        compound.remove();
        return single;
      }
    }
    return item;
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
    // Handle multi-segment paths
    if (source.pathData) {
      const segments = fingerToSegments(source);
      // Map all control points in all segments
      const mappedSegments = segments.map(seg => ({
        p0: mapPoint(seg.p0),
        p1: mapPoint(seg.p1),
        p2: mapPoint(seg.p2),
        p3: mapPoint(seg.p3)
      }));

      // Create the mapped finger with pathData
      const mapped = updateFingerSegments(
        { ...source, id: targetId, lobe: targetLobe },
        mappedSegments
      );

      // Project endpoints to valid positions
      const projectedP0 = projectEndpoint(mapped, mapped.p0, 'p0');
      const projectedP3 = projectEndpoint(mapped, mapped.p3, 'p3');

      // If endpoints were projected, update the segments
      if (projectedP0.x !== mapped.p0.x || projectedP0.y !== mapped.p0.y ||
          projectedP3.x !== mapped.p3.x || projectedP3.y !== mapped.p3.y) {
        mappedSegments[0].p0 = projectedP0;
        mappedSegments[mappedSegments.length - 1].p3 = projectedP3;
        return updateFingerSegments(
          { ...source, id: targetId, lobe: targetLobe },
          mappedSegments
        );
      }

      return mapped;
    }

    // Simple 4-point bezier (no pathData)
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
      if (benchActive) benchCounters.candidateIsValidCalls++;

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
        if (benchActive) benchCounters.intersectionChecks++;
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

  // Multi-segment bezier support lives in `$lib/geometry/bezierSegments`.

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
    const segments = fingerToSegments(finger);
    if (segments.length !== 1) {
      // Within-curve symmetry is only well-defined for a single segment.
      return finger;
    }

    const seg = segments[0];
    if (driver === 'p2') {
      seg.p1 = reflectAcrossChordBisector(seg.p0, seg.p3, seg.p2);
    } else {
      seg.p2 = reflectAcrossChordBisector(seg.p0, seg.p3, seg.p1);
    }
    return updateFingerSegments(finger, segments);
  }

  function snapFreeControlPoint(
    fingerId: string,
    base: Finger,
    pointKey: 'p1' | 'p2',
    desired: Vec,
    isValidCandidate: (candidate: Finger) => boolean = candidate => candidateIsValid(fingerId, candidate)
  ): Vec {
    const buildCandidateAtPoint = (pos: paper.Point) =>
      ({ ...base, [pointKey]: { x: pos.x, y: pos.y } } as Finger);

    const from = toPoint(base[pointKey]);
    const desiredPt = toPoint(desired);

    const { squareSize, squareLeft, squareTop } = getSquareParams();
    const square = {
      minX: squareLeft,
      maxX: squareLeft + squareSize,
      minY: squareTop,
      maxY: squareTop + squareSize
    };

    const p0 = toPoint(base.p0);
    const p3 = toPoint(base.p3);
    const other = toPoint(pointKey === 'p1' ? base.p2 : base.p1);

    const obstacles = withInsertItemsDisabled(() => buildObstaclePaths(fingerId, base.lobe));
    try {
      const out = snapSequentialQPBezierControl(
        buildCandidateAtPoint,
        from,
        desiredPt,
        isValidCandidate,
        pointKey,
        p0,
        other,
        p3,
        obstacles,
        square
      );
      return { x: out.point.x, y: out.point.y };
    } finally {
      for (const p of obstacles) p.remove();
    }
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
    const segs = getInternalSegments(finger);
    if (segs) {
      const path = new paper.Path();
      path.moveTo(toPoint(segs[0].p0));
      for (const seg of segs) {
        path.cubicCurveTo(toPoint(seg.p1), toPoint(seg.p2), toPoint(seg.p3));
      }
      return path;
    }

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
    ribbonSamples: number,
    onlyEvenStrips = false
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
      if (onlyEvenStrips && i % 2 === 1) continue;
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

  function buildOddWeaveMask(
    leftStrips: Array<{ index: number; item: paper.PathItem }>,
    rightStrips: Array<{ index: number; item: paper.PathItem }>
  ): paper.PathItem | null {
    // Odd parity cells are where (leftIndex + rightIndex) % 2 === 1.
    // We can represent this as XOR(L_even, R_even), and rely on the even-odd fill rule
    // to do XOR without any boolean ops.
    return withInsertItemsDisabled(() => {
      const children = [
        ...leftStrips.filter((s) => s.index % 2 === 0).map((s) => s.item),
        ...rightStrips.filter((s) => s.index % 2 === 0).map((s) => s.item)
      ];
      if (!children.length) return null;
      const mask = new paper.CompoundPath({ children });
      mask.fillRule = 'evenodd';
      return mask;
    });
  }

  function draw() {
    if (!paper.project) return;
    paper.activate();
    paper.project.clear();

    const strips = gridSize;
    const { squareSize, squareLeft, squareTop, earRadius } = getSquareParams(strips);
    // Ribbon sampling is in the 600x600 coordinate system; keep it stable across display sizes
    // so gallery cards and the editor render identically.
    const ribbonSamples = readonly ? 60 : clamp(Math.round((size / BASE_CANVAS_SIZE) * 60), 16, 80);

    const fillItems: paper.Item[] = [];
    const overlayItems: paper.Item[] = [];

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
    fillItems.push(leftOutside, rightOutside);

    // Build strip areas as the space between adjacent boundary curves, clipped to overlap
    // Only even-index strips are needed for the even-odd weave mask.
    const leftStrips = buildLobeStrips('left', overlap, squareLeft, squareTop, squareSize, ribbonSamples, true);
    const rightStrips = buildLobeStrips('right', overlap, squareLeft, squareTop, squareSize, ribbonSamples, true);

    // Fast weave: rely on even-odd fill rule (no boolean ops).
    // Render overlap in left color, then overlay odd-parity cells in right color.
    const oddMask = buildOddWeaveMask(leftStrips, rightStrips);

    overlap.fillColor = lobeFillColor('left');
    overlap.strokeColor = null;
    fillItems.push(overlap);

    if (oddMask && Math.abs(itemArea(oddMask)) >= 1) {
      oddMask.fillColor = lobeFillColor('right');
      oddMask.strokeColor = null;
      fillItems.push(oddMask);
    } else {
      oddMask?.remove();
    }

    // Render boundary curves on top (for editing/selection) - skip in readonly mode
    if (!readonly) {
      for (const finger of fingers) {
        const isSelected = finger.id === selectedFingerId;
        const hidden = !showCurves;

        // Different colors for left (horizontal) and right (vertical) curves
        // Using bright cyan and orange with dark outlines for visibility on any background.
        const lobeColor =
          finger.lobe === 'left'
            ? new paper.Color('#00ddff') // Bright cyan for horizontal
            : new paper.Color('#ff8800'); // Bright orange for vertical

        if (hidden) {
          // Hidden: just a barely-visible hitbox
          const path = buildFingerPath(finger);
          path.strokeColor = new paper.Color(0, 0, 0, 0.001);
          path.strokeWidth = 2;
          path.fillColor = null;
          path.data = { kind: 'finger', fingerId: finger.id };
          overlayItems.push(path);
        } else {
          // Visible: draw outline first for contrast
          const outlinePath = buildFingerPath(finger);
          outlinePath.strokeColor = isSelected ? new paper.Color('#ffffff') : new paper.Color('#000000');
          outlinePath.strokeWidth = isSelected ? 6 : 4;
          outlinePath.strokeCap = 'round';
          outlinePath.strokeJoin = 'round';
          outlinePath.fillColor = null;
          overlayItems.push(outlinePath);

          // Then draw colored stroke on top
          const path = buildFingerPath(finger);
          path.strokeColor = isSelected ? new paper.Color('#111111') : lobeColor;
          path.strokeWidth = isSelected ? 4 : 2;
          path.strokeCap = 'round';
          path.strokeJoin = 'round';
          path.fillColor = null;
          path.data = { kind: 'finger', fingerId: finger.id };
          overlayItems.push(path);
        }
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
          overlayItems.push(c1);

          const c2 = new paper.Path.Line(toPoint(seg.p3), toPoint(seg.p2));
          c2.strokeColor = new paper.Color('#666666');
          c2.strokeWidth = 1;
          overlayItems.push(c2);

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
            overlayItems.push(p0Handle);
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
            overlayItems.push(p3Handle);
          }

          // Midpoint (junction between segments)
          if (!isFirst) {
            const midHandle = new paper.Path.Rectangle({
              point: new paper.Point(seg.p0.x - midpointSize / 2, seg.p0.y - midpointSize / 2),
              size: midpointSize
            });
            midHandle.fillColor = new paper.Color('#ffffff');
            midHandle.strokeColor = new paper.Color('#111111');
            midHandle.strokeWidth = 2;
            midHandle.data = { kind: 'control', fingerId: selected.id, pointKey: `seg${segIdx}_p0`, segmentIndex: segIdx };
            overlayItems.push(midHandle);
          }

          // Control point p1
          const p1Handle = new paper.Path.Circle(toPoint(seg.p1), handleRadius);
          p1Handle.fillColor = new paper.Color(0.9);
          p1Handle.strokeColor = new paper.Color('#111111');
          p1Handle.strokeWidth = 1.5;
          p1Handle.data = { kind: 'control', fingerId: selected.id, pointKey: `seg${segIdx}_p1`, segmentIndex: segIdx };
          overlayItems.push(p1Handle);

          // Control point p2
          const p2Handle = new paper.Path.Circle(toPoint(seg.p2), handleRadius);
          p2Handle.fillColor = new paper.Color(0.9);
          p2Handle.strokeColor = new paper.Color('#111111');
          p2Handle.strokeWidth = 1.5;
          p2Handle.data = { kind: 'control', fingerId: selected.id, pointKey: `seg${segIdx}_p2`, segmentIndex: segIdx };
          overlayItems.push(p2Handle);
        }
      }
    }

    // Group and rotate for the classic heart angle (keep state unrotated)
    const fillGroup = new paper.Group(fillItems);
    const overlayGroup = overlayItems.length ? new paper.Group(overlayItems) : null;
    const rootGroup = new paper.Group(overlayGroup ? [fillGroup, overlayGroup] : [fillGroup]);
    rootGroup.rotate(45, new paper.Point(CENTER.x, CENTER.y));

    // Fit the (filled) heart to the viewport to prevent cropping.
    // Use fillGroup bounds to keep view stable (avoid jitter when selecting handles).
    const bounds = fillGroup.bounds;
    const padding = BASE_CANVAS_SIZE * 0.02;
    const available = BASE_CANVAS_SIZE - 2 * padding;
    const zoom = Math.min(available / bounds.width, available / bounds.height);
    paper.view.zoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    paper.view.center = bounds.center;
  }

  function updateFinger(fingerId: string, updater: (f: Finger) => Finger) {
    fingers = fingers.map(f => (f.id === fingerId ? updater(f) : f));
  }

  function clampEndpoints(fingerId: string) {
    updateFinger(fingerId, (f) => {
      if (!f.pathData) {
        return {
          ...f,
          p0: projectEndpoint(f, f.p0, 'p0'),
          p3: projectEndpoint(f, f.p3, 'p3')
        };
      }

      const segments = fingerToSegments(f);
      if (!segments.length) return f;
      const first = segments[0];
      const last = segments[segments.length - 1];
      first.p0 = projectEndpoint(f, first.p0, 'p0');
      last.p3 = projectEndpoint(f, last.p3, 'p3');
      return updateFingerSegments(f, segments);
    });
  }

  function handleMouseDown(event: any) {
    const hits = paper.project.hitTestAll(event.point, {
      fill: true,
      stroke: true,
      tolerance: 10
    });
    const hit =
      hits.find((h) => h.item?.data?.kind === 'control') ??
      hits.find((h) => h.item?.data?.kind === 'finger');

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

    const segments = fingerToSegments(finger);
    const isSingleSegment = segments.length === 1 && segmentIndex === 0;
    const isP1 = pointKey.endsWith('_p1');
    const isP2 = pointKey.endsWith('_p2');
    const isMidpoint = pointKey.endsWith('_p0');

    // For single-segment p1/p2, reuse the snapping + symmetry logic to prevent intersections.
    if (isSingleSegment && (isP1 || isP2)) {
      const driverKey: 'p1' | 'p2' = isP1 ? 'p1' : 'p2';
      const base = updateFingerSegments(finger, segments); // clears pathData for single segment

      const isValidCandidate = (candidate: Finger) => {
        const symCandidate = symmetryWithinCurve ? applyWithinCurveSymmetry(candidate, driverKey) : candidate;
        return overridesAreValid(deriveSymmetryOverrides(symCandidate));
      };

      const snapped = snapFreeControlPoint(fingerId, base, driverKey, newPos, isValidCandidate);
      let primaryCandidate = { ...base, [driverKey]: snapped } as Finger;
      if (symmetryWithinCurve) {
        primaryCandidate = applyWithinCurveSymmetry(primaryCandidate, driverKey);
      }
      const overrides = deriveSymmetryOverrides(primaryCandidate);
      if (!overridesAreValid(overrides)) return false;
      applyOverrides(overrides);
      return true;
    }

    // Multi-segment controls (and midpoints): constrain the drag like other controls by backing off
    // to the nearest valid position.
    if (!isSingleSegment && (isP1 || isP2 || isMidpoint)) {
      if (segmentIndex < 0 || segmentIndex >= segments.length) return false;
      if (isMidpoint && segmentIndex <= 0) return false;

      const baseSegments = segments;
      const baseSeg = baseSegments[segmentIndex];
      const basePos = isP1 ? baseSeg.p1 : isP2 ? baseSeg.p2 : baseSeg.p0;

      const buildCandidateAt = (pos: Vec): Finger => {
        const segs = cloneSegments(baseSegments);
        if (isP1) {
          segs[segmentIndex].p1 = pos;
        } else if (isP2) {
          segs[segmentIndex].p2 = pos;
        } else {
          // Midpoint (diamond) between segments: move junction and translate adjacent controls.
          const seg = segs[segmentIndex];
          const prevSeg = segs[segmentIndex - 1];
          const delta = vecSub(pos, basePos);
          seg.p0 = pos;
          prevSeg.p3 = pos;
          prevSeg.p2 = vecAdd(prevSeg.p2, delta);
          seg.p1 = vecAdd(seg.p1, delta);
        }

        const cand: Finger = {
          ...finger,
          p0: segs[0].p0,
          p1: segs[0].p1,
          p2: segs[0].p2,
          p3: segs[segs.length - 1].p3,
          pathData: finger.pathData
        };
        return setInternalSegments(cand, segs);
      };

      const isValidCandidate = (candidate: Finger) =>
        overridesAreValid(deriveSymmetryOverrides(candidate));

      let snapped: Vec;
      if (isP1 || isP2) {
        const pointKeySimple: 'p1' | 'p2' = isP1 ? 'p1' : 'p2';
        const from = toPoint(basePos);
        const desired = toPoint(newPos);

        const { squareSize, squareLeft, squareTop } = getSquareParams();
        const square = {
          minX: squareLeft,
          maxX: squareLeft + squareSize,
          minY: squareTop,
          maxY: squareTop + squareSize
        };

        const baseSegForConstraints = baseSegments[segmentIndex];
        const p0 = toPoint(baseSegForConstraints.p0);
        const p3 = toPoint(baseSegForConstraints.p3);
        const other = toPoint(pointKeySimple === 'p1' ? baseSegForConstraints.p2 : baseSegForConstraints.p1);

        const buildCandidateAtPoint = (pos: paper.Point) =>
          buildCandidateAt({ x: pos.x, y: pos.y });

        const obstacles = withInsertItemsDisabled(() => buildObstaclePaths(fingerId, finger.lobe));
        try {
          const out = snapSequentialQPBezierControl(
            buildCandidateAtPoint,
            from,
            desired,
            isValidCandidate,
            pointKeySimple,
            p0,
            other,
            p3,
            obstacles,
            square
          );
          snapped = { x: out.point.x, y: out.point.y };
        } finally {
          for (const p of obstacles) p.remove();
        }
      } else {
        const from = toPoint(basePos);
        const desired = toPoint(newPos);

        const { squareSize, squareLeft, squareTop } = getSquareParams();
        const square = {
          minX: squareLeft,
          maxX: squareLeft + squareSize,
          minY: squareTop,
          maxY: squareTop + squareSize
        };

        const prevSegForConstraints = baseSegments[segmentIndex - 1];
        const nextSegForConstraints = baseSegments[segmentIndex];

        const prevP0 = toPoint(prevSegForConstraints.p0);
        const prevP1 = toPoint(prevSegForConstraints.p1);
        const prevP2 = toPoint(prevSegForConstraints.p2);
        const nextP1 = toPoint(nextSegForConstraints.p1);
        const nextP2 = toPoint(nextSegForConstraints.p2);
        const nextP3 = toPoint(nextSegForConstraints.p3);

        const buildCandidateAtPoint = (pos: paper.Point) =>
          buildCandidateAt({ x: pos.x, y: pos.y });

        const obstacles = withInsertItemsDisabled(() => buildObstaclePaths(fingerId, finger.lobe));
        try {
          const out = snapSequentialQPBezierJunction(
            buildCandidateAtPoint,
            from,
            desired,
            isValidCandidate,
            prevP0,
            prevP1,
            prevP2,
            nextP1,
            nextP2,
            nextP3,
            obstacles,
            square
          );
          snapped = { x: out.point.x, y: out.point.y };
        } finally {
          for (const p of obstacles) p.remove();
        }
      }
      const snappedCandidate = buildCandidateAt(snapped);
      const snappedSegments = snappedCandidate.__segments;
      if (!snappedSegments) return false;

      // Commit with proper pathData so serialization + future edits stay consistent.
      const committed = updateFingerSegments(finger, snappedSegments);
      const overrides = deriveSymmetryOverrides(committed);
      if (!overridesAreValid(overrides)) return false;
      applyOverrides(overrides);
      return true;
    }

    // General segment edit: update the segment and apply symmetry overrides (accept/reject).
    let candidate = buildSegmentUpdateCandidate(finger, segmentIndex, pointKey, newPos);
    if (!candidate) return false;

    // Within-curve symmetry only applies cleanly for single-segment curves.
    if (symmetryWithinCurve && isSingleSegment && (isP1 || isP2)) {
      candidate = applyWithinCurveSymmetry(candidate, isP1 ? 'p1' : 'p2');
    }

    const overrides = deriveSymmetryOverrides(candidate);
    if (!overridesAreValid(overrides)) return false;
    applyOverrides(overrides);
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
        const desiredPt = projectEndpoint(current, p, pointKey);

        // Multi-segment: edit the underlying segment endpoints so pathData stays in sync.
        if (current.pathData) {
          const segments = fingerToSegments(current);
          if (!segments.length) return current;
          const first = segments[0];
          const last = segments[segments.length - 1];

          const oldPt = pointKey === 'p0' ? first.p0 : last.p3;
          const dx = (desiredPt.x - oldPt.x) * fraction;
          const dy = (desiredPt.y - oldPt.y) * fraction;
          const moved = { x: oldPt.x + dx, y: oldPt.y + dy };

          if (pointKey === 'p0') {
            const nextP0 = projectEndpoint(current, moved, 'p0');
            const d = vecSub(nextP0, first.p0);
            first.p0 = nextP0;
            first.p1 = vecAdd(first.p1, d);
          } else {
            const nextP3 = projectEndpoint(current, moved, 'p3');
            const d = vecSub(nextP3, last.p3);
            last.p3 = nextP3;
            last.p2 = vecAdd(last.p2, d);
          }
          return updateFingerSegments(current, segments);
        }

        const oldPt = current[pointKey];
        const dx = (desiredPt.x - oldPt.x) * fraction;
        const dy = (desiredPt.y - oldPt.y) * fraction;
        const movedEndpoint = projectEndpoint(
          current,
          { x: oldPt.x + dx, y: oldPt.y + dy },
          pointKey
        );
        const d = vecSub(movedEndpoint, oldPt);
        let next = {
          ...current,
          [pointKey]: movedEndpoint
        } as Finger;

        if (pointKey === 'p0') {
          next.p1 = vecAdd(next.p1, d);
        } else {
          next.p2 = vecAdd(next.p2, d);
        }

        if (symmetryWithinCurve) {
          next = applyWithinCurveSymmetry(next, pointKey === 'p0' ? 'p1' : 'p2');
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

      if (current.pathData) {
        const segments = fingerToSegments(current);
        if (!segments.length) return current;

        for (const seg of segments) {
          seg.p0 = { x: seg.p0.x + dx, y: seg.p0.y + dy };
          seg.p1 = { x: seg.p1.x + dx, y: seg.p1.y + dy };
          seg.p2 = { x: seg.p2.x + dx, y: seg.p2.y + dy };
          seg.p3 = { x: seg.p3.x + dx, y: seg.p3.y + dy };
        }

        // Keep endpoints snapped to the correct edges.
        segments[0].p0 = projectEndpoint(current, segments[0].p0, 'p0');
        segments[segments.length - 1].p3 = projectEndpoint(current, segments[segments.length - 1].p3, 'p3');
        return updateFingerSegments(current, segments);
      }

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

  // DEV-only: candidateIsValid instrumentation used by external benchmarks.
  let benchActive = false;
  let benchCounters = { candidateIsValidCalls: 0, intersectionChecks: 0 };

  function buildObstaclePaths(targetId: string, lobe: LobeId): paper.Path[] {
    const paths: paper.Path[] = [];
    for (const f of fingers) {
      if (f.id === targetId) continue;
      if (f.lobe !== lobe) continue;
      paths.push(buildFingerPath(f));
    }
    return paths;
  }

  // DEV benchmarks are attached dynamically from `$lib/dev/paperHeartBench`.

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

    // Initialize colors from store and subscribe to changes
    heartColors = getColors();
    const unsubscribe = subscribeColors((c) => {
      heartColors = c;
    });

    paperReady = true;
    let detachBench: null | (() => void) = null;
    let disposed = false;
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      void import('$lib/dev/paperHeartBench').then(({ attachPaperHeartBench }) => {
        if (disposed) return;
        const ctx = {
          get paperReady() { return paperReady; },
          paper,

          get gridSize() { return gridSize; },
          set gridSize(v: number) { gridSize = v; },
          get lastGridSize() { return lastGridSize; },
          set lastGridSize(v: number) { lastGridSize = v; },
          get fingers() { return fingers; },
          set fingers(v: Finger[]) { fingers = v; },
          get selectedFingerId() { return selectedFingerId; },
          set selectedFingerId(v: string | null) { selectedFingerId = v; },
          get dragTarget() { return dragTarget; },
          set dragTarget(v: DragTarget) { dragTarget = v; },
          get symmetryWithinCurve() { return symmetryWithinCurve; },
          set symmetryWithinCurve(v: boolean) { symmetryWithinCurve = v; },
          get symmetryWithinLobe() { return symmetryWithinLobe; },
          set symmetryWithinLobe(v: boolean) { symmetryWithinLobe = v; },
          get symmetryBetweenLobes() { return symmetryBetweenLobes; },
          set symmetryBetweenLobes(v: boolean) { symmetryBetweenLobes = v; },
          get showCurves() { return showCurves; },
          set showCurves(v: boolean) { showCurves = v; },

          get benchActive() { return benchActive; },
          set benchActive(v: boolean) { benchActive = v; },
          get benchCounters() { return benchCounters; },
          set benchCounters(v: { candidateIsValidCalls: number; intersectionChecks: number }) { benchCounters = v; },

          getSquareParams,
          createDefaultFingers,
          lobePrefix,
          getFingerById,
          fingerToSegments,
          splitBezierAt,
          updateFingerSegments,
          updateFinger,
          candidateIsValid,
          deriveSymmetryOverrides,
          overridesAreValid,
          snapFreeControlPoint,
          buildSegmentUpdateCandidate,
          toPoint,
          withInsertItemsDisabled,
          buildObstaclePaths,
          draw
        };

        detachBench = attachPaperHeartBench(window as any, ctx);
      });
    }

    return () => {
      disposed = true;
      detachBench?.();
      unsubscribe();
    };
  });

  $effect(() => {
    // Track heartColors to redraw when colors change
    const _ = heartColors;
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
  {#if !readonly && selectedFingerId}
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
