<script lang="ts">
  import { onMount } from "svelte";
  import paperPkg from "paper";
  import SplitIcon from "@lucide/svelte/icons/split";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import TriSwitch, {
    type TriSwitchValue,
  } from "$lib/components/TriSwitch.svelte";
  import CurveNodeToolIcon from "$lib/components/icons/CurveNodeToolIcon.svelte";
  import NodeCornerIcon from "$lib/components/icons/NodeCornerIcon.svelte";
  import NodeSmoothIcon from "$lib/components/icons/NodeSmoothIcon.svelte";
  import NodeSymmetricIcon from "$lib/components/icons/NodeSymmetricIcon.svelte";
  import SegmentCurveIcon from "$lib/components/icons/SegmentCurveIcon.svelte";
  import SegmentLineIcon from "$lib/components/icons/SegmentLineIcon.svelte";
  import { insertNodeInFinger, shiftNodeTypesOnDelete } from "$lib/editor/commands";
  import { curveHitFromPaperHit, getClickCount, type CurveHit } from "$lib/editor/hitTest";
  import { toggleNumberInList } from "$lib/editor/selection";
  import type { Finger, GridSize, Vec, LobeId, NodeType } from "$lib/types/heart";
  import {
    type BezierSegment,
    cloneSegments,
    fingerToSegments,
    getInternalSegments,
    mergeBezierSegments,
    segmentsToPathData,
    setInternalSegments,
    splitBezierAt,
    updateFingerSegments,
  } from "$lib/geometry/bezierSegments";
  import {
    dot,
    midpoint,
    normalize,
    perp,
    vecAdd,
    vecDist,
    vecLerp,
    vecScale,
    vecSub,
  } from "$lib/geometry/vec";
  import {
    getColors,
    subscribeColors,
    type HeartColors,
  } from "$lib/stores/colors";
  import {
    buildFingerPath as buildFingerPathShared,
    buildLobeShape as buildLobeShapeShared,
    buildLobeStrips as buildLobeStripsShared,
    buildOddWeaveMask as buildOddWeaveMaskShared,
    itemArea as itemAreaShared,
    lobeFillColor as lobeFillColorShared,
  } from "$lib/rendering/paperWeave";

  // Each component instance gets its own Paper.js scope
  const { PaperScope } = paperPkg;
  let paper: paper.PaperScope = new PaperScope();

  type ControlPointKey =
    | "p0"
    | "p1"
    | "p2"
    | "p3"
    | `seg${number}_p${"0" | "1" | "2" | "3"}`;

  type DragTarget =
    | {
        kind: "control";
        fingerId: string;
        pointKey: ControlPointKey;
        segmentIndex?: number;
      }
    | { kind: "path"; fingerId: string }
    | null;

  // Props
  interface Props {
    readonly?: boolean;
    initialFingers?: Finger[];
    initialGridSize?: GridSize | number;
    size?: number;
    onFingersChange?: (fingers: Finger[], gridSize: GridSize) => void;
  }

  let {
    readonly = false,
    initialFingers = undefined,
    initialGridSize = 3,
    size = 600,
    onFingersChange = undefined,
  }: Props = $props();

  const BASE_CANVAS_SIZE = 600;
  const CENTER: Vec = { x: BASE_CANVAS_SIZE / 2, y: BASE_CANVAS_SIZE / 2 };
  const ROTATION_RAD = Math.PI / 4;
  // Overlap rectangle size is `gridSize.(x|y) * STRIP_WIDTH` (600px canvas, 75px per strip).
  const STRIP_WIDTH = 75;
  const MIN_STRIPS = 2;
  const MAX_STRIPS = 8;
  const OUTER_EDGE_TOL = 0.75;
  const OUTER_EDGE_REMOVE_TOL = 1.25;

  // Colors from store
  let heartColors = $state<HeartColors>({ left: "#ffffff", right: "#cc0000" });

  function hexToRgba(hex: string): {
    r: number;
    g: number;
    b: number;
    a: number;
  } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16) / 255,
          g: parseInt(result[2], 16) / 255,
          b: parseInt(result[3], 16) / 255,
          a: 1,
        }
      : { r: 1, g: 1, b: 1, a: 1 };
  }

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  function clampInt(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  function normalizeGridSize(raw: GridSize | number): GridSize {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      const n = clampInt(raw, MIN_STRIPS, MAX_STRIPS);
      return { x: n, y: n };
    }
    const x = (raw as GridSize)?.x;
    const y = (raw as GridSize)?.y;
    if (typeof x === "number" && typeof y === "number") {
      return {
        x: clampInt(x, MIN_STRIPS, MAX_STRIPS),
        y: clampInt(y, MIN_STRIPS, MAX_STRIPS),
      };
    }
    return { x: 3, y: 3 };
  }

  function rotateVecAroundCenter(v: Vec, angleRad: number): Vec {
    const sin = Math.sin(angleRad);
    const cos = Math.cos(angleRad);
    const dx = v.x - CENTER.x;
    const dy = v.y - CENTER.y;
    return {
      x: CENTER.x + dx * cos - dy * sin,
      y: CENTER.y + dx * sin + dy * cos,
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
      y: delta.x * sin + delta.y * cos,
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
  // Initialized from props in `$effect.pre` below; avoid capturing `initialGridSize` here.
  let gridSize = $state(normalizeGridSize(3)); // strips: x (cols) and y (rows)
  // Overlap rectangle edges in unrotated coordinates (may be offset from CENTER).
  let overlapLeft = $state(0);
  let overlapRight = $state(0);
  let overlapTop = $state(0);
  let overlapBottom = $state(0);
  type SymmetryMode = TriSwitchValue;
  let editor = $state<{
    showCurves: boolean;
    withinCurveMode: SymmetryMode;
    withinLobeMode: SymmetryMode;
    betweenLobesMode: SymmetryMode;
  }>({
    showCurves: true,
    withinCurveMode: 0,
    withinLobeMode: 0,
    betweenLobesMode: 0,
  });

  // Derived views for readability in the rest of the file.
  let showCurves = $derived(editor.showCurves);
  let symmetryWithinCurve = $derived(editor.withinCurveMode !== 0);
  let antiWithinCurve = $derived(editor.withinCurveMode === 2);
  let symmetryWithinLobe = $derived(editor.withinLobeMode !== 0);
  let antiWithinLobe = $derived(editor.withinLobeMode === 2);
  let symmetryBetweenLobes = $derived(editor.betweenLobesMode !== 0);
  let antiBetweenLobes = $derived(editor.betweenLobesMode === 2);

  // Handle semantics: a "missing" handle is represented by collapsing it onto the anchor.
  // We hide collapsed handles and treat them as intentionally removed.
  const HANDLE_COLLAPSE_EPS = 0.25;
  const HANDLE_SNAP_EPS = 8;

  function isHandleCollapsed(handle: Vec, anchor: Vec): boolean {
    return vecDist(handle, anchor) <= HANDLE_COLLAPSE_EPS;
  }

  // Boundary curve model (unrotated coordinates)
  let fingers = $state<Finger[]>([]);
  let hoverFingerId = $state<string | null>(null);
  let dragTarget = $state<DragTarget>(null);

  type Selection = {
    fingerId: string | null;
    anchors: number[];
    segments: number[];
    lastCurveHit: CurveHit | null;
  };
  let selection = $state<Selection>({
    fingerId: null,
    anchors: [],
    segments: [],
    lastCurveHit: null,
  });

  type HistorySnapshot = {
    fingers: Finger[];
    gridSize: GridSize;
    overlap: { left: number; right: number; top: number; bottom: number };
    selection: Selection;
  };

  let undoStack = $state<HistorySnapshot[]>([]);
  let redoStack = $state<HistorySnapshot[]>([]);
  let dragSnapshot: HistorySnapshot | null = null;
  let dragDirty = false;

  function cloneFinger(f: Finger): Finger {
    return {
      id: f.id,
      lobe: f.lobe,
      pathData: f.pathData,
      nodeTypes: f.nodeTypes ? { ...f.nodeTypes } : undefined,
    };
  }

  function snapshotSelection(): Selection {
    return {
      fingerId: selection.fingerId,
      anchors: selection.anchors.slice(),
      segments: selection.segments.slice(),
      lastCurveHit: selection.lastCurveHit ? { ...selection.lastCurveHit } : null,
    };
  }

  function restoreSelection(s: Selection) {
    selection.fingerId = s.fingerId;
    selection.anchors = s.anchors.slice();
    selection.segments = (s.segments ?? []).slice();
    selection.lastCurveHit = s.lastCurveHit ? { ...s.lastCurveHit } : null;
  }

  function snapshotState(): HistorySnapshot {
    return {
      fingers: fingers.map(cloneFinger),
      gridSize,
      overlap: {
        left: overlapLeft,
        right: overlapRight,
        top: overlapTop,
        bottom: overlapBottom,
      },
      selection: snapshotSelection(),
    };
  }

  function restoreSnapshot(s: HistorySnapshot) {
    gridSize = s.gridSize;
    overlapLeft = s.overlap.left;
    overlapRight = s.overlap.right;
    overlapTop = s.overlap.top;
    overlapBottom = s.overlap.bottom;
    fingers = s.fingers.map(cloneFinger);
    restoreSelection(s.selection);
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
    return (
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    );
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (readonly) return;
    const metaOrCtrl = isMac() ? e.metaKey : e.ctrlKey;
    if (metaOrCtrl && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (metaOrCtrl && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      if (selection.fingerId && selection.anchors.length) {
        e.preventDefault();
        deleteSelectedAnchors();
      }
      return;
    }
  }

  function toggleAnchorSelection(anchorIdx: number) {
    selection.lastCurveHit = null;
    selection.anchors = toggleNumberInList(selection.anchors, anchorIdx);
  }

  function setSingleAnchorSelection(anchorIdx: number) {
    selection.lastCurveHit = null;
    selection.anchors = [anchorIdx];
  }

  function getAnchorNodeType(finger: Finger, anchorIdx: number): NodeType {
    const key = String(anchorIdx);
    return finger.nodeTypes?.[key] ?? "corner";
  }

  function setSelectedAnchorsNodeType(type: NodeType) {
    const fingerId = selection.fingerId;
    if (!fingerId) return;
    const finger = getFingerById(fingerId);
    if (!finger) return;
    const segCount = fingerToSegments(finger).length;
    const targets = selection.anchors.filter((idx) => idx >= 0 && idx <= segCount);
    if (!targets.length) return;
    const internal = targets.filter((idx) => idx >= 1 && idx <= segCount - 1);

    const before = snapshotState();
    updateFinger(fingerId, (f) => {
      const nextNodeTypes: Record<string, NodeType> = {
        ...(f.nodeTypes ?? {}),
      };
      if (type === "corner") {
        for (const idx of targets) delete nextNodeTypes[String(idx)];
        return {
          ...f,
          nodeTypes: Object.keys(nextNodeTypes).length
            ? nextNodeTypes
            : undefined,
        };
      }

      for (const idx of targets) nextNodeTypes[String(idx)] = type;

      const segs = cloneSegments(fingerToSegments(f));
      for (const anchorIdx of internal) {
        if (anchorIdx <= 0 || anchorIdx >= segs.length) continue;
        const prev = segs[anchorIdx - 1]!;
        const next = segs[anchorIdx]!;
        const anchor = next.p0;
        const out = next.p1;
        const inn = prev.p2;

        const vOut = vecSub(out, anchor);
        const vIn = vecSub(inn, anchor);
        const useV = vOut.x || vOut.y ? vOut : { x: -vIn.x, y: -vIn.y };
        const dir = normalize(useV);

        if (type === "symmetric") {
          prev.p2 = { x: anchor.x - useV.x, y: anchor.y - useV.y };
        } else {
          const len = vecDist(prev.p2, anchor);
          prev.p2 = vecAdd(anchor, vecScale(dir, -len));
        }
      }

      return { ...updateFingerSegments(f, segs), nodeTypes: nextNodeTypes };
    });
    pushUndo(before);
    draw();
  }

  function anchorIndexFromPointKey(
    pointKey: ControlPointKey,
    segmentsLength: number,
    segmentIndex?: number,
  ): number | null {
    if (pointKey === "p0") return 0;
    if (pointKey === "p3") return segmentsLength;
    if (
      typeof pointKey === "string" &&
      pointKey.startsWith("seg") &&
      pointKey.endsWith("_p0")
    ) {
      const idx = Number(pointKey.slice(3).split("_")[0]);
      if (Number.isFinite(idx) && idx >= 1 && idx <= segmentsLength - 1)
        return idx;
      if (
        typeof segmentIndex === "number" &&
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
    const fingerId = selection.fingerId;
    if (!fingerId) return;
    const finger = getFingerById(fingerId);
    if (!finger) return;

    const before = snapshotState();
    const segments = fingerToSegments(finger);
    if (segments.length <= 1) return;

    const deletions = selection.anchors
      .filter((idx) => idx >= 1 && idx <= segments.length - 1)
      .slice()
      .sort((a, b) => b - a);
    if (!deletions.length) return;

    let segs = cloneSegments(segments);
    let nodeTypes = finger.nodeTypes;
    for (const anchorIdx of deletions) {
      if (anchorIdx <= 0 || anchorIdx >= segs.length) continue;
      const merged = mergeBezierSegments(
        segs[anchorIdx - 1]!,
        segs[anchorIdx]!,
      );
      segs.splice(anchorIdx - 1, 2, merged);
      nodeTypes = shiftNodeTypesOnDelete(nodeTypes, anchorIdx);
    }

    updateFinger(fingerId, (f) => ({
      ...updateFingerSegments(f, segs),
      nodeTypes,
    }));
    selection.anchors = [];
    selection.segments = [];
    selection.lastCurveHit = null;
    pushUndo(before);
    draw();
  }

  function insertNodeBetweenSelectedAnchors() {
    const fingerId = selection.fingerId;
    if (!fingerId) return;
    const finger = getFingerById(fingerId);
    if (!finger) return;
    if (selection.anchors.length !== 2) return;

    const [a, b] = selection.anchors.slice().sort((x, y) => x - y);
    if (a == null || b == null) return;
    if (b - a !== 1) return;
    const segmentsLength = fingerToSegments(finger).length;
    if (a < 0 || a >= segmentsLength) return;

    const before = snapshotState();
    const t =
      selection.lastCurveHit &&
      selection.lastCurveHit.fingerId === fingerId &&
      selection.lastCurveHit.segmentIndex === a
        ? Math.min(0.999, Math.max(0.001, selection.lastCurveHit.t))
        : 0.5;
    const inserted = insertNodeInFinger(finger, a, t);
    if (!inserted) return;
    const { insertedAnchorIdx } = inserted;
    let candidate: Finger = inserted.finger;
    if (symmetryWithinCurve) candidate = applyWithinCurveSymmetry(candidate);
    const overrides = deriveSymmetryOverrides(candidate);
    if (!overridesAreValid(overrides)) return;
    applyOverrides(overrides);

    selection.anchors = [insertedAnchorIdx];
    selection.segments = [];
    selection.lastCurveHit = null;
    pushUndo(before);
    draw();
  }

  function insertNodeAtCurveHit(hitInfo: CurveHit) {
    const fingerId = hitInfo.fingerId;
    const finger = getFingerById(fingerId);
    if (!finger) return;

    const segmentsLength = fingerToSegments(finger).length;
    if (!segmentsLength) return;
    const segIdx = Math.max(
      0,
      Math.min(segmentsLength - 1, hitInfo.segmentIndex),
    );
    const t = Math.min(0.999, Math.max(0.001, hitInfo.t));

    const before = snapshotState();
    const inserted = insertNodeInFinger(finger, segIdx, t);
    if (!inserted) return;
    const { insertedAnchorIdx } = inserted;

    let candidate: Finger = inserted.finger;
    if (symmetryWithinCurve) candidate = applyWithinCurveSymmetry(candidate);
    const overrides = deriveSymmetryOverrides(candidate);
    if (!overridesAreValid(overrides)) return;
    applyOverrides(overrides);

    selection.fingerId = fingerId;
    selection.anchors = [insertedAnchorIdx];
    selection.segments = [];
    selection.lastCurveHit = null;
    pushUndo(before);
    draw();
  }

  function getSelectedSegmentIndexes(segmentsLength: number): number[] {
    const uniq = new Set<number>();
    for (const idx of selection.segments) {
      if (Number.isFinite(idx) && idx >= 0 && idx < segmentsLength)
        uniq.add(idx);
    }
    if (uniq.size) return Array.from(uniq).sort((a, b) => a - b);

    if (selection.anchors.length === 2) {
      const [a, b] = selection.anchors;
      if (a != null && b != null && Math.abs(a - b) === 1) {
        const segIdx = Math.min(a, b);
        if (segIdx >= 0 && segIdx < segmentsLength) return [segIdx];
      }
    }
    return [];
  }

  function makeSelectedSegmentsStraight() {
    const fingerId = selection.fingerId;
    if (!fingerId) return;
    const finger = getFingerById(fingerId);
    if (!finger) return;

    const before = snapshotState();
    const segs = cloneSegments(fingerToSegments(finger));
    const targets = getSelectedSegmentIndexes(segs.length);
    if (!targets.length) return;

    for (const segIdx of targets) {
      const seg = segs[segIdx]!;
      seg.p1 = { ...seg.p0 };
      seg.p2 = { ...seg.p3 };
    }

    let candidate = updateFingerSegments(finger, segs);
    if (symmetryWithinCurve) candidate = applyWithinCurveSymmetry(candidate);

    const overrides = deriveSymmetryOverrides(candidate);
    if (!overridesAreValid(overrides)) return;
    applyOverrides(overrides);
    pushUndo(before);
    draw();
  }

  function makeSelectedSegmentsCurved() {
    const fingerId = selection.fingerId;
    if (!fingerId) return;
    const finger = getFingerById(fingerId);
    if (!finger) return;

    const before = snapshotState();
    const segs = cloneSegments(fingerToSegments(finger));
    const targets = getSelectedSegmentIndexes(segs.length);
    if (!targets.length) return;

    const lengthFor = (a: Vec, b: Vec) => vecDist(a, b) / 3;
    const dirFrom = (v: Vec): Vec => {
      const d = normalize(v);
      return d.x || d.y ? d : { x: 1, y: 0 };
    };

    for (const segIdx of targets) {
      const seg = segs[segIdx]!;

      // Out handle at p0.
      if (isHandleCollapsed(seg.p1, seg.p0)) {
        let dir: Vec;
        if (segIdx > 0 && !isHandleCollapsed(segs[segIdx - 1]!.p2, seg.p0)) {
          dir = dirFrom(vecSub(seg.p0, segs[segIdx - 1]!.p2));
        } else {
          dir = dirFrom(vecSub(seg.p3, seg.p0));
        }
        const len = lengthFor(seg.p0, seg.p3);
        seg.p1 = vecAdd(seg.p0, vecScale(dir, len));
      }

      // In handle at p3.
      if (isHandleCollapsed(seg.p2, seg.p3)) {
        let dir: Vec;
        if (
          segIdx < segs.length - 1 &&
          !isHandleCollapsed(segs[segIdx + 1]!.p1, seg.p3)
        ) {
          dir = dirFrom(vecSub(seg.p3, segs[segIdx + 1]!.p1));
        } else {
          dir = dirFrom(vecSub(seg.p0, seg.p3));
        }
        const len = lengthFor(seg.p0, seg.p3);
        seg.p2 = vecAdd(seg.p3, vecScale(dir, len));
      }
    }

    let candidate = updateFingerSegments(finger, segs);
    if (symmetryWithinCurve) candidate = applyWithinCurveSymmetry(candidate);

    const overrides = deriveSymmetryOverrides(candidate);
    if (!overridesAreValid(overrides)) return;
    applyOverrides(overrides);
    pushUndo(before);
    draw();
  }

  function makeSelectedAnchorsCurved() {
    const fingerId = selection.fingerId;
    if (!fingerId) return;
    const finger = getFingerById(fingerId);
    if (!finger) return;

    const segs = cloneSegments(fingerToSegments(finger));
    const n = segs.length;
    if (!n) return;

    const internal = selection.anchors
      .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx <= n)
      .slice()
      .sort((a, b) => a - b);
    if (!internal.length) return;

    const before = snapshotState();

    for (const anchorIdx of internal) {
      if (anchorIdx <= 0) {
        const seg = segs[0]!;
        if (isHandleCollapsed(seg.p1, seg.p0)) {
          const dir = normalize(vecSub(seg.p3, seg.p0));
          const len = vecDist(seg.p0, seg.p3) / 3;
          seg.p1 = vecAdd(seg.p0, vecScale(dir, len));
        }
        continue;
      }
      if (anchorIdx >= n) {
        const seg = segs[n - 1]!;
        if (isHandleCollapsed(seg.p2, seg.p3)) {
          const dir = normalize(vecSub(seg.p0, seg.p3));
          const len = vecDist(seg.p0, seg.p3) / 3;
          seg.p2 = vecAdd(seg.p3, vecScale(dir, len));
        }
        continue;
      }

      const prev = segs[anchorIdx - 1]!;
      const next = segs[anchorIdx]!;
      const anchor = next.p0;

      const inChord = normalize(vecSub(anchor, prev.p0));
      const outChord = normalize(vecSub(next.p3, anchor));
      const dir = normalize(vecAdd(inChord, outChord));
      if (!(dir.x || dir.y)) continue;

      if (isHandleCollapsed(prev.p2, anchor)) {
        const len = vecDist(prev.p0, anchor) / 3;
        prev.p2 = vecAdd(anchor, vecScale(dir, -len));
      }
      if (isHandleCollapsed(next.p1, anchor)) {
        const len = vecDist(anchor, next.p3) / 3;
        next.p1 = vecAdd(anchor, vecScale(dir, len));
      }
    }

    let candidate = updateFingerSegments(finger, segs);
    if (symmetryWithinCurve) candidate = applyWithinCurveSymmetry(candidate);

    const overrides = deriveSymmetryOverrides(candidate);
    if (!overridesAreValid(overrides)) return;
    applyOverrides(overrides);
    pushUndo(before);
    draw();
  }

  function applyDeltaToAnchorsInSegments(
    finger: Finger,
    segments: BezierSegment[],
    anchors: Iterable<number>,
    delta: Vec,
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
        const nextP0 = projectEndpoint(finger, desired, "p0");
        const d = vecSub(nextP0, old);
        segments[0]!.p0 = nextP0;
        segments[0]!.p1 = vecAdd(segments[0]!.p1, d);
      } else {
        const last = segments[n - 1]!;
        const old = last.p3;
        const desired = { x: old.x + delta.x, y: old.y + delta.y };
        const nextP3 = projectEndpoint(finger, desired, "p3");
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
      gridSize = normalizeGridSize(initialGridSize);
      setCenteredOverlapRect(gridSize);
      if (initialFingers && initialFingers.length > 0) {
        // Deep copy the initial fingers to avoid mutating the prop
        fingers = initialFingers.map((f) => ({ ...f }));
        // Infer overlap rectangle placement from the incoming curves (supports nxm + offset).
        const inferred = inferOverlapRectFromFingers(fingers, gridSize);
        setOverlapRect(inferred);
      } else {
        fingers = createDefaultFingers(gridSize);
      }
      // Always include the four outer boundary curves (legacy designs omitted them).
      ensureOuterBoundaryCurves();
      renumberBoundaryIds();
      syncGridSizeToFingers();
      initialized = true;
    }
  });

  function setCenteredOverlapRect(size: GridSize) {
    const width = size.x * STRIP_WIDTH;
    const height = size.y * STRIP_WIDTH;
    overlapLeft = CENTER.x - width / 2;
    overlapRight = overlapLeft + width;
    overlapTop = CENTER.y - height / 2;
    overlapBottom = overlapTop + height;
  }

  // Back-compat helper for existing dev benchmarks and any remaining call sites.
  // NOTE: For non-square overlap rectangles, this returns the min dimension as `squareSize`.
  function getSquareParams(strips: GridSize | number = gridSize) {
    const size = normalizeGridSize(strips);
    const width = size.x * STRIP_WIDTH;
    const height = size.y * STRIP_WIDTH;
    const squareSize = Math.min(width, height);
    const squareLeft = CENTER.x - width / 2;
    const squareTop = CENTER.y - height / 2;
    return { squareSize, squareLeft, squareTop };
  }

  function getOverlapRect() {
    return {
      left: overlapLeft,
      right: overlapRight,
      top: overlapTop,
      bottom: overlapBottom,
      width: overlapRight - overlapLeft,
      height: overlapBottom - overlapTop,
    };
  }

  function setOverlapRect(rect: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }) {
    overlapLeft = rect.left;
    overlapRight = rect.right;
    overlapTop = rect.top;
    overlapBottom = rect.bottom;
  }

  function median(values: number[]): number {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  }

  function inferOverlapRectFromFingers(
    curFingers: Finger[],
    fallbackGridSize: GridSize,
  ) {
    const leftCandidates: number[] = [];
    const rightCandidates: number[] = [];
    const topCandidates: number[] = [];
    const bottomCandidates: number[] = [];

    for (const f of curFingers) {
      const segs = fingerToSegments(f);
      if (!segs.length) continue;
      const start = segs[0]!.p0;
      const end = segs[segs.length - 1]!.p3;
      if (f.lobe === "left") {
        leftCandidates.push(Math.min(start.x, end.x));
        rightCandidates.push(Math.max(start.x, end.x));
      } else {
        topCandidates.push(Math.min(start.y, end.y));
        bottomCandidates.push(Math.max(start.y, end.y));
      }
    }

    const expectedW = fallbackGridSize.x * STRIP_WIDTH;
    const expectedH = fallbackGridSize.y * STRIP_WIDTH;
    const centeredLeft = CENTER.x - expectedW / 2;
    const centeredTop = CENTER.y - expectedH / 2;

    let left = leftCandidates.length ? median(leftCandidates) : centeredLeft;
    let right = rightCandidates.length ? median(rightCandidates) : centeredLeft + expectedW;
    let top = topCandidates.length ? median(topCandidates) : centeredTop;
    let bottom = bottomCandidates.length ? median(bottomCandidates) : centeredTop + expectedH;

    if (Math.abs(right - left - expectedW) <= 3) right = left + expectedW;
    if (Math.abs(bottom - top - expectedH) <= 3) bottom = top + expectedH;

    return { left, right, top, bottom };
  }

  function inferGridSizeFromFingers(
    curFingers: Finger[],
    fallbackGridSize: GridSize,
  ): GridSize {
    const leftCount = curFingers.filter((f) => f.lobe === "left").length;
    const rightCount = curFingers.filter((f) => f.lobe === "right").length;
    // Boundaries include the two outer edges, so strips = boundaries - 1.
    const x = clampInt(rightCount - 1, MIN_STRIPS, MAX_STRIPS);
    const y = clampInt(leftCount - 1, MIN_STRIPS, MAX_STRIPS);
    if (x === fallbackGridSize.x && y === fallbackGridSize.y) return fallbackGridSize;
    return { x, y };
  }

  function makeNewBoundary(lobe: LobeId, pos: number): Finger {
    const id = `${lobePrefix(lobe)}-tmp-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const { left, right, top, bottom } = getOverlapRect();

    if (lobe === "right") {
      const x = pos;
      const p0: Vec = { x, y: bottom };
      const p3: Vec = { x, y: top };
      const p1: Vec = { ...p0 };
      const p2: Vec = { ...p3 };
      return { id, lobe, pathData: segmentsToPathData([{ p0, p1, p2, p3 }]) };
    }

    const y = pos;
    const p0: Vec = { x: right, y };
    const p3: Vec = { x: left, y };
    const p1: Vec = { ...p0 };
    const p2: Vec = { ...p3 };
    return { id, lobe, pathData: segmentsToPathData([{ p0, p1, p2, p3 }]) };
  }

  function projectEndpoint(
    finger: Finger,
    point: Vec,
    pointKey: "p0" | "p3",
  ): Vec {
    const { left: minX, right: maxX, top: minY, bottom: maxY } =
      getOverlapRect();

    if (finger.lobe === "left") {
      const y = clamp(point.y, minY, maxY);
      const x = pointKey === "p0" ? maxX : minX;
      return { x, y };
    }

    const x = clamp(point.x, minX, maxX);
    const y = pointKey === "p0" ? maxY : minY;
    return { x, y };
  }

  function createDefaultFingers(sizeInput: GridSize | number): Finger[] {
    const size = normalizeGridSize(sizeInput as any);
    const width = size.x * STRIP_WIDTH;
    const height = size.y * STRIP_WIDTH;
    const left = CENTER.x - width / 2;
    const top = CENTER.y - height / 2;
    const right = left + width;
    const bottom = top + height;
    const result: Finger[] = [];

    // Fingers are the space between adjacent curves, so we store the *boundary* curves.
    // For N strips, there are (N+1) boundaries per lobe (including both outer edges).
    const boundariesLeft = Math.max(0, size.y + 1);
    const boundariesRight = Math.max(0, size.x + 1);

    // Left lobe boundaries: across overlap rectangle (right edge -> left edge)
    for (let i = 0; i < boundariesLeft; i++) {
      const t = size.y ? i / size.y : 0;
      const y = top + t * height;
      const p0: Vec = { x: right, y };
      const p3: Vec = { x: left, y };

      const isEdge = i === 0 || i === size.y;
      const bow = (t - 0.5) * height * 0.12;
      const p1: Vec = isEdge ? { ...p0 } : { x: p0.x - width * 0.3, y: p0.y + bow };
      const p2: Vec = isEdge ? { ...p3 } : { x: p3.x + width * 0.3, y: p3.y - bow };

      result.push({
        id: `L-${i}`,
        lobe: "left",
        pathData: segmentsToPathData([{ p0, p1, p2, p3 }]),
      });
    }

    // Right lobe boundaries: across overlap rectangle (bottom edge -> top edge)
    for (let i = 0; i < boundariesRight; i++) {
      const t = size.x ? i / size.x : 0;
      const x = left + t * width;
      const p0: Vec = { x, y: bottom };
      const p3: Vec = { x, y: top };

      const isEdge = i === 0 || i === size.x;
      const bow = (t - 0.5) * width * 0.12;
      const p1: Vec = isEdge ? { ...p0 } : { x: p0.x + bow, y: p0.y - height * 0.3 };
      const p2: Vec = isEdge ? { ...p3 } : { x: p3.x - bow, y: p3.y + height * 0.3 };

      result.push({
        id: `R-${i}`,
        lobe: "right",
        pathData: segmentsToPathData([{ p0, p1, p2, p3 }]),
      });
    }

    return result;
  }

  // Notify parent of changes
  $effect(() => {
    if (onFingersChange && initialized) {
      onFingersChange(fingers, gridSize);
    }
  });

  // Apply symmetry when symmetry options are enabled
  function applySymmetryToAllFingers() {
    if (!initialized || readonly) return;

    let updated = fingers.map((f) => ({ ...f }));

    // Apply within-curve symmetry first
    if (symmetryWithinCurve) {
      updated = updated.map((f) => applyWithinCurveSymmetry(f));
    }

    // Apply between-lobes symmetry: left lobe is the source, right lobe copies
    if (symmetryBetweenLobes) {
      if (!canSymmetryBetweenLobes()) {
        editor.betweenLobesMode = 0;
      } else {
      const leftFingers = updated.filter((f) => f.lobe === "left");
      for (const leftFinger of leftFingers) {
        const idx = boundaryIndexFromId(leftFinger.id);
        const rightId = idForBoundary(
          "right",
          mateBoundaryIndexBetweenLobes("left", idx),
        );
        const rightIdx = updated.findIndex((f) => f.id === rightId);
        if (rightIdx >= 0) {
          updated[rightIdx] = mapFinger(
            leftFinger,
            rightId,
            "right",
            (p) => swapPointBetweenLobes(p, antiBetweenLobes),
            antiBetweenLobes,
          );
        }
      }
      }
    }

    // Apply within-lobe symmetry: first half is source, second half mirrors
    if (symmetryWithinLobe) {
      for (const lobe of ["left", "right"] as const) {
        const internal = boundaryCurveCount(lobe);
        const lobeFingers = updated.filter((f) => f.lobe === lobe);
        for (const finger of lobeFingers) {
          const idx = boundaryIndexFromId(finger.id);
          const mirrorIdx = mirrorBoundaryIndex(lobe, idx);
          if (mirrorIdx > idx && mirrorIdx >= 0 && mirrorIdx < internal) {
            const mirrorId = idForBoundary(lobe, mirrorIdx);
            const mirrorArrayIdx = updated.findIndex((f) => f.id === mirrorId);
            if (mirrorArrayIdx >= 0) {
              updated[mirrorArrayIdx] = mapFinger(
                finger,
                mirrorId,
                lobe,
                (p) => mirrorPointWithinLobe(lobe, p, antiWithinLobe),
                antiWithinLobe,
              );
            }
          }
        }
      }
    }

    fingers = updated;
  }

  // Track previous symmetry state to detect changes
  let prevWithinCurveMode: SymmetryMode = 0;
  let prevWithinLobeMode: SymmetryMode = 0;
  let prevBetweenLobesMode: SymmetryMode = 0;

  $effect(() => {
    // Only apply when symmetry is enabled/changed (turning off does not mutate).
    const shouldApply =
      (editor.withinCurveMode !== 0 &&
        editor.withinCurveMode !== prevWithinCurveMode) ||
      (editor.withinLobeMode !== 0 && editor.withinLobeMode !== prevWithinLobeMode) ||
      (editor.betweenLobesMode !== 0 &&
        editor.betweenLobesMode !== prevBetweenLobesMode);

    prevWithinCurveMode = editor.withinCurveMode;
    prevWithinLobeMode = editor.withinLobeMode;
    prevBetweenLobesMode = editor.betweenLobesMode;

    if (shouldApply) {
      applySymmetryToAllFingers();
    }
  });

  function buildLobeShape(
    kind: LobeId,
    overlapLeft: number,
    overlapTop: number,
    overlapWidth: number,
    overlapHeight: number,
  ): paper.PathItem {
    return buildLobeShapeShared(
      paper,
      kind,
      heartColors,
      overlapLeft,
      overlapTop,
      overlapWidth,
      overlapHeight,
    );
  }

  function lobeFillColor(lobe: LobeId) {
    return lobeFillColorShared(paper, lobe, heartColors);
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
    return itemAreaShared(item);
  }

  // Clean up compound paths by removing very small children (artifacts from boolean ops)
  function cleanupPath(
    item: paper.PathItem,
    minArea: number = 10,
  ): paper.PathItem {
    if (item.className === "CompoundPath") {
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
    const parts = id.split("-");
    const idx = Number(parts[1]);
    return Number.isFinite(idx) ? idx : 0;
  }

  function lobePrefix(lobe: LobeId) {
    return lobe === "left" ? "L" : "R";
  }

  function idForBoundary(lobe: LobeId, index: number) {
    return `${lobePrefix(lobe)}-${index}`;
  }

  function oppositeLobe(lobe: LobeId): LobeId {
    return lobe === "left" ? "right" : "left";
  }

  function canSymmetryBetweenLobes() {
    return gridSize.x === gridSize.y;
  }

  function stripsForLobe(lobe: LobeId): number {
    return lobe === "left" ? gridSize.y : gridSize.x;
  }

  function boundaryCurveCount(lobe: LobeId) {
    return Math.max(0, stripsForLobe(lobe) + 1);
  }

  function mirrorBoundaryIndex(lobe: LobeId, index: number) {
    return boundaryCurveCount(lobe) - 1 - index;
  }

  function mateBoundaryIndexBetweenLobes(lobe: LobeId, index: number) {
    return antiBetweenLobes ? mirrorBoundaryIndex(lobe, index) : index;
  }

  function renumberBoundaryIds(): Map<string, string> {
    const idMap = new Map<string, string>();

    const left = fingers
      .filter((f) => f.lobe === "left")
      .slice()
      .sort((a, b) => {
        const ay = fingerToSegments(a)[0]?.p0.y ?? 0;
        const by = fingerToSegments(b)[0]?.p0.y ?? 0;
        return ay - by;
      });
    const right = fingers
      .filter((f) => f.lobe === "right")
      .slice()
      .sort((a, b) => {
        const ax = fingerToSegments(a)[0]?.p0.x ?? 0;
        const bx = fingerToSegments(b)[0]?.p0.x ?? 0;
        return ax - bx;
      });

    const nextLeft = left.map((f, i) => {
      const nextId = idForBoundary("left", i);
      idMap.set(f.id, nextId);
      return f.id === nextId ? f : { ...f, id: nextId };
    });
    const nextRight = right.map((f, i) => {
      const nextId = idForBoundary("right", i);
      idMap.set(f.id, nextId);
      return f.id === nextId ? f : { ...f, id: nextId };
    });

    fingers = [...nextLeft, ...nextRight];

    if (selection.fingerId)
      selection.fingerId = idMap.get(selection.fingerId) ?? selection.fingerId;
    if (hoverFingerId) hoverFingerId = idMap.get(hoverFingerId) ?? hoverFingerId;
    if (selection.lastCurveHit) {
      selection.lastCurveHit = {
        ...selection.lastCurveHit,
        fingerId:
          idMap.get(selection.lastCurveHit.fingerId) ??
          selection.lastCurveHit.fingerId,
      };
    }
    if (dragTarget && (dragTarget.kind === "control" || dragTarget.kind === "path")) {
      const mapped = idMap.get(dragTarget.fingerId);
      if (mapped) dragTarget = { ...dragTarget, fingerId: mapped };
    }
    return idMap;
  }

  function getFingerById(id: string, overrides?: Map<string, Finger>) {
    return overrides?.get(id) ?? fingers.find((f) => f.id === id);
  }

  function swapPointBetweenLobes(p: Vec, anti = false): Vec {
    const { left, top, width, height } = getOverlapRect();
    const u = width ? (p.x - left) / width : 0;
    const v = height ? (p.y - top) / height : 0;
    if (!anti) return { x: left + v * width, y: top + u * height };
    return { x: left + (1 - v) * width, y: top + (1 - u) * height };
  }

  function mirrorPointWithinLobe(lobe: LobeId, p: Vec, anti = false): Vec {
    const { left, top, width, height } = getOverlapRect();
    const cx = left + width / 2;
    const cy = top + height / 2;
    if (anti) return { x: 2 * cx - p.x, y: 2 * cy - p.y };
    if (lobe === "left") return { x: p.x, y: 2 * cy - p.y };
    return { x: 2 * cx - p.x, y: p.y };
  }

  function mapFinger(
    source: Finger,
    targetId: string,
    targetLobe: LobeId,
    mapPoint: (p: Vec) => Vec,
    reverseDirection = false,
  ): Finger {
    const segments = fingerToSegments(source);
    const mappedSegments = segments.map((seg) => ({
      p0: mapPoint(seg.p0),
      p1: mapPoint(seg.p1),
      p2: mapPoint(seg.p2),
      p3: mapPoint(seg.p3),
    }));

    const base: Finger = {
      id: targetId,
      lobe: targetLobe,
      pathData: source.pathData,
    };
    if (!mappedSegments.length) return base;

    if (reverseDirection) {
      mappedSegments.reverse();
      for (const seg of mappedSegments) {
        const p0 = seg.p0;
        const p1 = seg.p1;
        seg.p0 = seg.p3;
        seg.p1 = seg.p2;
        seg.p2 = p1;
        seg.p3 = p0;
      }
    }

    // Project endpoints to valid positions (and keep tangents by shifting adjacent controls).
    const first = mappedSegments[0];
    const last = mappedSegments[mappedSegments.length - 1];

    const projectedP0 = projectEndpoint(base, first.p0, "p0");
    if (projectedP0.x !== first.p0.x || projectedP0.y !== first.p0.y) {
      const d = vecSub(projectedP0, first.p0);
      first.p0 = projectedP0;
      first.p1 = vecAdd(first.p1, d);
    }

    const projectedP3 = projectEndpoint(base, last.p3, "p3");
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
    const internal = boundaryCurveCount(primary.lobe);
    if (idx < 0 || idx >= internal) return overrides;
    const mirrorIdx = mirrorBoundaryIndex(primary.lobe, idx);

    if (
      symmetryWithinLobe &&
      mirrorIdx !== idx &&
      mirrorIdx >= 0 &&
      mirrorIdx < internal
    ) {
      const mirrorId = idForBoundary(primary.lobe, mirrorIdx);
      const existing = getFingerById(mirrorId);
      if (existing) {
        overrides.set(
          mirrorId,
          mapFinger(
            primary,
            mirrorId,
            primary.lobe,
            (p) => mirrorPointWithinLobe(primary.lobe, p, antiWithinLobe),
            antiWithinLobe,
          ),
        );
      }
    }

    if (symmetryBetweenLobes && canSymmetryBetweenLobes()) {
      const otherLobe = oppositeLobe(primary.lobe);
      const otherId = idForBoundary(
        otherLobe,
        mateBoundaryIndexBetweenLobes(primary.lobe, idx),
      );
      const otherExisting = getFingerById(otherId);
      if (otherExisting) {
        overrides.set(
          otherId,
          mapFinger(
            primary,
            otherId,
            otherLobe,
            (p) => swapPointBetweenLobes(p, antiBetweenLobes),
            antiBetweenLobes,
          ),
        );
      }

      if (
        symmetryWithinLobe &&
        mirrorIdx !== idx &&
        mirrorIdx >= 0 &&
        mirrorIdx < internal
      ) {
        const otherMirrorId = idForBoundary(
          otherLobe,
          mateBoundaryIndexBetweenLobes(primary.lobe, mirrorIdx),
        );
        const otherMirrorExisting = getFingerById(otherMirrorId);
        if (otherMirrorExisting) {
          overrides.set(
            otherMirrorId,
            mapFinger(
              primary,
              otherMirrorId,
              otherLobe,
              (p) =>
                swapPointBetweenLobes(
                  mirrorPointWithinLobe(primary.lobe, p, antiWithinLobe),
                  antiBetweenLobes,
                ),
              antiWithinLobe !== antiBetweenLobes,
            ),
          );
        }
      }
    }

    return overrides;
  }

  function candidateIsValid(
    fingerId: string,
    candidate: Finger,
    overrides?: Map<string, Finger>,
  ): boolean {
    return withInsertItemsDisabled(() => {
      if (benchActive) benchCounters.candidateIsValidCalls++;

      const { left: minX, right: maxX, top: minY, bottom: maxY } =
        getOverlapRect();
      const orderEps = 1;
      const tol = 0.5;

      // Keep original boundary ordering: a boundary cannot move past its neighbors.
      const idx = boundaryIndexFromId(candidate.id);
      const prevId = idForBoundary(candidate.lobe, idx - 1);
      const nextId = idForBoundary(candidate.lobe, idx + 1);
      const prev = idx > 0 ? getFingerById(prevId, overrides) : undefined;
      const next =
        idx < boundaryCurveCount(candidate.lobe) - 1
          ? getFingerById(nextId, overrides)
          : undefined;

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

      if (candidate.lobe === "left") {
        const minP0Y =
          typeof prevFirst?.p0.y === "number" ? prevFirst.p0.y + orderEps : minY;
        const maxP0Y =
          typeof nextFirst?.p0.y === "number" ? nextFirst.p0.y - orderEps : maxY;
        const minP3Y =
          typeof prevLast?.p3.y === "number" ? prevLast.p3.y + orderEps : minY;
        const maxP3Y =
          typeof nextLast?.p3.y === "number" ? nextLast.p3.y - orderEps : maxY;
        if (candidateFirst.p0.y < minP0Y || candidateFirst.p0.y > maxP0Y)
          return false;
        if (candidateLast.p3.y < minP3Y || candidateLast.p3.y > maxP3Y)
          return false;
      } else {
        const minP0X =
          typeof prevFirst?.p0.x === "number" ? prevFirst.p0.x + orderEps : minX;
        const maxP0X =
          typeof nextFirst?.p0.x === "number" ? nextFirst.p0.x - orderEps : maxX;
        const minP3X =
          typeof prevLast?.p3.x === "number" ? prevLast.p3.x + orderEps : minX;
        const maxP3X =
          typeof nextLast?.p3.x === "number" ? nextLast.p3.x - orderEps : maxX;
        if (candidateFirst.p0.x < minP0X || candidateFirst.p0.x > maxP0X)
          return false;
        if (candidateLast.p3.x < minP3X || candidateLast.p3.x > maxP3X)
          return false;
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

  function getSegmentCount(finger: Finger | undefined): number {
    if (!finger) return 0;
    return fingerToSegments(finger).length;
  }

  function getNodeTypeSelection(
    finger: Finger | undefined,
    anchors: number[],
  ): NodeType | null {
    if (!finger || !anchors.length) return null;
    const firstType = getAnchorNodeType(finger, anchors[0]!);
    for (let i = 1; i < anchors.length; i++) {
      if (getAnchorNodeType(finger, anchors[i]!) !== firstType) return null;
    }
    return firstType;
  }

  // UI-only derived values (keeps template small).
  let selectedFinger = $derived(
    !readonly && selection.fingerId
      ? fingers.find((f) => f.id === selection.fingerId)
      : undefined,
  );
  let selectedSegCount = $derived(getSegmentCount(selectedFinger));
  let selectedSegs = $derived(getSelectedSegmentIndexes(selectedSegCount));
  let canMakeSegmentsStraight = $derived(selectedSegs.length > 0);
  let canMakeSegmentsCurved = $derived(selectedSegs.length > 0);
  let canDeleteNode = $derived(
    selection.anchors.some(
      (idx) => idx >= 1 && idx <= selectedSegCount - 1,
    ),
  );
  let canInsertNode = $derived(
    selection.anchors.length === 2 &&
      Math.abs(selection.anchors[0]! - selection.anchors[1]!) === 1,
  );
  let validAnchors = $derived(
    selection.anchors.filter((idx) => idx >= 0 && idx <= selectedSegCount),
  );
  let nodeTypeSelected = $derived(getNodeTypeSelection(selectedFinger, validAnchors));

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

  function withinCurveMatePoint(segments: BezierSegment[], p: Vec): Vec {
    if (!segments.length) return p;
    const p0 = segments[0]!.p0;
    const p3 = segments[segments.length - 1]!.p3;
    return antiWithinCurve
      ? pointReflectAcrossMidpoint(p0, p3, p)
      : reflectAcrossChordBisector(p0, p3, p);
  }

  function applyWithinCurveSymmetryForControlInSegments(
    segments: BezierSegment[],
    segmentIndex: number,
    driver: "p1" | "p2" = "p1",
  ) {
    const n = segments.length;
    if (!n) return;
    if (segmentIndex < 0 || segmentIndex >= n) return;

    const mateIdx = n - 1 - segmentIndex;
    const mate = (p: Vec) => withinCurveMatePoint(segments, p);
    if (driver === "p2") {
      segments[mateIdx]!.p1 = mate(segments[segmentIndex]!.p2);
    } else {
      segments[mateIdx]!.p2 = mate(segments[segmentIndex]!.p1);
    }
  }

  function applyWithinCurveSymmetryAllInSegments(
    finger: Finger,
    segments: BezierSegment[],
    sourceSide: "start" | "end" = "start",
  ) {
    const n = segments.length;
    if (!n) return;

    // Include endpoints in the constraint by aligning the opposite endpoint to match
    // the driver endpoint (so the chord becomes horizontal/vertical).
    // This uses the same endpoint projection logic as normal anchor moves, so handles
    // translate with the endpoints just like internal anchors.
    const start = segments[0]!.p0;
    const end = segments[n - 1]!.p3;
    if (finger.lobe === "left") {
      if (sourceSide === "start") {
        const desiredEnd = projectEndpoint(
          finger,
          { x: end.x, y: start.y },
          "p3",
        );
        applyDeltaToAnchorsInSegments(
          finger,
          segments,
          [n],
          vecSub(desiredEnd, end),
        );
      } else {
        const desiredStart = projectEndpoint(
          finger,
          { x: start.x, y: end.y },
          "p0",
        );
        applyDeltaToAnchorsInSegments(
          finger,
          segments,
          [0],
          vecSub(desiredStart, start),
        );
      }
    } else {
      if (sourceSide === "start") {
        const desiredEnd = projectEndpoint(
          finger,
          { x: start.x, y: end.y },
          "p3",
        );
        applyDeltaToAnchorsInSegments(
          finger,
          segments,
          [n],
          vecSub(desiredEnd, end),
        );
      } else {
        const desiredStart = projectEndpoint(
          finger,
          { x: end.x, y: start.y },
          "p0",
        );
        applyDeltaToAnchorsInSegments(
          finger,
          segments,
          [0],
          vecSub(desiredStart, start),
        );
      }
    }

    const mate = (p: Vec) => withinCurveMatePoint(segments, p);

    const anchors: Vec[] = [];
    const outHandles: Vec[] = [];
    const inHandles: Array<Vec | null> = [];
    inHandles.length = n + 1;
    inHandles[0] = null;

    anchors[0] = segments[0]!.p0;
    for (let i = 0; i < n; i++) {
      outHandles[i] = segments[i]!.p1;
      inHandles[i + 1] = segments[i]!.p2;
      anchors[i + 1] = segments[i]!.p3;
    }

    for (let i = 0; i < n; i++) {
      const j = n - 1 - i;
      if (i >= j) break;
      const src = sourceSide === "start" ? i : j;
      const dst = sourceSide === "start" ? j : i;

      // dst segment is src segment reversed + mirrored/anti-mirrored.
      anchors[dst] = mate(anchors[src + 1]!);
      anchors[dst + 1] = mate(anchors[src]!);
      outHandles[dst] = mate(inHandles[src + 1]!);
      inHandles[dst + 1] = mate(outHandles[src]!);
    }

    if (n % 2 === 1) {
      const mid = (n - 1) / 2;
      if (sourceSide === "start") {
        inHandles[mid + 1] = mate(outHandles[mid]!);
      } else {
        outHandles[mid] = mate(inHandles[mid + 1]!);
      }
    }

    for (let i = 0; i < n; i++) {
      const p0 = anchors[i]!;
      const p3 = anchors[i + 1]!;
      const p1 = outHandles[i]!;
      const p2 = inHandles[i + 1]!;
      segments[i] = { p0, p1, p2, p3 };
    }
  }

  function applyWithinCurveSymmetryForMovedAnchors(
    finger: Finger,
    segments: BezierSegment[],
    movedAnchors: Iterable<number>,
    draggedAnchorIdx: number,
  ) {
    const n = segments.length;
    if (!n) return;

    const moved = Array.from(movedAnchors)
      .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx <= n)
      .slice();

    const includesEndpoint = moved.some((idx) => idx === 0 || idx === n);
    if (includesEndpoint) {
      const sourceSide: "start" | "end" =
        draggedAnchorIdx >= n / 2 ? "end" : "start";
      applyWithinCurveSymmetryAllInSegments(finger, segments, sourceSide);
      return;
    }

    const matePoint = (p: Vec) => withinCurveMatePoint(segments, p);
    const anchorPos = (idx: number): Vec => {
      if (idx <= 0) return segments[0]!.p0;
      if (idx >= n) return segments[n - 1]!.p3;
      return segments[idx]!.p0;
    };
    const moveAnchorTo = (idx: number, pos: Vec) => {
      const old = anchorPos(idx);
      const d = vecSub(pos, old);
      applyDeltaToAnchorsInSegments(finger, segments, [idx], d);
    };

    for (const idx of moved) {
      const mateIdx = n - idx;
      if (mateIdx < 0 || mateIdx > n) continue;

      if (mateIdx === idx) {
        const a = anchorPos(idx);
        const projected = vecLerp(a, matePoint(a), 0.5);
        moveAnchorTo(idx, projected);
      } else {
        const desiredMate = matePoint(anchorPos(idx));
        moveAnchorTo(mateIdx, desiredMate);
      }

      // Also update the handle mates adjacent to this anchor.
      if (idx < n) {
        const mateSeg = n - 1 - idx;
        segments[mateSeg]!.p2 = matePoint(segments[idx]!.p1);
      }
      if (idx > 0) {
        const mateSeg = n - idx;
        segments[mateSeg]!.p1 = matePoint(segments[idx - 1]!.p2);
      }
    }
  }

  function applyWithinCurveSymmetry(
    finger: Finger,
    segmentIndex?: number,
    driver: "p1" | "p2" = "p1",
  ): Finger {
    const segments = cloneSegments(fingerToSegments(finger));
    if (!segments.length) return finger;

    if (segmentIndex != null) {
      applyWithinCurveSymmetryForControlInSegments(
        segments,
        segmentIndex,
        driver,
      );
      return updateFingerSegments(finger, segments);
    }

    applyWithinCurveSymmetryAllInSegments(finger, segments, "start");
    return updateFingerSegments(finger, segments);
  }

  function overridesAreValid(overrides: Map<string, Finger>): boolean {
    for (const [id, candidate] of overrides) {
      if (!candidateIsValid(id, candidate, overrides)) return false;
    }
    return true;
  }

  function applyOverrides(overrides: Map<string, Finger>) {
    fingers = fingers.map((f) => overrides.get(f.id) ?? f);
  }

  function applyConstrainedUpdate(
    fingerId: string,
    buildCandidate: (current: Finger, fraction: number) => Finger,
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
    return buildFingerPathShared(paper, finger);
  }

  function buildLobeStrips(
    lobe: LobeId,
    overlap: paper.PathItem,
    onlyEvenStrips = false,
  ): Array<{ index: number; item: paper.PathItem }> {
    const { left, top, width, height } = getOverlapRect();
    return buildLobeStripsShared(
      paper,
      lobe,
      heartColors,
      fingers,
      overlap,
      left,
      top,
      width,
      height,
      onlyEvenStrips,
    );
  }

  function buildOddWeaveMask(
    leftStrips: Array<{ index: number; item: paper.PathItem }>,
    rightStrips: Array<{ index: number; item: paper.PathItem }>,
  ): paper.PathItem | null {
    return buildOddWeaveMaskShared(paper, leftStrips, rightStrips);
  }

  function draw() {
    if (!paper.project) return;
    paper.activate();
    paper.project.clear();

    const { left, top, right, bottom, width, height } = getOverlapRect();

    const fillItems: paper.Item[] = [];
    const overlayItems: paper.Item[] = [];

    // Lobes (build full shapes, then render outsides + woven overlap)
    const leftLobe = buildLobeShape(
      "left",
      left,
      top,
      width,
      height,
    );
    const rightLobe = buildLobeShape(
      "right",
      left,
      top,
      width,
      height,
    );

    // Overlap is always the rectangle region; construct it explicitly to avoid
    // boolean-op precision artifacts (hairline seams).
    const overlapRect = withInsertItemsDisabled(
      () =>
        new paper.Path.Rectangle(
          new paper.Point(left, top),
          new paper.Size(width, height),
        ),
    );

    // Base fill:
    // - Paint the left lobe (including overlap square) in left color.
    // - Paint only the right lobe *outside* the overlap square in right color.
    // This avoids anti-alias seams along the overlap boundary from two adjacent
    // fills meeting edge-to-edge.
    leftLobe.fillColor = lobeFillColor("left");
    leftLobe.strokeColor = null;
    fillItems.push(leftLobe);

    const rightOutsideOverlap = rightLobe.subtract(overlapRect, {
      insert: false,
    }) as paper.PathItem;
    rightLobe.remove();

    // Build strip areas as the space between adjacent boundary curves, clipped to overlap
    // Only even-index strips are needed for the even-odd weave mask.
    const leftStrips = buildLobeStrips("left", overlapRect, true);
    const rightStrips = buildLobeStrips("right", overlapRect, true);

    // Fast weave: rely on even-odd fill rule (no boolean ops).
    // Render overlap in left color, then overlay odd-parity cells in right color.
    const oddMask = buildOddWeaveMask(leftStrips, rightStrips);

    if (oddMask && Math.abs(itemArea(oddMask)) >= 1) {
      // Unite the odd-parity overlap cells with the outside-right region so the
      // fold line is painted by a single item (avoids 1px AA seams).
      const redTop = oddMask.unite(rightOutsideOverlap, { insert: false }) as paper.PathItem;
      oddMask.remove();
      rightOutsideOverlap.remove();

      redTop.fillColor = lobeFillColor("right");
      redTop.strokeColor = null;
      if (Math.abs(itemArea(redTop)) >= 1) fillItems.push(redTop);
      else redTop.remove();
    } else {
      oddMask?.remove();
      rightOutsideOverlap.fillColor = lobeFillColor("right");
      rightOutsideOverlap.strokeColor = null;
      fillItems.push(rightOutsideOverlap);
    }

    overlapRect.remove();

    // Render boundary curves on top (for editing/selection) - skip in readonly mode
    if (!readonly) {
      for (const finger of fingers) {
        const isSelected = finger.id === selection.fingerId;
        const isHovered = finger.id === hoverFingerId;
        const hidden = !showCurves;

        // Different colors for left (horizontal) and right (vertical) curves
        // Using bright cyan and orange with dark outlines for visibility on any background.
        const lobeColor =
          finger.lobe === "left"
            ? new paper.Color("#00ddff") // Bright cyan for horizontal
            : new paper.Color("#ff8800"); // Bright orange for vertical

        // Always: wide invisible hit stroke for hover/selection.
        const hitPath = buildFingerPath(finger);
        // Keep this essentially invisible but still hittable.
        // Use opacity rather than alpha=0, since some Paper.js hit-testing paths treat
        // fully transparent strokes as "no stroke".
        hitPath.strokeColor = new paper.Color("#000000");
        hitPath.opacity = 0.001;
        hitPath.strokeWidth = hidden ? 22 : 14;
        hitPath.strokeCap = "round";
        hitPath.strokeJoin = "round";
        hitPath.fillColor = null;
        hitPath.data = { kind: "finger-hit", fingerId: finger.id };
        overlayItems.push(hitPath);

        if (!hidden) {
          // Visible: draw outline first for contrast
          const outlinePath = buildFingerPath(finger);
          outlinePath.strokeColor = isSelected
            ? new paper.Color("#ffffff")
            : new paper.Color("#000000");
          outlinePath.strokeWidth = isSelected ? 6 : 4;
          outlinePath.strokeCap = "round";
          outlinePath.strokeJoin = "round";
          outlinePath.fillColor = null;
          outlinePath.data = { kind: "finger", fingerId: finger.id };
          overlayItems.push(outlinePath);

          // Then draw colored stroke on top
          const path = buildFingerPath(finger);
          path.strokeColor = isSelected
            ? new paper.Color("#111111")
            : lobeColor;
          path.strokeWidth = isSelected ? 4 : 2;
          path.strokeCap = "round";
          path.strokeJoin = "round";
          path.fillColor = null;
          path.data = { kind: "finger", fingerId: finger.id };
          overlayItems.push(path);
        }

        // Hover overlay: darken stroke, or show a thin black stroke when curves are hidden.
        if (isHovered) {
          const hoverPath = buildFingerPath(finger);
          hoverPath.strokeColor = hidden
            ? new paper.Color("#000000")
            : new paper.Color(0, 0, 0, 0.35);
          hoverPath.strokeWidth = hidden ? 2 : 5;
          hoverPath.strokeCap = "round";
          hoverPath.strokeJoin = "round";
          hoverPath.fillColor = null;
          overlayItems.push(hoverPath);
        }
      }

	      // Selected finger handles (drawn on top of weave)
	      const selected = selection.fingerId
	        ? fingers.find((f) => f.id === selection.fingerId)
	        : undefined;
	      if (selected) {
	        const segments = fingerToSegments(selected);
	        const n = segments.length;
	        if (n >= 1) {
          const endpointSize = 10;
          const anchorSize = endpointSize;
          const handleRadius = 5;

	          const selectedSet = new Set(
	            selection.anchors.filter((idx) => idx >= 0 && idx <= n),
	          );
          const visibleSet = new Set<number>();
          if (selectedSet.size) {
            for (const idx of selectedSet) {
              visibleSet.add(idx);
              visibleSet.add(Math.max(0, idx - 1));
              visibleSet.add(Math.min(n, idx + 1));
            }
	          }
	          // Segment selection should also reveal the segment's endpoint handles.
	          if (selection.segments.length) {
	            for (const segIdx of selection.segments) {
	              if (!Number.isFinite(segIdx)) continue;
	              if (segIdx < 0 || segIdx >= n) continue;
	              const a = segIdx;
              const b = segIdx + 1;
              visibleSet.add(a);
              visibleSet.add(b);
              visibleSet.add(Math.max(0, a - 1));
              visibleSet.add(Math.min(n, b + 1));
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
            const shape = new paper.Path.Rectangle({
              point: new paper.Point(pos.x - size / 2, pos.y - size / 2),
              size,
            });
            if (!isEndpoint) {
              const type = getAnchorNodeType(selected, idx);
              if (type === "smooth" || type === "symmetric") {
                // Internal anchors are diamonds by default because the whole scene is rotated.
                // Rotate these ones so they show up as squares.
                shape.rotate(45);
              }
            }

            shape.fillColor = isSelectedAnchor
              ? new paper.Color("#ffcc00")
              : new paper.Color("#ffffff");
            shape.strokeColor = new paper.Color("#111111");
            shape.strokeWidth = 2;

            const pointKey: ControlPointKey =
              idx === 0
                ? "p0"
                : idx === n
                  ? "p3"
                  : (`seg${idx}_p0` as ControlPointKey);
            shape.data = {
              kind: "control",
              fingerId: selected.id,
              pointKey,
              segmentIndex: Math.min(idx, n - 1),
            };
            overlayItems.push(shape);
          }

          // Only show control handles for the selected anchors and their neighbors.
          if (visibleSet.size) {
            const drawHandle = (
              from: Vec,
              to: Vec,
              segIdx: number,
              pointKey: ControlPointKey,
            ) => {
              if (isHandleCollapsed(to, from)) return;
              const line = new paper.Path.Line(toPoint(from), toPoint(to));
              line.strokeColor = new paper.Color("#666666");
              line.strokeWidth = 1;
              overlayItems.push(line);

              const handle = new paper.Path.Circle(toPoint(to), handleRadius);
              handle.fillColor = new paper.Color(0.9);
              handle.strokeColor = new paper.Color("#111111");
              handle.strokeWidth = 1.5;
              handle.data = {
                kind: "control",
                fingerId: selected.id,
                pointKey,
                segmentIndex: segIdx,
              };
              overlayItems.push(handle);
            };

            for (const idx of visibleSet) {
              if (idx === 0) {
                drawHandle(
                  anchorPos(0),
                  segments[0]!.p1,
                  0,
                  `seg0_p1` as ControlPointKey,
                );
              } else if (idx === n) {
                drawHandle(
                  anchorPos(n),
                  segments[n - 1]!.p2,
                  n - 1,
                  `seg${n - 1}_p2` as ControlPointKey,
                );
              } else {
                drawHandle(
                  anchorPos(idx),
                  segments[idx - 1]!.p2,
                  idx - 1,
                  `seg${idx - 1}_p2` as ControlPointKey,
                );
                drawHandle(
                  anchorPos(idx),
                  segments[idx]!.p1,
                  idx,
                  `seg${idx}_p1` as ControlPointKey,
                );
              }
            }
          }
        }
      }

    }

    // Group and rotate for the classic heart angle (keep state unrotated)
    const fillGroup = new paper.Group(fillItems);
    const overlayGroup = overlayItems.length
      ? new paper.Group(overlayItems)
      : null;
    const rootGroup = new paper.Group(
      overlayGroup ? [fillGroup, overlayGroup] : [fillGroup],
    );
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
    fingers = fingers.map((f) => (f.id === fingerId ? updater(f) : f));
  }

  function clampEndpoints(fingerId: string) {
    updateFinger(fingerId, (f) => {
      const segments = fingerToSegments(f);
      if (!segments.length) return f;
      const first = segments[0];
      const last = segments[segments.length - 1];
      const nextP0 = projectEndpoint(f, first.p0, "p0");
      if (nextP0.x !== first.p0.x || nextP0.y !== first.p0.y) {
        const d = vecSub(nextP0, first.p0);
        first.p0 = nextP0;
        first.p1 = vecAdd(first.p1, d);
      }
      const nextP3 = projectEndpoint(f, last.p3, "p3");
      if (nextP3.x !== last.p3.x || nextP3.y !== last.p3.y) {
        const d = vecSub(nextP3, last.p3);
        last.p3 = nextP3;
        last.p2 = vecAdd(last.p2, d);
      }
      return updateFingerSegments(f, segments);
    });
  }

  function translateFinger(fingerId: string, delta: Vec) {
    updateFinger(fingerId, (f) => {
      const segs = cloneSegments(fingerToSegments(f));
      for (const seg of segs) {
        seg.p0 = vecAdd(seg.p0, delta);
        seg.p1 = vecAdd(seg.p1, delta);
        seg.p2 = vecAdd(seg.p2, delta);
        seg.p3 = vecAdd(seg.p3, delta);
      }
      return updateFingerSegments(f, segs);
    });
  }

  function syncGridSizeToFingers() {
    const inferred = inferGridSizeFromFingers(fingers, gridSize);
    if (inferred.x !== gridSize.x || inferred.y !== gridSize.y) {
      gridSize = inferred;
      if (!canSymmetryBetweenLobes() && symmetryBetweenLobes) {
        editor.betweenLobesMode = 0;
      }
    }
  }

  function ensureOuterBoundaryCurves(): boolean {
    const { left, right, top, bottom } = getOverlapRect();

    const endpoints = (f: Finger) => {
      const segs = fingerToSegments(f);
      if (!segs.length) return null;
      return { p0: segs[0]!.p0, p3: segs[segs.length - 1]!.p3 };
    };

    const leftCurves = fingers.filter((f) => f.lobe === "left");
    const rightCurves = fingers.filter((f) => f.lobe === "right");

    const minBy = (arr: Finger[], key: (f: Finger) => number) => {
      let best: Finger | null = null;
      let bestK = Infinity;
      for (const f of arr) {
        const k = key(f);
        if (k < bestK) {
          best = f;
          bestK = k;
        }
      }
      return best;
    };
    const maxBy = (arr: Finger[], key: (f: Finger) => number) => {
      let best: Finger | null = null;
      let bestK = -Infinity;
      for (const f of arr) {
        const k = key(f);
        if (k > bestK) {
          best = f;
          bestK = k;
        }
      }
      return best;
    };

    const topFinger = minBy(leftCurves, (f) => fingerToSegments(f)[0]?.p0.y ?? 0);
    const bottomFinger = maxBy(leftCurves, (f) => fingerToSegments(f)[0]?.p0.y ?? 0);
    const leftFinger = minBy(rightCurves, (f) => fingerToSegments(f)[0]?.p0.x ?? 0);
    const rightFinger = maxBy(rightCurves, (f) => fingerToSegments(f)[0]?.p0.x ?? 0);

    const topE = topFinger ? endpoints(topFinger) : null;
    const bottomE = bottomFinger ? endpoints(bottomFinger) : null;
    const leftE = leftFinger ? endpoints(leftFinger) : null;
    const rightE = rightFinger ? endpoints(rightFinger) : null;

    const hasTop =
      !!topE &&
      Math.abs(topE.p0.y - top) <= OUTER_EDGE_TOL &&
      Math.abs(topE.p3.y - top) <= OUTER_EDGE_TOL;
    const hasBottom =
      !!bottomE &&
      Math.abs(bottomE.p0.y - bottom) <= OUTER_EDGE_TOL &&
      Math.abs(bottomE.p3.y - bottom) <= OUTER_EDGE_TOL;
    const hasLeft =
      !!leftE &&
      Math.abs(leftE.p0.x - left) <= OUTER_EDGE_TOL &&
      Math.abs(leftE.p3.x - left) <= OUTER_EDGE_TOL;
    const hasRight =
      !!rightE &&
      Math.abs(rightE.p0.x - right) <= OUTER_EDGE_TOL &&
      Math.abs(rightE.p3.x - right) <= OUTER_EDGE_TOL;

    const missingTop = !hasTop;
    const missingBottom = !hasBottom;
    const missingLeft = !hasLeft;
    const missingRight = !hasRight;

    const toAddLeft = (missingTop ? 1 : 0) + (missingBottom ? 1 : 0);
    const toAddRight = (missingLeft ? 1 : 0) + (missingRight ? 1 : 0);

    const newCurves: Finger[] = [];
    let changed = false;

    if (toAddLeft) {
      const nextStrips = leftCurves.length + toAddLeft - 1;
      if (nextStrips <= MAX_STRIPS) {
        if (missingTop) newCurves.push(makeNewBoundary("left", top));
        if (missingBottom) newCurves.push(makeNewBoundary("left", bottom));
        changed = true;
      } else {
        // At max strips: snap the existing outer boundary back to the edge.
        if (missingTop && topFinger && topE) {
          translateFinger(topFinger.id, { x: 0, y: top - topE.p0.y });
          clampEndpoints(topFinger.id);
          changed = true;
        }
        if (missingBottom && bottomFinger && bottomE) {
          translateFinger(bottomFinger.id, { x: 0, y: bottom - bottomE.p0.y });
          clampEndpoints(bottomFinger.id);
          changed = true;
        }
      }
    }

    if (toAddRight) {
      const nextStrips = rightCurves.length + toAddRight - 1;
      if (nextStrips <= MAX_STRIPS) {
        if (missingLeft) newCurves.push(makeNewBoundary("right", left));
        if (missingRight) newCurves.push(makeNewBoundary("right", right));
        changed = true;
      } else {
        if (missingLeft && leftFinger && leftE) {
          translateFinger(leftFinger.id, { x: left - leftE.p0.x, y: 0 });
          clampEndpoints(leftFinger.id);
          changed = true;
        }
        if (missingRight && rightFinger && rightE) {
          translateFinger(rightFinger.id, { x: right - rightE.p0.x, y: 0 });
          clampEndpoints(rightFinger.id);
          changed = true;
        }
      }
    }

    if (newCurves.length) {
      fingers = [...fingers, ...newCurves];
    }

    return changed || newCurves.length > 0;
  }

  function dropSelectionForRemovedFingers(removedIds: Set<string>) {
    if (selection.fingerId && removedIds.has(selection.fingerId)) {
      selection.fingerId = null;
      selection.anchors = [];
      selection.segments = [];
      selection.lastCurveHit = null;
    } else if (selection.lastCurveHit && removedIds.has(selection.lastCurveHit.fingerId)) {
      selection.lastCurveHit = null;
    }

    if (hoverFingerId && removedIds.has(hoverFingerId)) hoverFingerId = null;
    if (
      dragTarget &&
      (dragTarget.kind === "control" || dragTarget.kind === "path") &&
      removedIds.has(dragTarget.fingerId)
    ) {
      dragTarget = null;
    }
  }

  function reconcileBoundaryCurves(options?: {
    allowEdgeRemoval?: boolean;
    forceRenumber?: boolean;
  }): boolean {
    const allowEdgeRemoval = options?.allowEdgeRemoval ?? false;
    const forceRenumber = options?.forceRenumber ?? false;

    let changed = false;

    if (allowEdgeRemoval) {
      const { left, right, top, bottom } = getOverlapRect();

      const endpointsMatch = (finger: Finger, axis: "x" | "y", pos: number, tol: number) => {
        const segs = fingerToSegments(finger);
        if (!segs.length) return false;
        const first = segs[0]!;
        const last = segs[segs.length - 1]!;
        const a = axis === "x" ? first.p0.x : first.p0.y;
        const b = axis === "x" ? last.p3.x : last.p3.y;
        return Math.abs(a - pos) <= tol && Math.abs(b - pos) <= tol;
      };

      const sortedLeft = fingers
        .filter((f) => f.lobe === "left")
        .slice()
        .sort((a, b) => (fingerToSegments(a)[0]?.p0.y ?? 0) - (fingerToSegments(b)[0]?.p0.y ?? 0));
      const sortedRight = fingers
        .filter((f) => f.lobe === "right")
        .slice()
        .sort((a, b) => (fingerToSegments(a)[0]?.p0.x ?? 0) - (fingerToSegments(b)[0]?.p0.x ?? 0));

      const toRemove = new Set<string>();

      const maybeRemoveNearEdge = (
        boundaries: Finger[],
        which: "min" | "max",
        axis: "x" | "y",
        edgePos: number,
      ) => {
        const strips = Math.max(0, boundaries.length - 1);
        if (strips <= MIN_STRIPS) return;

        const idx = which === "min" ? 1 : boundaries.length - 2;
        const candidate = boundaries[idx];
        if (!candidate) return;
        if (endpointsMatch(candidate, axis, edgePos, OUTER_EDGE_REMOVE_TOL)) {
          toRemove.add(candidate.id);
        }
      };

      maybeRemoveNearEdge(sortedLeft, "min", "y", top);
      maybeRemoveNearEdge(sortedLeft, "max", "y", bottom);
      maybeRemoveNearEdge(sortedRight, "min", "x", left);
      maybeRemoveNearEdge(sortedRight, "max", "x", right);

      if (toRemove.size) {
        fingers = fingers.filter((f) => !toRemove.has(f.id));
        dropSelectionForRemovedFingers(toRemove);
        changed = true;
      }
    }

    if (ensureOuterBoundaryCurves()) {
      changed = true;
    }

    if (changed || forceRenumber) {
      renumberBoundaryIds();
      syncGridSizeToFingers();
      return true;
    }

    return false;
  }

  function handleMouseDown(event: any) {
    const clickCount = getClickCount(event);
    const hits = paper.project.hitTestAll(event.point, {
      fill: true,
      stroke: true,
      tolerance: 10,
    });
    const hit =
      hits.find((h) => h.item?.data?.kind === "control") ??
      hits.find((h) => h.item?.data?.kind === "finger-hit") ??
      hits.find((h) => h.item?.data?.kind === "finger");

	    if (!hit) {
	      selection.fingerId = null;
	      selection.anchors = [];
	      selection.segments = [];
	      selection.lastCurveHit = null;
	      dragTarget = null;
	      draw();
	      return;
	    }

	    const data = hit.item.data;
	    if (data.kind === "control") {
	      const prevSelectedFingerId = selection.fingerId;
	      const isShift = Boolean(event.modifiers?.shift);
	      // Clicking handles should not change which anchors are selected.
      const pointKeyStr =
        typeof data.pointKey === "string" ? data.pointKey : null;
      const isHandle = Boolean(
        pointKeyStr &&
          (pointKeyStr.endsWith("_p1") || pointKeyStr.endsWith("_p2")),
      );

	      if (prevSelectedFingerId !== data.fingerId) {
	        selection.anchors = [];
	        selection.segments = [];
	        selection.lastCurveHit = null;
	      }
	      selection.fingerId = data.fingerId;
	      const f = getFingerById(data.fingerId);
	      if (f) {
	        const segmentsLen = fingerToSegments(f).length;
	        const anchorIdx = anchorIndexFromPointKey(
          data.pointKey,
          segmentsLen,
          data.segmentIndex,
        );
	        if (anchorIdx != null) {
	          // Anchor selection overrides segment selection.
	          selection.segments = [];
	          if (isShift) toggleAnchorSelection(anchorIdx);
	          else setSingleAnchorSelection(anchorIdx);
	        } else if (!isHandle) {
	          // Handle selected: select its associated anchor (start for p1, end for p2).
	          if (
	            typeof data.pointKey === "string" &&
            data.pointKey.endsWith("_p1")
          ) {
            const idx = Number.isFinite(data.segmentIndex)
              ? data.segmentIndex
              : 0;
            setSingleAnchorSelection(Math.max(0, Math.min(segmentsLen, idx)));
          } else if (
            typeof data.pointKey === "string" &&
            data.pointKey.endsWith("_p2")
          ) {
            const idx = Number.isFinite(data.segmentIndex)
              ? data.segmentIndex + 1
              : 1;
            setSingleAnchorSelection(Math.max(0, Math.min(segmentsLen, idx)));
	          } else {
	            selection.anchors = [];
	          }
	        }
	      }
      dragTarget = {
        kind: "control",
        fingerId: data.fingerId,
        pointKey: data.pointKey,
        segmentIndex: data.segmentIndex,
      };
      dragSnapshot = snapshotState();
      dragDirty = false;
      draw();
	      return;
	    }

	    if (selection.fingerId !== data.fingerId) {
	      selection.anchors = [];
	      selection.segments = [];
	      selection.lastCurveHit = null;
	    }
	    const prevSelected = selection.fingerId;
	    selection.fingerId = data.fingerId;
    // When selecting a curve, select the two anchors around the click point so
    // it's easy to insert a node right there.
    const isShift = Boolean(event.modifiers?.shift);
    const f = getFingerById(data.fingerId);
    const segLen = f ? fingerToSegments(f).length : 0;
    const { segmentIndex: curveIdx, t: curveT } = curveHitFromPaperHit(hit as any);
	    if (
	      curveIdx != null &&
	      Number.isFinite(curveIdx) &&
      curveT != null &&
      Number.isFinite(curveT)
    ) {
	      selection.lastCurveHit = {
	        fingerId: data.fingerId,
	        segmentIndex: curveIdx,
	        t: curveT,
	      };
	    } else {
	      selection.lastCurveHit = null;
	    }

	    if (!isShift) {
	      if (curveIdx != null && Number.isFinite(curveIdx)) {
	        const a = Math.max(0, Math.min(segLen, curveIdx));
	        const b = Math.max(0, Math.min(segLen, curveIdx + 1));
	        selection.anchors = a === b ? [a] : [a, b];
	        selection.segments = a < segLen ? [a] : [];
	      } else if (segLen > 0) {
	        selection.anchors = [0, segLen];
	        selection.segments = [];
	      }
	    } else if (curveIdx != null && Number.isFinite(curveIdx)) {
      // Shift-click toggles selection of the segment and its surrounding anchors.
      const a = Math.max(0, Math.min(segLen, curveIdx));
      const b = Math.max(0, Math.min(segLen, curveIdx + 1));
	      const segIdx = a;
	      const anchorsToToggle = a === b ? [a] : [a, b];
	      for (const idx of anchorsToToggle)
	        selection.anchors = toggleNumberInList(selection.anchors, idx);
	      if (segIdx < segLen) {
	        selection.segments = toggleNumberInList(selection.segments, segIdx);
	      }
	    }

    // Double-click inserts a node at the clicked location on the curve.
	    if (
	      clickCount >= 2 &&
	      selection.lastCurveHit &&
	      selection.lastCurveHit.fingerId === data.fingerId
	    ) {
	      insertNodeAtCurveHit(selection.lastCurveHit);
	      return;
	    }
    dragTarget = { kind: "path", fingerId: data.fingerId };
    dragSnapshot = snapshotState();
    dragDirty = false;
    draw();
  }

  function handleMouseMove(event: any) {
    const hits = paper.project.hitTestAll(event.point, {
      fill: true,
      stroke: true,
      tolerance: 10,
    });
    const hit =
      hits.find((h) => h.item?.data?.kind === "control") ??
      hits.find((h) => h.item?.data?.kind === "finger-hit") ??
      hits.find((h) => h.item?.data?.kind === "finger");

    const kind = hit?.item?.data?.kind as unknown;
    const next =
      kind === "control" || kind === "finger-hit" || kind === "finger"
        ? (hit!.item.data.fingerId as string)
        : null;
    if (next !== hoverFingerId) {
      hoverFingerId = next;
      draw();
    }

    if (canvas) {
      canvas.style.cursor =
        kind === "control"
          ? "pointer"
          : kind === "finger-hit" || kind === "finger"
            ? "move"
            : "default";
    }
  }

  // Build a candidate finger with updated segment control point (without modifying state)
  function buildSegmentUpdateCandidate(
    finger: Finger,
    segmentIndex: number,
    pointKey: string,
    newPos: Vec,
  ): Finger | null {
    const segments = fingerToSegments(finger);
    if (segmentIndex < 0 || segmentIndex >= segments.length) return null;

    const seg = segments[segmentIndex];

    // Determine which point within the segment to update
    if (pointKey.endsWith("_p0")) {
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
    } else if (pointKey.endsWith("_p1")) {
      seg.p1 = newPos;
    } else if (pointKey.endsWith("_p2")) {
      seg.p2 = newPos;
    }

    return updateFingerSegments(finger, segments);
  }

  // Update a segment control point within a multi-segment finger (with validation)
  function updateSegmentControlPoint(
    fingerId: string,
    segmentIndex: number,
    pointKey: string,
    newPos: Vec,
  ): boolean {
    const finger = getFingerById(fingerId);
    if (!finger) return false;

    const segments = fingerToSegments(finger);
    const isP1 = pointKey.endsWith("_p1");
    const isP2 = pointKey.endsWith("_p2");
    const isMidpoint = pointKey.endsWith("_p0");

    const applyNodeConstraint = (segs: BezierSegment[]) => {
      // For internal anchors, enforce smooth/symmetric handle coupling like Inkscape.
      if (isP1) {
        if (segmentIndex <= 0) return;
        const anchorIdx = segmentIndex;
        const type = getAnchorNodeType(finger, anchorIdx);
        if (type === "corner") return;
        const anchor = segs[segmentIndex]!.p0;
        const out = segs[segmentIndex]!.p1;
        if (isHandleCollapsed(out, anchor)) return;
        const v = vecSub(out, anchor);
        const dir = normalize(v);
        const prev = segs[segmentIndex - 1]!;
        if (isHandleCollapsed(prev.p2, anchor)) return;
        if (type === "symmetric") {
          prev.p2 = { x: anchor.x - v.x, y: anchor.y - v.y };
        } else {
          const len = vecDist(prev.p2, anchor);
          prev.p2 = vecAdd(anchor, vecScale(dir, -len));
        }
      } else if (isP2) {
        if (segmentIndex >= segs.length - 1) return;
        const anchorIdx = segmentIndex + 1;
        const type = getAnchorNodeType(finger, anchorIdx);
        if (type === "corner") return;
        const anchor = segs[segmentIndex]!.p3;
        const inn = segs[segmentIndex]!.p2;
        if (isHandleCollapsed(inn, anchor)) return;
        const v = vecSub(inn, anchor);
        const dir = normalize(v);
        const next = segs[segmentIndex + 1]!;
        if (isHandleCollapsed(next.p1, anchor)) return;
        if (type === "symmetric") {
          next.p1 = { x: anchor.x - v.x, y: anchor.y - v.y };
        } else {
          const len = vecDist(next.p1, anchor);
          next.p1 = vecAdd(anchor, vecScale(dir, -len));
        }
      }
    };

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
          applyNodeConstraint(segs);
        } else if (isP2) {
          segs[segmentIndex].p2 = pos;
          applyNodeConstraint(segs);
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
        if (!symmetryWithinCurve)
          return overridesAreValid(deriveSymmetryOverrides(candidate));

        const segs = cloneSegments(
          getInternalSegments(candidate) ?? fingerToSegments(candidate),
        );
        if (isP1 || isP2) {
          applyWithinCurveSymmetryForControlInSegments(
            segs,
            segmentIndex,
            isP1 ? "p1" : "p2",
          );
        } else {
          // Midpoint drag uses anchor-drag code path, but keep this safe for callers.
          applyWithinCurveSymmetryForMovedAnchors(
            finger,
            segs,
            [segmentIndex],
            segmentIndex,
          );
        }
        const symCandidate = updateFingerSegments(candidate, segs);
        return overridesAreValid(deriveSymmetryOverrides(symCandidate));
      };

      // General constraint handling: if the desired point is invalid, back off
      // along the drag direction (binary search) to the nearest valid point.
      let snapped: Vec = newPos;
      if (!isValidCandidate(buildCandidateAt(snapped))) {
        let lo = 0;
        let hi = 1;
        let bestPos = basePos;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          const pos = vecLerp(basePos, newPos, mid);
          if (isValidCandidate(buildCandidateAt(pos))) {
            bestPos = pos;
            lo = mid;
          } else {
            hi = mid;
          }
        }
        snapped = bestPos;
      }
      const snappedCandidate = buildCandidateAt(snapped);
      const snappedSegments = getInternalSegments(snappedCandidate);
      if (!snappedSegments) return false;

      const committedSegs = cloneSegments(snappedSegments);
      if (symmetryWithinCurve) {
        if (isP1 || isP2) {
          applyWithinCurveSymmetryForControlInSegments(
            committedSegs,
            segmentIndex,
            isP1 ? "p1" : "p2",
          );
        } else {
          applyWithinCurveSymmetryForMovedAnchors(
            finger,
            committedSegs,
            [segmentIndex],
            segmentIndex,
          );
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
    let candidate = buildSegmentUpdateCandidate(
      finger,
      segmentIndex,
      pointKey,
      newPos,
    );
    if (!candidate) return false;

    if (symmetryWithinCurve) {
      if (isP1 || isP2) {
        candidate = applyWithinCurveSymmetry(
          candidate,
          segmentIndex,
          isP1 ? "p1" : "p2",
        );
      } else if (isMidpoint) {
        candidate = applyWithinCurveSymmetry(candidate, segmentIndex - 1, "p1");
        candidate = applyWithinCurveSymmetry(candidate, segmentIndex, "p2");
      }
    }

    const overrides = deriveSymmetryOverrides(candidate);
    if (!overridesAreValid(overrides)) return false;
    applyOverrides(overrides);
    return true;
  }

  function handleMouseDrag(event: any) {
    let target = dragTarget;
    if (!target) return;

    if (target.kind === "control") {
      const pointKey = target.pointKey;
      const segIdx = target.segmentIndex ?? 0;

      // Anchor drag (endpoints + junctions), supports multi-select.
      const base = getFingerById(target.fingerId);
      if (base) {
        const segLen = fingerToSegments(base).length;
        const anchorIdx = anchorIndexFromPointKey(pointKey, segLen, segIdx);
        if (anchorIdx != null) {
          const dRaw = unrotateDelta(event.delta);
          const anchorsToMove = selection.anchors.includes(anchorIdx)
            ? selection.anchors
            : [anchorIdx];
          const refreshed = dragTarget;
          const activeFingerId =
            refreshed && refreshed.kind === "control" ? refreshed.fingerId : target.fingerId;
          applyConstrainedUpdate(activeFingerId, (current, fraction) => {
            const segs = cloneSegments(fingerToSegments(current));
            const d = { x: dRaw.x * fraction, y: dRaw.y * fraction };
            applyDeltaToAnchorsInSegments(current, segs, anchorsToMove, d);
            if (symmetryWithinCurve) {
              applyWithinCurveSymmetryForMovedAnchors(
                current,
                segs,
                anchorsToMove,
                anchorIdx,
              );
            }
            return updateFingerSegments(current, segs);
          });
          dragDirty = true;
          draw();
          return;
        }
      }

      const p = unrotatePoint(event.point);

      // Multi-segment control handle drag (has seg prefix).
      if (typeof pointKey === "string" && pointKey.startsWith("seg")) {
        updateSegmentControlPoint(target.fingerId, segIdx, pointKey, p);
        dragDirty = true;
        draw();
        return;
      }
      if (pointKey !== "p0" && pointKey !== "p3") return;

      applyConstrainedUpdate(target.fingerId, (current, fraction) => {
        const desiredPt = projectEndpoint(current, p, pointKey);

        const segments = cloneSegments(fingerToSegments(current));
        if (!segments.length) return current;
        const first = segments[0]!;
        const last = segments[segments.length - 1]!;

        const oldPt = pointKey === "p0" ? first.p0 : last.p3;
        const dx = (desiredPt.x - oldPt.x) * fraction;
        const dy = (desiredPt.y - oldPt.y) * fraction;
        const moved = { x: oldPt.x + dx, y: oldPt.y + dy };

        if (pointKey === "p0") {
          const nextP0 = projectEndpoint(current, moved, "p0");
          const d = vecSub(nextP0, first.p0);
          first.p0 = nextP0;
          first.p1 = vecAdd(first.p1, d);
        } else {
          const nextP3 = projectEndpoint(current, moved, "p3");
          const d = vecSub(nextP3, last.p3);
          last.p3 = nextP3;
          last.p2 = vecAdd(last.p2, d);
        }

        if (symmetryWithinCurve) {
          const anchorIdx = pointKey === "p0" ? 0 : segments.length;
          applyWithinCurveSymmetryForMovedAnchors(
            current,
            segments,
            [anchorIdx],
            anchorIdx,
          );
        }
        return updateFingerSegments(current, segments);
      });
      dragDirty = true;
      draw();
      return;
    }

    // Drag whole path: translate while keeping endpoints snapped and boundaries non-intersecting
    const dRaw = unrotateDelta(event.delta);
    applyConstrainedUpdate(target.fingerId, (current, fraction) => {
      const { left: minX, right: maxX, top: minY, bottom: maxY } =
        getOverlapRect();

      const segments = cloneSegments(fingerToSegments(current));
      if (!segments.length) return current;
      const first = segments[0]!;
      const last = segments[segments.length - 1]!;

      let dx = dRaw.x;
      let dy = dRaw.y;

      if (current.lobe === "left") {
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
      const nextP0 = projectEndpoint(current, segments[0]!.p0, "p0");
      if (nextP0.x !== segments[0]!.p0.x || nextP0.y !== segments[0]!.p0.y) {
        const d = vecSub(nextP0, segments[0]!.p0);
        segments[0]!.p0 = nextP0;
        segments[0]!.p1 = vecAdd(segments[0]!.p1, d);
      }
      const nextP3 = projectEndpoint(
        current,
        segments[segments.length - 1]!.p3,
        "p3",
      );
      if (
        nextP3.x !== segments[segments.length - 1]!.p3.x ||
        nextP3.y !== segments[segments.length - 1]!.p3.y
      ) {
        const d = vecSub(nextP3, segments[segments.length - 1]!.p3);
        segments[segments.length - 1]!.p3 = nextP3;
        segments[segments.length - 1]!.p2 = vecAdd(
          segments[segments.length - 1]!.p2,
          d,
        );
      }

      return updateFingerSegments(current, segments);
    });
    dragDirty = true;
    draw();
  }

  function handleMouseUp() {
    // If a handle ends close to its anchor, snap it onto the anchor (hide/remove it).
    if (dragTarget?.kind === "control") {
      const pk =
        typeof dragTarget.pointKey === "string" ? dragTarget.pointKey : null;
      const segIdx =
        typeof dragTarget.segmentIndex === "number"
          ? dragTarget.segmentIndex
          : null;
      if (
        pk &&
        segIdx != null &&
        pk.startsWith("seg") &&
        (pk.endsWith("_p1") || pk.endsWith("_p2"))
      ) {
        const finger = getFingerById(dragTarget.fingerId);
        if (finger) {
          const segs = fingerToSegments(finger);
          const seg = segs[segIdx];
          if (seg) {
            const isP1 = pk.endsWith("_p1");
            const anchor = isP1 ? seg.p0 : seg.p3;
            const handle = isP1 ? seg.p1 : seg.p2;
            if (vecDist(handle, anchor) <= HANDLE_SNAP_EPS) {
              const snapped = updateSegmentControlPoint(
                dragTarget.fingerId,
                segIdx,
                pk,
                anchor,
              );
              if (snapped) dragDirty = true;
            }
          }
        }
      }
    }

    if (dragTarget?.kind === "path") {
      clampEndpoints(dragTarget.fingerId);
    }

    // If an outer boundary curve was dragged inward, insert a new outer curve at the edge
    // so the overlap rectangle always has boundary curves at all four sides.
    if (dragDirty && ensureOuterBoundaryCurves()) {
      renumberBoundaryIds();
      syncGridSizeToFingers();
      dragDirty = true;
    }

    if (dragSnapshot && dragDirty) {
      pushUndo(dragSnapshot);
    }
    dragSnapshot = null;
    dragDirty = false;
    dragTarget = null;
    if (canvas) {
      canvas.style.cursor = hoverFingerId ? "move" : "default";
    }
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
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
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
    if (import.meta.env.DEV && typeof window !== "undefined") {
      void Promise.all([
        import("$lib/dev/paperHeartBench"),
        import("$lib/dev/paperHeartDebug"),
      ]).then(([benchMod, debugMod]) => {
        if (disposed) return;
        const ctx = {
          get paperReady() {
            return paperReady;
          },
          paper,

          get gridSize() {
            return gridSize;
          },
          set gridSize(v: any) {
            const next = normalizeGridSize(v as any);
            gridSize = next;
            setCenteredOverlapRect(next);
            fingers = createDefaultFingers(next);
            renumberBoundaryIds();
            draw();
          },
          get fingers() {
            return fingers;
          },
          set fingers(v: Finger[]) {
            fingers = v;
          },
          get selectedFingerId() {
            return selection.fingerId;
          },
          set selectedFingerId(v: string | null) {
            selection.fingerId = v;
          },
          get selectedAnchors() {
            return selection.anchors;
          },
          set selectedAnchors(v: number[]) {
            selection.anchors = v;
          },
          get selectedSegments() {
            return selection.segments;
          },
          set selectedSegments(v: number[]) {
            selection.segments = v;
          },
          get hoverFingerId() {
            return hoverFingerId;
          },
          set hoverFingerId(v: string | null) {
            hoverFingerId = v;
          },
          get dragTarget() {
            return dragTarget;
          },
          set dragTarget(v: DragTarget) {
            dragTarget = v;
          },
	          get symmetryWithinCurve() {
	            return editor.withinCurveMode !== 0;
	          },
	          set symmetryWithinCurve(v: boolean) {
	            if (!v) editor.withinCurveMode = 0;
	            else if (editor.withinCurveMode === 0) editor.withinCurveMode = 1;
	          },
	          get symmetryWithinLobe() {
	            return editor.withinLobeMode !== 0;
	          },
	          set symmetryWithinLobe(v: boolean) {
	            if (!v) editor.withinLobeMode = 0;
	            else if (editor.withinLobeMode === 0) editor.withinLobeMode = 1;
	          },
	          get symmetryBetweenLobes() {
	            return editor.betweenLobesMode !== 0;
	          },
	          set symmetryBetweenLobes(v: boolean) {
	            if (!v) editor.betweenLobesMode = 0;
	            else if (editor.betweenLobesMode === 0) editor.betweenLobesMode = 1;
	          },
	          get antiWithinCurve() {
	            return editor.withinCurveMode === 2;
	          },
	          set antiWithinCurve(v: boolean) {
	            if (v) editor.withinCurveMode = 2;
	            else if (editor.withinCurveMode === 2) editor.withinCurveMode = 1;
	          },
	          get antiWithinLobe() {
	            return editor.withinLobeMode === 2;
	          },
	          set antiWithinLobe(v: boolean) {
	            if (v) editor.withinLobeMode = 2;
	            else if (editor.withinLobeMode === 2) editor.withinLobeMode = 1;
	          },
	          get antiBetweenLobes() {
	            return editor.betweenLobesMode === 2;
	          },
	          set antiBetweenLobes(v: boolean) {
	            if (v) editor.betweenLobesMode = 2;
	            else if (editor.betweenLobesMode === 2) editor.betweenLobesMode = 1;
	          },
	          get showCurves() {
	            return editor.showCurves;
	          },
	          set showCurves(v: boolean) {
	            editor.showCurves = v;
	          },

          get benchActive() {
            return benchActive;
          },
          set benchActive(v: boolean) {
            benchActive = v;
          },
          get benchCounters() {
            return benchCounters;
          },
          set benchCounters(v: {
            candidateIsValidCalls: number;
            intersectionChecks: number;
          }) {
            benchCounters = v;
          },

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
          updateSegmentControlPoint,
          handleMouseDown,
          snapshotState,
          pushUndo,
          undo,
          toPoint,
          withInsertItemsDisabled,
          buildObstaclePaths,
          draw,
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
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", handleKeyDown);
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

	  $effect(() => {
	    // Track showCurves to redraw when visibility toggles
	    const _ = editor.showCurves;
	    if (!paperReady || !canvas || !paper.project) return;
	    draw();
	  });
</script>

<div class="paper-heart">
  {#if !readonly}
	    <div class="controls">
	      <label class="checkbox">
	        <input type="checkbox" bind:checked={editor.showCurves} />
	        Show curves
	      </label>
	      <TriSwitch
	        label="Within curve"
	        bind:value={editor.withinCurveMode}
	        options={["Off", "Sym", "Anti"] as const}
	        titles={["Off", "Mirror symmetry", "Anti-symmetry"] as const}
	      />
	      <TriSwitch
	        label="Within lobe"
	        bind:value={editor.withinLobeMode}
	        options={["Off", "Sym", "Anti"] as const}
	        titles={["Off", "Mirror symmetry", "Anti-symmetry"] as const}
	      />
	      <TriSwitch
	        label="Between lobes"
	        bind:value={editor.betweenLobesMode}
	        options={["Off", "Sym", "Anti"] as const}
	        titles={["Off", "Mirror symmetry", "Anti-symmetry"] as const}
	      />
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
	  {#if selectedFinger}
		    <div class="segment-controls" aria-label="Curve tools">
		      <div class="edit-controls" aria-label="Edit">
		        <Button
		          variant="outline"
	          size="icon-sm"
	          onclick={insertNodeBetweenSelectedAnchors}
	          disabled={!canInsertNode}
	          title="Insert node between selected"
	          aria-label="Insert node"
	        >
	          <SplitIcon size={16} aria-hidden="true" />
	        </Button>
	        <Button
	          variant="outline"
	          size="icon-sm"
	          onclick={deleteSelectedAnchors}
	          disabled={!canDeleteNode}
	          title="Delete selected node(s)"
	          aria-label="Delete node"
	        >
	          <Trash2Icon size={16} aria-hidden="true" />
	        </Button>
	      </div>
	      <div class="toolbar-separator" aria-hidden="true">
	        <Separator orientation="vertical" class="h-6" decorative />
	      </div>
	      <div class="node-type-controls" aria-label="Node type">
	        <Button
	          variant="outline"
	          size="icon-sm"
	          class={nodeTypeSelected === "corner"
	            ? "bg-[#cc0000]/10 border-[#cc0000]/40"
	            : ""}
	          onclick={() => setSelectedAnchorsNodeType("corner")}
	          disabled={!validAnchors.length}
	          title="Corner node"
	          aria-label="Corner node"
	        >
	          <span aria-hidden="true"><NodeCornerIcon size={16} /></span>
	        </Button>
	        <Button
	          variant="outline"
	          size="icon-sm"
	          class={nodeTypeSelected === "smooth"
	            ? "bg-[#cc0000]/10 border-[#cc0000]/40"
	            : ""}
	          onclick={() => setSelectedAnchorsNodeType("smooth")}
	          disabled={!validAnchors.length}
	          title="Smooth node (collinear handles)"
	          aria-label="Smooth node"
	        >
	          <span aria-hidden="true"><NodeSmoothIcon size={16} /></span>
	        </Button>
	        <Button
	          variant="outline"
	          size="icon-sm"
	          class={nodeTypeSelected === "symmetric"
	            ? "bg-[#cc0000]/10 border-[#cc0000]/40"
	            : ""}
	          onclick={() => setSelectedAnchorsNodeType("symmetric")}
	          disabled={!validAnchors.length}
	          title="Symmetric node (equal + collinear handles)"
	          aria-label="Symmetric node"
	        >
	          <span aria-hidden="true"><NodeSymmetricIcon size={16} /></span>
	        </Button>
	        <Button
	          variant="outline"
	          size="icon-sm"
	          onclick={makeSelectedAnchorsCurved}
	          disabled={!selection.anchors.length}
	          title="Curve node (pull out handles)"
	          aria-label="Curve node"
	        >
	          <span aria-hidden="true"><CurveNodeToolIcon size={16} /></span>
	        </Button>
	      </div>
	      <div class="toolbar-separator" aria-hidden="true">
	        <Separator orientation="vertical" class="h-6" decorative />
	      </div>
	      <div class="convert-controls" aria-label="Convert">
	        <Button
	          variant="outline"
	          size="icon-sm"
	          onclick={makeSelectedSegmentsStraight}
	          disabled={!canMakeSegmentsStraight}
	          title="Straight segment"
	          aria-label="Straight segment"
	        >
	          <span aria-hidden="true"><SegmentLineIcon size={16} /></span>
	        </Button>
	        <Button
	          variant="outline"
	          size="icon-sm"
	          onclick={makeSelectedSegmentsCurved}
	          disabled={!canMakeSegmentsCurved}
	          title="Curved segment"
	          aria-label="Curved segment"
	        >
	          <span aria-hidden="true"><SegmentCurveIcon size={16} /></span>
	        </Button>
	      </div>
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

  .controls input[type="checkbox"] {
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
    flex-wrap: wrap;
    justify-content: center;
  }

	  .convert-controls,
	  .node-type-controls,
	  .edit-controls {
	    display: inline-flex;
	    align-items: center;
	    gap: 0.25rem;
	  }

	  .toolbar-separator {
	    display: flex;
	    align-items: center;
	    justify-content: center;
	  }

	  /* active styles are applied via tailwind classes on the Button */

  canvas {
    background: transparent;
    cursor: default;
  }
</style>
