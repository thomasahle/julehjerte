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
    mergeBezierSegments,
    segmentsToPathData,
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
  const MAX_BEZIER_SEGMENTS_PER_FINGER = 64;

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
  let tool: paper.Tool | null = null;
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
  let antiSymmetry = $state(false);

  // Boundary curve model (unrotated coordinates)
  let fingers = $state<Finger[]>([]);
  let selectedFingerId = $state<string | null>(null);
  let selectedAnchors = $state<number[]>([]);
  let hoverFingerId = $state<string | null>(null);
  let dragTarget = $state<DragTarget>(null);

  type HistorySnapshot = {
    fingers: Finger[];
    gridSize: number;
    selectedFingerId: string | null;
    selectedAnchors: number[];
  };

  let undoStack = $state<HistorySnapshot[]>([]);
  let redoStack = $state<HistorySnapshot[]>([]);
  let dragSnapshot: HistorySnapshot | null = null;
  let dragDirty = false;

  function cloneFinger(f: Finger): Finger {
    return {
      id: f.id,
      lobe: f.lobe,
      pathData: f.pathData
    };
  }

  function snapshotState(): HistorySnapshot {
    return {
      fingers: fingers.map(cloneFinger),
      gridSize,
      selectedFingerId,
      selectedAnchors: selectedAnchors.slice()
    };
  }

  function restoreSnapshot(s: HistorySnapshot) {
    gridSize = s.gridSize;
    lastGridSize = s.gridSize;
    fingers = s.fingers.map(cloneFinger);
    selectedFingerId = s.selectedFingerId;
    selectedAnchors = s.selectedAnchors.slice();
    dragTarget = null;
    draw();
  }

  function pushUndo(before: HistorySnapshot) {
    undoStack = [...undoStack, before];
    redoStack = [];
  }

  function undo() {
    const prev = undoStack[undoStack.length - 1];
    if (!prev) return;
    undoStack = undoStack.slice(0, -1);
    redoStack = [...redoStack, snapshotState()];
    restoreSnapshot(prev);
  }

  function redo() {
    const next = redoStack[redoStack.length - 1];
    if (!next) return;
    redoStack = redoStack.slice(0, -1);
    undoStack = [...undoStack, snapshotState()];
    restoreSnapshot(next);
  }

  function isMac() {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (readonly) return;
    const metaOrCtrl = isMac() ? e.metaKey : e.ctrlKey;
    if (metaOrCtrl && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (metaOrCtrl && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (selectedFingerId && selectedAnchors.length) {
        e.preventDefault();
        deleteSelectedAnchors();
      }
      return;
    }
  }

  function toggleAnchorSelection(anchorIdx: number) {
    const exists = selectedAnchors.includes(anchorIdx);
    selectedAnchors = exists ? selectedAnchors.filter((x) => x !== anchorIdx) : [...selectedAnchors, anchorIdx];
  }

  function setSingleAnchorSelection(anchorIdx: number) {
    selectedAnchors = [anchorIdx];
  }

  function anchorIndexFromPointKey(
    pointKey: ControlPointKey,
    segmentsLength: number,
    segmentIndex?: number
  ): number | null {
    if (pointKey === 'p0') return 0;
    if (pointKey === 'p3') return segmentsLength;
    if (typeof pointKey === 'string' && pointKey.startsWith('seg') && pointKey.endsWith('_p0')) {
      const idx = Number(pointKey.slice(3).split('_')[0]);
      if (Number.isFinite(idx) && idx >= 1 && idx <= segmentsLength - 1) return idx;
      if (
        typeof segmentIndex === 'number' &&
        Number.isFinite(segmentIndex) &&
        segmentIndex >= 1 &&
        segmentIndex <= segmentsLength - 1
      ) {
        return segmentIndex;
      }
      return null;
    }
    return null;
  }

  function deleteSelectedAnchors() {
    const fingerId = selectedFingerId;
    if (!fingerId) return;
    const finger = getFingerById(fingerId);
    if (!finger) return;

    const before = snapshotState();
    const segments = fingerToSegments(finger);
    if (segments.length <= 1) return;

    const deletions = selectedAnchors
      .filter((idx) => idx >= 1 && idx <= segments.length - 1)
      .slice()
      .sort((a, b) => b - a);
    if (!deletions.length) return;

    let segs = cloneSegments(segments);
    for (const anchorIdx of deletions) {
      if (anchorIdx <= 0 || anchorIdx >= segs.length) continue;
      const merged = mergeBezierSegments(segs[anchorIdx - 1]!, segs[anchorIdx]!);
      segs.splice(anchorIdx - 1, 2, merged);
    }

    updateFinger(fingerId, (f) => updateFingerSegments(f, segs));
    selectedAnchors = [];
    pushUndo(before);
    draw();
  }

  function insertNodeBetweenSelectedAnchors() {
    const fingerId = selectedFingerId;
    if (!fingerId) return;
    const finger = getFingerById(fingerId);
    if (!finger) return;
    if (selectedAnchors.length !== 2) return;

    const segments = fingerToSegments(finger);
    const [a, b] = selectedAnchors.slice().sort((x, y) => x - y);
    if (a == null || b == null) return;
    if (b - a !== 1) return;
    if (a < 0 || a >= segments.length) return;

    const before = snapshotState();
    const segs = cloneSegments(segments);
    const [s1, s2] = splitBezierAt(segs[a]!, 0.5);
    segs.splice(a, 1, s1, s2);

    updateFinger(fingerId, (f) => updateFingerSegments(f, segs));
    selectedAnchors = [a + 1];
    pushUndo(before);
    draw();
  }

  function applyDeltaToAnchorsInSegments(
    finger: Finger,
    segments: BezierSegment[],
    anchors: Iterable<number>,
    delta: Vec
  ): BezierSegment[] {
    if (!segments.length) return segments;
    const n = segments.length;

    const anchorList = Array.from(anchors)
      .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx <= n)
      .slice()
      .sort((a, b) => a - b);

    // Endpoints: project back onto the correct edges.
    for (const idx of anchorList) {
      if (idx !== 0 && idx !== n) continue;
      if (idx === 0) {
        const old = segments[0]!.p0;
        const desired = { x: old.x + delta.x, y: old.y + delta.y };
        const nextP0 = projectEndpoint(finger, desired, 'p0');
        const d = vecSub(nextP0, old);
        segments[0]!.p0 = nextP0;
        segments[0]!.p1 = vecAdd(segments[0]!.p1, d);
      } else {
        const last = segments[n - 1]!;
        const old = last.p3;
        const desired = { x: old.x + delta.x, y: old.y + delta.y };
        const nextP3 = projectEndpoint(finger, desired, 'p3');
        const d = vecSub(nextP3, old);
        last.p3 = nextP3;
        last.p2 = vecAdd(last.p2, d);
      }
    }

    // Internal anchors: move junction and translate adjacent handles.
    for (const idx of anchorList) {
      if (idx <= 0 || idx >= n) continue;
      const seg = segments[idx]!;
      const prev = segments[idx - 1]!;
      const old = seg.p0;
      const next = { x: old.x + delta.x, y: old.y + delta.y };
      const d = vecSub(next, old);
      seg.p0 = next;
      prev.p3 = next;
      prev.p2 = vecAdd(prev.p2, d);
      seg.p1 = vecAdd(seg.p1, d);
    }

    return segments;
  }

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

      result.push({ id: `L-${i}`, lobe: 'left', pathData: segmentsToPathData([{ p0, p1, p2, p3 }]) });
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

      result.push({ id: `R-${i}`, lobe: 'right', pathData: segmentsToPathData([{ p0, p1, p2, p3 }]) });
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
      updated = updated.map((f) => applyWithinCurveSymmetry(f));
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
  let prevAntiSymmetry = false;

  $effect(() => {
    // Only apply when a symmetry option is newly enabled
    const withinCurveChanged = symmetryWithinCurve && !prevSymmetryWithinCurve;
    const withinLobeChanged = symmetryWithinLobe && !prevSymmetryWithinLobe;
    const betweenLobesChanged = symmetryBetweenLobes && !prevSymmetryBetweenLobes;
    const antiChanged = antiSymmetry !== prevAntiSymmetry && (symmetryWithinCurve || symmetryWithinLobe || symmetryBetweenLobes);

    prevSymmetryWithinCurve = symmetryWithinCurve;
    prevSymmetryWithinLobe = symmetryWithinLobe;
    prevSymmetryBetweenLobes = symmetryBetweenLobes;
    prevAntiSymmetry = antiSymmetry;

    if (withinCurveChanged || withinLobeChanged || betweenLobesChanged || antiChanged) {
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
    const { squareSize, squareLeft, squareTop } = getSquareParams();
    if (!antiSymmetry) {
      return {
        x: squareLeft + (p.y - squareTop),
        y: squareTop + (p.x - squareLeft)
      };
    }

    // Anti-symmetry: use the other diagonal of the overlap square.
    return {
      x: squareLeft + squareSize - (p.y - squareTop),
      y: squareTop + squareSize - (p.x - squareLeft)
    };
  }

  function mirrorPointWithinLobe(lobe: LobeId, p: Vec): Vec {
    const { squareSize, squareLeft, squareTop } = getSquareParams();
    const cx = squareLeft + squareSize / 2;
    const cy = squareTop + squareSize / 2;
    if (antiSymmetry) return { x: 2 * cx - p.x, y: 2 * cy - p.y };
    if (lobe === 'left') return { x: p.x, y: 2 * cy - p.y };
    return { x: 2 * cx - p.x, y: p.y };
  }

  function mapFinger(
    source: Finger,
    targetId: string,
    targetLobe: LobeId,
    mapPoint: (p: Vec) => Vec
  ): Finger {
    const segments = fingerToSegments(source);
    const mappedSegments = segments.map((seg) => ({
      p0: mapPoint(seg.p0),
      p1: mapPoint(seg.p1),
      p2: mapPoint(seg.p2),
      p3: mapPoint(seg.p3)
    }));

    const base: Finger = { id: targetId, lobe: targetLobe, pathData: source.pathData };
    if (!mappedSegments.length) return base;

    // Project endpoints to valid positions (and keep tangents by shifting adjacent controls).
    const first = mappedSegments[0];
    const last = mappedSegments[mappedSegments.length - 1];

    const projectedP0 = projectEndpoint(base, first.p0, 'p0');
    if (projectedP0.x !== first.p0.x || projectedP0.y !== first.p0.y) {
      const d = vecSub(projectedP0, first.p0);
      first.p0 = projectedP0;
      first.p1 = vecAdd(first.p1, d);
    }

    const projectedP3 = projectEndpoint(base, last.p3, 'p3');
    if (projectedP3.x !== last.p3.x || projectedP3.y !== last.p3.y) {
      const d = vecSub(projectedP3, last.p3);
      last.p3 = projectedP3;
      last.p2 = vecAdd(last.p2, d);
    }

    return updateFingerSegments(base, mappedSegments);
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

      const candidateSegments = fingerToSegments(candidate);
      const candidateFirst = candidateSegments[0];
      const candidateLast = candidateSegments[candidateSegments.length - 1];
      if (!candidateFirst || !candidateLast) return false;

      const prevSegments = prev ? fingerToSegments(prev) : null;
      const nextSegments = next ? fingerToSegments(next) : null;
      const prevFirst = prevSegments?.[0];
      const prevLast = prevSegments?.[prevSegments.length - 1];
      const nextFirst = nextSegments?.[0];
      const nextLast = nextSegments?.[nextSegments.length - 1];

      if (candidate.lobe === 'left') {
        const minP0Y = ((prevFirst?.p0.y ?? minY) as number) + orderEps;
        const maxP0Y = ((nextFirst?.p0.y ?? maxY) as number) - orderEps;
        const minP3Y = ((prevLast?.p3.y ?? minY) as number) + orderEps;
        const maxP3Y = ((nextLast?.p3.y ?? maxY) as number) - orderEps;
        if (candidateFirst.p0.y < minP0Y || candidateFirst.p0.y > maxP0Y) return false;
        if (candidateLast.p3.y < minP3Y || candidateLast.p3.y > maxP3Y) return false;
      } else {
        const minP0X = ((prevFirst?.p0.x ?? minX) as number) + orderEps;
        const maxP0X = ((nextFirst?.p0.x ?? maxX) as number) - orderEps;
        const minP3X = ((prevLast?.p3.x ?? minX) as number) + orderEps;
        const maxP3X = ((nextLast?.p3.x ?? maxX) as number) - orderEps;
        if (candidateFirst.p0.x < minP0X || candidateFirst.p0.x > maxP0X) return false;
        if (candidateLast.p3.x < minP3X || candidateLast.p3.x > maxP3X) return false;
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
    if (segments.length >= MAX_BEZIER_SEGMENTS_PER_FINGER) return;

    const before = snapshotState();
    const oldLen = segments.length;

    // Split the last segment in half
    const lastIdx = segments.length - 1;
    const [first, second] = splitBezierAt(segments[lastIdx], 0.5);
    segments.splice(lastIdx, 1, first, second);

    updateFinger(fingerId, (f) => updateFingerSegments(f, segments));
    if (selectedFingerId === fingerId) {
      selectedAnchors = selectedAnchors.map((idx) => (idx === oldLen ? oldLen + 1 : idx));
    }
    pushUndo(before);
    draw();
  }

  function removeSegmentFromFinger(fingerId: string) {
    const finger = getFingerById(fingerId);
    if (!finger) return;

    const segments = fingerToSegments(finger);
    if (segments.length <= 1) return; // Can't remove the only segment
    const before = snapshotState();
    const oldLen = segments.length;

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
    updateFinger(fingerId, (f) => updateFingerSegments(f, segments));
    if (selectedFingerId === fingerId) {
      const removedAnchor = oldLen - 1;
      const newLen = oldLen - 1;
      selectedAnchors = selectedAnchors
        .filter((idx) => idx !== removedAnchor)
        .map((idx) => (idx === oldLen ? newLen : idx));
    }
    pushUndo(before);
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

  function pointReflectAcrossMidpoint(p0: Vec, p3: Vec, p: Vec): Vec {
    // 2*mid - p, but avoid extra allocs.
    return { x: p0.x + p3.x - p.x, y: p0.y + p3.y - p.y };
  }

  function withinSegmentSymmetryMate(p0: Vec, p3: Vec, p: Vec): Vec {
    return antiSymmetry ? pointReflectAcrossMidpoint(p0, p3, p) : reflectAcrossChordBisector(p0, p3, p);
  }

  function applyWithinCurveSymmetryToSegments(
    segments: BezierSegment[],
    segmentIndex: number,
    driver: 'p1' | 'p2' = 'p1'
  ) {
    const seg = segments[segmentIndex];
    if (!seg) return;
    if (driver === 'p2') {
      seg.p1 = withinSegmentSymmetryMate(seg.p0, seg.p3, seg.p2);
    } else {
      seg.p2 = withinSegmentSymmetryMate(seg.p0, seg.p3, seg.p1);
    }
  }

  function applyWithinCurveSymmetry(
    finger: Finger,
    segmentIndex?: number,
    driver: 'p1' | 'p2' = 'p1'
  ): Finger {
    const segments = cloneSegments(fingerToSegments(finger));
    if (!segments.length) return finger;

    if (segmentIndex != null) {
      applyWithinCurveSymmetryToSegments(segments, segmentIndex, driver);
      return updateFingerSegments(finger, segments);
    }

    for (let i = 0; i < segments.length; i++) {
      applyWithinCurveSymmetryToSegments(segments, i, driver);
    }
    return updateFingerSegments(finger, segments);
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

    return new paper.Path(finger.pathData);
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
      .sort((a, b) => {
        const a0 = fingerToSegments(a)[0]?.p0;
        const b0 = fingerToSegments(b)[0]?.p0;
        if (!a0 || !b0) return 0;
        return lobe === 'left' ? a0.y - b0.y : a0.x - b0.x;
      });

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
        const isHovered = finger.id === hoverFingerId;
        const hidden = !showCurves;

        // Different colors for left (horizontal) and right (vertical) curves
        // Using bright cyan and orange with dark outlines for visibility on any background.
        const lobeColor =
          finger.lobe === 'left'
            ? new paper.Color('#00ddff') // Bright cyan for horizontal
            : new paper.Color('#ff8800'); // Bright orange for vertical

        // Always: wide invisible hit stroke for hover/selection.
        const hitPath = buildFingerPath(finger);
        // Keep this fully transparent but still hittable (Paper.js hit-testing treats
        // `strokeColor = null` as no stroke, but alpha=0 still counts as a stroke).
        hitPath.strokeColor = new paper.Color(0, 0, 0, 0);
        hitPath.strokeWidth = 14;
        hitPath.strokeCap = 'round';
        hitPath.strokeJoin = 'round';
        hitPath.fillColor = null;
        hitPath.data = { kind: 'finger-hit', fingerId: finger.id };
        overlayItems.push(hitPath);

        if (!hidden) {
          // Visible: draw outline first for contrast
          const outlinePath = buildFingerPath(finger);
          outlinePath.strokeColor = isSelected ? new paper.Color('#ffffff') : new paper.Color('#000000');
          outlinePath.strokeWidth = isSelected ? 6 : 4;
          outlinePath.strokeCap = 'round';
          outlinePath.strokeJoin = 'round';
          outlinePath.fillColor = null;
          outlinePath.data = { kind: 'finger', fingerId: finger.id };
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

        // Hover overlay: darken stroke, or show a thin black stroke when curves are hidden.
        if (isHovered) {
          const hoverPath = buildFingerPath(finger);
          hoverPath.strokeColor = hidden ? new paper.Color('#000000') : new paper.Color(0, 0, 0, 0.35);
          hoverPath.strokeWidth = hidden ? 2 : 5;
          hoverPath.strokeCap = 'round';
          hoverPath.strokeJoin = 'round';
          hoverPath.fillColor = null;
          overlayItems.push(hoverPath);
        }
      }

      // Selected finger handles (drawn on top of weave)
      const selected = fingers.find(f => f.id === selectedFingerId);
      if (selected) {
        const segments = fingerToSegments(selected);
        const n = segments.length;
        if (n >= 1) {
          const endpointSize = 10;
          const anchorSize = 8;
          const handleRadius = 5;

          const selectedSet = new Set(selectedAnchors.filter((idx) => idx >= 0 && idx <= n));
          const visibleSet = new Set<number>();
          if (selectedSet.size) {
            for (const idx of selectedSet) {
              visibleSet.add(idx);
              visibleSet.add(Math.max(0, idx - 1));
              visibleSet.add(Math.min(n, idx + 1));
            }
          }

          const anchorPos = (idx: number): Vec => {
            if (idx <= 0) return segments[0]!.p0;
            if (idx >= n) return segments[n - 1]!.p3;
            return segments[idx]!.p0;
          };

          // Always show anchor points for the selected curve (endpoints + junctions).
          for (let idx = 0; idx <= n; idx++) {
            const pos = anchorPos(idx);
            const isEndpoint = idx === 0 || idx === n;
            const isSelectedAnchor = selectedSet.has(idx);

            const size = isEndpoint ? endpointSize : anchorSize;
            const shape = isEndpoint
              ? new paper.Path.Rectangle({
                  point: new paper.Point(pos.x - size / 2, pos.y - size / 2),
                  size
                })
              : new paper.Path.RegularPolygon(new paper.Point(pos.x, pos.y), 4, size / 2);
            if (!isEndpoint) shape.rotate(45);

            shape.fillColor = isSelectedAnchor ? new paper.Color('#ffcc00') : new paper.Color('#ffffff');
            shape.strokeColor = new paper.Color('#111111');
            shape.strokeWidth = 2;

            const pointKey: ControlPointKey =
              idx === 0 ? 'p0' : idx === n ? 'p3' : (`seg${idx}_p0` as ControlPointKey);
            shape.data = { kind: 'control', fingerId: selected.id, pointKey, segmentIndex: Math.min(idx, n - 1) };
            overlayItems.push(shape);
          }

          // Only show control handles for the selected anchors and their neighbors.
          if (visibleSet.size) {
            const drawHandle = (from: Vec, to: Vec, segIdx: number, pointKey: ControlPointKey) => {
              const line = new paper.Path.Line(toPoint(from), toPoint(to));
              line.strokeColor = new paper.Color('#666666');
              line.strokeWidth = 1;
              overlayItems.push(line);

              const handle = new paper.Path.Circle(toPoint(to), handleRadius);
              handle.fillColor = new paper.Color(0.9);
              handle.strokeColor = new paper.Color('#111111');
              handle.strokeWidth = 1.5;
              handle.data = { kind: 'control', fingerId: selected.id, pointKey, segmentIndex: segIdx };
              overlayItems.push(handle);
            };

            for (const idx of visibleSet) {
              if (idx === 0) {
                drawHandle(anchorPos(0), segments[0]!.p1, 0, `seg0_p1` as ControlPointKey);
              } else if (idx === n) {
                drawHandle(anchorPos(n), segments[n - 1]!.p2, n - 1, `seg${n - 1}_p2` as ControlPointKey);
              } else {
                drawHandle(anchorPos(idx), segments[idx - 1]!.p2, idx - 1, `seg${idx - 1}_p2` as ControlPointKey);
                drawHandle(anchorPos(idx), segments[idx]!.p1, idx, `seg${idx}_p1` as ControlPointKey);
              }
            }
          }
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
      const segments = fingerToSegments(f);
      if (!segments.length) return f;
      const first = segments[0];
      const last = segments[segments.length - 1];
      const nextP0 = projectEndpoint(f, first.p0, 'p0');
      if (nextP0.x !== first.p0.x || nextP0.y !== first.p0.y) {
        const d = vecSub(nextP0, first.p0);
        first.p0 = nextP0;
        first.p1 = vecAdd(first.p1, d);
      }
      const nextP3 = projectEndpoint(f, last.p3, 'p3');
      if (nextP3.x !== last.p3.x || nextP3.y !== last.p3.y) {
        const d = vecSub(nextP3, last.p3);
        last.p3 = nextP3;
        last.p2 = vecAdd(last.p2, d);
      }
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
      hits.find((h) => h.item?.data?.kind === 'finger-hit') ??
      hits.find((h) => h.item?.data?.kind === 'finger');

    if (!hit) {
      selectedFingerId = null;
      selectedAnchors = [];
      dragTarget = null;
      draw();
      return;
    }

    const data = hit.item.data;
    if (data.kind === 'control') {
      const isShift = Boolean(event.modifiers?.shift);
      selectedFingerId = data.fingerId;
      const f = getFingerById(data.fingerId);
      if (f) {
        const segmentsLen = fingerToSegments(f).length;
        const anchorIdx = anchorIndexFromPointKey(data.pointKey, segmentsLen, data.segmentIndex);
        if (anchorIdx != null) {
          if (isShift) toggleAnchorSelection(anchorIdx);
          else setSingleAnchorSelection(anchorIdx);
        } else {
          // Handle selected: select its associated anchor (start for p1, end for p2).
          if (typeof data.pointKey === 'string' && data.pointKey.endsWith('_p1')) {
            const idx = Number.isFinite(data.segmentIndex) ? data.segmentIndex : 0;
            setSingleAnchorSelection(Math.max(0, Math.min(segmentsLen, idx)));
          } else if (typeof data.pointKey === 'string' && data.pointKey.endsWith('_p2')) {
            const idx = Number.isFinite(data.segmentIndex) ? data.segmentIndex + 1 : 1;
            setSingleAnchorSelection(Math.max(0, Math.min(segmentsLen, idx)));
          } else {
            selectedAnchors = [];
          }
        }
      }
      dragTarget = {
        kind: 'control',
        fingerId: data.fingerId,
        pointKey: data.pointKey,
        segmentIndex: data.segmentIndex
      };
      dragSnapshot = snapshotState();
      dragDirty = false;
      draw();
      return;
    }

    if (selectedFingerId !== data.fingerId) {
      selectedAnchors = [];
    }
    selectedFingerId = data.fingerId;
    dragTarget = { kind: 'path', fingerId: data.fingerId };
    dragSnapshot = snapshotState();
    dragDirty = false;
    draw();
  }

  function handleMouseMove(event: any) {
    const hit = paper.project.hitTest(event.point, {
      fill: false,
      stroke: true,
      tolerance: 10
    });
    const next =
      hit?.item?.data?.kind === 'finger-hit' || hit?.item?.data?.kind === 'finger'
        ? (hit.item.data.fingerId as string)
        : null;
    if (next !== hoverFingerId) {
      hoverFingerId = next;
      draw();
    }
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
    const isP1 = pointKey.endsWith('_p1');
    const isP2 = pointKey.endsWith('_p2');
    const isMidpoint = pointKey.endsWith('_p0');

    // Segment controls (and midpoints): constrain the drag by backing off
    // to the nearest valid position.
    if (isP1 || isP2 || isMidpoint) {
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

        return setInternalSegments(updateFingerSegments(finger, segs), segs);
      };

      const isValidCandidate = (candidate: Finger) => {
        if (!symmetryWithinCurve) return overridesAreValid(deriveSymmetryOverrides(candidate));

        const segs = cloneSegments(getInternalSegments(candidate) ?? fingerToSegments(candidate));
        if (isP1 || isP2) {
          applyWithinCurveSymmetryToSegments(segs, segmentIndex, isP1 ? 'p1' : 'p2');
        } else {
          applyWithinCurveSymmetryToSegments(segs, segmentIndex - 1, 'p1');
          applyWithinCurveSymmetryToSegments(segs, segmentIndex, 'p2');
        }
        const symCandidate = updateFingerSegments(candidate, segs);
        return overridesAreValid(deriveSymmetryOverrides(symCandidate));
      };

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
      const snappedSegments = getInternalSegments(snappedCandidate);
      if (!snappedSegments) return false;

      const committedSegs = cloneSegments(snappedSegments);
      if (symmetryWithinCurve) {
        if (isP1 || isP2) {
          applyWithinCurveSymmetryToSegments(committedSegs, segmentIndex, isP1 ? 'p1' : 'p2');
        } else {
          applyWithinCurveSymmetryToSegments(committedSegs, segmentIndex - 1, 'p1');
          applyWithinCurveSymmetryToSegments(committedSegs, segmentIndex, 'p2');
        }
      }

      // Commit with proper pathData so serialization + future edits stay consistent.
      const committed = updateFingerSegments(finger, committedSegs);
      const overrides = deriveSymmetryOverrides(committed);
      if (!overridesAreValid(overrides)) return false;
      applyOverrides(overrides);
      return true;
    }

    // General segment edit: update the segment and apply symmetry overrides (accept/reject).
    let candidate = buildSegmentUpdateCandidate(finger, segmentIndex, pointKey, newPos);
    if (!candidate) return false;

    if (symmetryWithinCurve) {
      if (isP1 || isP2) {
        candidate = applyWithinCurveSymmetry(candidate, segmentIndex, isP1 ? 'p1' : 'p2');
      } else if (isMidpoint) {
        candidate = applyWithinCurveSymmetry(candidate, segmentIndex - 1, 'p1');
        candidate = applyWithinCurveSymmetry(candidate, segmentIndex, 'p2');
      }
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
      const pointKey = target.pointKey;
      const segIdx = target.segmentIndex ?? 0;

      // Anchor drag (endpoints + junctions), supports multi-select.
      const base = getFingerById(target.fingerId);
      if (base) {
        const segLen = fingerToSegments(base).length;
        const anchorIdx = anchorIndexFromPointKey(pointKey, segLen, segIdx);
        if (anchorIdx != null) {
          const dRaw = unrotateDelta(event.delta);
          const anchorsToMove = selectedAnchors.includes(anchorIdx) ? selectedAnchors : [anchorIdx];
          applyConstrainedUpdate(target.fingerId, (current, fraction) => {
            const segs = cloneSegments(fingerToSegments(current));
            const d = { x: dRaw.x * fraction, y: dRaw.y * fraction };
            applyDeltaToAnchorsInSegments(current, segs, anchorsToMove, d);
            return updateFingerSegments(current, segs);
          });
          dragDirty = true;
          draw();
          return;
        }
      }

      const p = unrotatePoint(event.point);

      // Multi-segment control handle drag (has seg prefix).
      if (typeof pointKey === 'string' && pointKey.startsWith('seg')) {
        updateSegmentControlPoint(target.fingerId, segIdx, pointKey, p);
        dragDirty = true;
        draw();
        return;
      }
      if (pointKey !== 'p0' && pointKey !== 'p3') return;

      applyConstrainedUpdate(target.fingerId, (current, fraction) => {
        const desiredPt = projectEndpoint(current, p, pointKey);

        const segments = cloneSegments(fingerToSegments(current));
        if (!segments.length) return current;
        const first = segments[0]!;
        const last = segments[segments.length - 1]!;

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

        let next = updateFingerSegments(current, segments);
        if (symmetryWithinCurve) {
          if (pointKey === 'p0') {
            next = applyWithinCurveSymmetry(next, 0, 'p1');
          } else {
            next = applyWithinCurveSymmetry(next, segments.length - 1, 'p2');
          }
        }
        return next;
      });
      dragDirty = true;
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

      const segments = cloneSegments(fingerToSegments(current));
      if (!segments.length) return current;
      const first = segments[0]!;
      const last = segments[segments.length - 1]!;

      let dx = dRaw.x;
      let dy = dRaw.y;

      if (current.lobe === 'left') {
        dx = 0;
        const dyMin = minY - Math.min(first.p0.y, last.p3.y);
        const dyMax = maxY - Math.max(first.p0.y, last.p3.y);
        dy = clamp(dRaw.y, dyMin, dyMax);
      } else {
        dy = 0;
        const dxMin = minX - Math.min(first.p0.x, last.p3.x);
        const dxMax = maxX - Math.max(first.p0.x, last.p3.x);
        dx = clamp(dRaw.x, dxMin, dxMax);
      }

      dx *= fraction;
      dy *= fraction;

      for (const seg of segments) {
        seg.p0 = { x: seg.p0.x + dx, y: seg.p0.y + dy };
        seg.p1 = { x: seg.p1.x + dx, y: seg.p1.y + dy };
        seg.p2 = { x: seg.p2.x + dx, y: seg.p2.y + dy };
        seg.p3 = { x: seg.p3.x + dx, y: seg.p3.y + dy };
      }

      // Keep endpoints snapped to the correct edges (and preserve tangents).
      const nextP0 = projectEndpoint(current, segments[0]!.p0, 'p0');
      if (nextP0.x !== segments[0]!.p0.x || nextP0.y !== segments[0]!.p0.y) {
        const d = vecSub(nextP0, segments[0]!.p0);
        segments[0]!.p0 = nextP0;
        segments[0]!.p1 = vecAdd(segments[0]!.p1, d);
      }
      const nextP3 = projectEndpoint(current, segments[segments.length - 1]!.p3, 'p3');
      if (nextP3.x !== segments[segments.length - 1]!.p3.x || nextP3.y !== segments[segments.length - 1]!.p3.y) {
        const d = vecSub(nextP3, segments[segments.length - 1]!.p3);
        segments[segments.length - 1]!.p3 = nextP3;
        segments[segments.length - 1]!.p2 = vecAdd(segments[segments.length - 1]!.p2, d);
      }

      return updateFingerSegments(current, segments);
    });
    dragDirty = true;
    draw();
  }

  function handleMouseUp() {
    if (dragTarget?.kind === 'path') {
      clampEndpoints(dragTarget.fingerId);
    }
    if (dragSnapshot && dragDirty) {
      pushUndo(dragSnapshot);
    }
    dragSnapshot = null;
    dragDirty = false;
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
      tool = new paper.Tool();
      tool.onMouseDown = handleMouseDown;
      tool.onMouseMove = handleMouseMove;
      tool.onMouseDrag = handleMouseDrag;
      tool.onMouseUp = handleMouseUp;
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
    }

    // Initialize colors from store and subscribe to changes
    heartColors = getColors();
    const unsubscribe = subscribeColors((c) => {
      heartColors = c;
    });

    paperReady = true;
    let detachBench: null | (() => void) = null;
    let detachDebug: null | (() => void) = null;
    let disposed = false;
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      void Promise.all([import('$lib/dev/paperHeartBench'), import('$lib/dev/paperHeartDebug')]).then(
        ([benchMod, debugMod]) => {
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
          get selectedAnchors() { return selectedAnchors; },
          set selectedAnchors(v: number[]) { selectedAnchors = v; },
          get hoverFingerId() { return hoverFingerId; },
          set hoverFingerId(v: string | null) { hoverFingerId = v; },
          get dragTarget() { return dragTarget; },
          set dragTarget(v: DragTarget) { dragTarget = v; },
          get symmetryWithinCurve() { return symmetryWithinCurve; },
          set symmetryWithinCurve(v: boolean) { symmetryWithinCurve = v; },
          get symmetryWithinLobe() { return symmetryWithinLobe; },
          set symmetryWithinLobe(v: boolean) { symmetryWithinLobe = v; },
          get symmetryBetweenLobes() { return symmetryBetweenLobes; },
          set symmetryBetweenLobes(v: boolean) { symmetryBetweenLobes = v; },
          get antiSymmetry() { return antiSymmetry; },
          set antiSymmetry(v: boolean) { antiSymmetry = v; },
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
          cloneSegments,
          splitBezierAt,
          updateFingerSegments,
          updateFinger,
          applyDeltaToAnchorsInSegments,
          candidateIsValid,
          deriveSymmetryOverrides,
          overridesAreValid,
          buildSegmentUpdateCandidate,
          snapshotState,
          pushUndo,
          undo,
          toPoint,
          withInsertItemsDisabled,
          buildObstaclePaths,
          draw
        };

        detachBench = benchMod.attachPaperHeartBench(window as any, ctx);
        detachDebug = debugMod.attachPaperHeartDebug(window as any, ctx);
      });
    }

    return () => {
      disposed = true;
      tool?.remove();
      tool = null;
      detachBench?.();
      detachDebug?.();
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyDown);
      }
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
      <label class="checkbox">
        <input
          type="checkbox"
          bind:checked={antiSymmetry}
          disabled={!symmetryWithinCurve && !symmetryWithinLobe && !symmetryBetweenLobes}
        />
        Anti-symmetry
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
    {@const canDeleteNode = selectedAnchors.some((idx) => idx >= 1 && idx <= segCount - 1)}
    {@const canInsertNode =
      selectedAnchors.length === 2 &&
      Math.abs(selectedAnchors[0]! - selectedAnchors[1]!) === 1}
    <div class="segment-controls">
      <span class="segment-label">Curve segments: {segCount}</span>
      <button class="segment-btn" onclick={() => addSegmentToFinger(selectedFingerId!)} disabled={segCount >= MAX_BEZIER_SEGMENTS_PER_FINGER}>
        + Add
      </button>
      <button class="segment-btn" onclick={() => removeSegmentFromFinger(selectedFingerId!)} disabled={segCount <= 1}>
        - Remove
      </button>
      <button class="segment-btn" onclick={insertNodeBetweenSelectedAnchors} disabled={!canInsertNode}>
        + Insert node
      </button>
      <button class="segment-btn" onclick={deleteSelectedAnchors} disabled={!canDeleteNode}>
        Delete node
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
