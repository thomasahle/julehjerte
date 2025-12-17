import type { Finger, GridSize, HeartDesign, LobeId, NodeType, Vec } from '$lib/types/heart';
import { STRIP_WIDTH, BASE_CENTER, CENTER } from '$lib/constants';
import { clamp, clampInt } from '$lib/utils/math';
import {
  type BezierSegment,
  parsePathDataToSegments,
  segmentsToPathData
} from '$lib/geometry/bezierSegments';
import {
  getCenteredRectParams,
  inferOverlapRect as inferOverlapRectFromFingers
} from '$lib/utils/overlapRect';

type RawFinger = Partial<Finger> & { id?: unknown; lobe?: unknown; pathData?: unknown };
type RawDesign = Omit<Partial<HeartDesign>, 'gridSize'> & { gridSize?: unknown; fingers?: unknown };

function normalizeGridSize(raw: unknown): GridSize {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = clampInt(raw, 2, 8);
    return { x: n, y: n };
  }
  if (raw && typeof raw === 'object') {
    const x = (raw as any).x;
    const y = (raw as any).y;
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      return { x: clampInt(x, 2, 8), y: clampInt(y, 2, 8) };
    }
  }
  return { x: 3, y: 3 };
}

function normalizeWeaveParity(raw: unknown): 0 | 1 {
  const v = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 0;
  return v % 2 === 1 ? 1 : 0;
}

function reverseSegments(segments: BezierSegment[]): BezierSegment[] {
  return segments
    .slice()
    .reverse()
    .map((seg) => ({
      p0: seg.p3,
      p1: seg.p2,
      p2: seg.p1,
      p3: seg.p0
    }));
}

function normalizeNodeTypes(
  raw: unknown,
  segmentsLength: number
): Record<string, NodeType> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, NodeType> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const idx = Number(k);
    if (!Number.isFinite(idx) || idx < 0 || idx > segmentsLength) continue;
    if (v !== 'corner' && v !== 'smooth' && v !== 'symmetric') continue;
    out[String(idx)] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function reverseNodeTypes(nodeTypes: Record<string, NodeType> | undefined, segmentsLength: number) {
  if (!nodeTypes) return undefined;
  const out: Record<string, NodeType> = {};
  for (const [k, v] of Object.entries(nodeTypes)) {
    const idx = Number(k);
    if (!Number.isFinite(idx)) continue;
    const nextIdx = segmentsLength - idx;
    if (nextIdx < 0 || nextIdx > segmentsLength) continue;
    out[String(nextIdx)] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function canonicalizeFingerForGrid(finger: Finger, rect: { left: number; right: number; top: number; bottom: number }): Finger {
  const minX = rect.left;
  const maxX = rect.right;
  const minY = rect.top;
  const maxY = rect.bottom;

  const projectEndpoint = (point: Vec, pointKey: 'p0' | 'p3'): Vec => {
    if (finger.lobe === 'left') {
      const y = clamp(point.y, minY, maxY);
      const x = pointKey === 'p0' ? maxX : minX;
      return { x, y };
    }
    const x = clamp(point.x, minX, maxX);
    const y = pointKey === 'p0' ? maxY : minY;
    return { x, y };
  };

  let segments = parsePathDataToSegments(finger.pathData);
  if (!segments.length) return finger;
  let nodeTypes = finger.nodeTypes;

  const start = segments[0].p0;
  const end = segments[segments.length - 1].p3;

  const expectedStart = projectEndpoint(start, 'p0');
  const expectedEnd = projectEndpoint(end, 'p3');
  const directCost =
    Math.hypot(start.x - expectedStart.x, start.y - expectedStart.y) +
    Math.hypot(end.x - expectedEnd.x, end.y - expectedEnd.y);

  const swappedStart = end;
  const swappedEnd = start;
  const expectedSwappedStart = projectEndpoint(swappedStart, 'p0');
  const expectedSwappedEnd = projectEndpoint(swappedEnd, 'p3');
  const swappedCost =
    Math.hypot(swappedStart.x - expectedSwappedStart.x, swappedStart.y - expectedSwappedStart.y) +
    Math.hypot(swappedEnd.x - expectedSwappedEnd.x, swappedEnd.y - expectedSwappedEnd.y);

  if (swappedCost + 0.01 < directCost) {
    segments = reverseSegments(segments);
    nodeTypes = reverseNodeTypes(nodeTypes, segments.length);
  }

  const first = segments[0];
  const last = segments[segments.length - 1];

  const desiredP0 = projectEndpoint(first.p0, 'p0');
  const desiredP3 = projectEndpoint(last.p3, 'p3');
  const d0 = { x: desiredP0.x - first.p0.x, y: desiredP0.y - first.p0.y };
  const d3 = { x: desiredP3.x - last.p3.x, y: desiredP3.y - last.p3.y };

  first.p0 = desiredP0;
  first.p1 = { x: first.p1.x + d0.x, y: first.p1.y + d0.y };

  last.p3 = desiredP3;
  last.p2 = { x: last.p2.x + d3.x, y: last.p2.y + d3.y };

  return {
    id: finger.id,
    lobe: finger.lobe,
    pathData: segmentsToPathData(segments),
    nodeTypes
  };
}

function makeStraightBoundary(lobe: LobeId, rect: { left: number; right: number; top: number; bottom: number }, pos: number): Finger {
  const id = `${lobe === 'left' ? 'L' : 'R'}-edge-${pos}`;
  if (lobe === 'right') {
    const x = pos;
    const p0: Vec = { x, y: rect.bottom };
    const p3: Vec = { x, y: rect.top };
    const p1: Vec = { ...p0 };
    const p2: Vec = { ...p3 };
    return { id, lobe, pathData: segmentsToPathData([{ p0, p1, p2, p3 }]) };
  }
  const y = pos;
  const p0: Vec = { x: rect.right, y };
  const p3: Vec = { x: rect.left, y };
  const p1: Vec = { ...p0 };
  const p2: Vec = { ...p3 };
  return { id, lobe, pathData: segmentsToPathData([{ p0, p1, p2, p3 }]) };
}

function ensureOuterBoundaries(fingers: Finger[], rect: { left: number; right: number; top: number; bottom: number }): Finger[] {
  const tol = 0.75;

  const atTop = (f: Finger) => {
    if (f.lobe !== 'left') return false;
    const segs = parsePathDataToSegments(f.pathData);
    if (!segs.length) return false;
    const first = segs[0]!;
    const last = segs[segs.length - 1]!;
    return Math.abs(first.p0.y - rect.top) <= tol && Math.abs(last.p3.y - rect.top) <= tol;
  };
  const atBottom = (f: Finger) => {
    if (f.lobe !== 'left') return false;
    const segs = parsePathDataToSegments(f.pathData);
    if (!segs.length) return false;
    const first = segs[0]!;
    const last = segs[segs.length - 1]!;
    return Math.abs(first.p0.y - rect.bottom) <= tol && Math.abs(last.p3.y - rect.bottom) <= tol;
  };
  const atLeft = (f: Finger) => {
    if (f.lobe !== 'right') return false;
    const segs = parsePathDataToSegments(f.pathData);
    if (!segs.length) return false;
    const first = segs[0]!;
    const last = segs[segs.length - 1]!;
    return Math.abs(first.p0.x - rect.left) <= tol && Math.abs(last.p3.x - rect.left) <= tol;
  };
  const atRight = (f: Finger) => {
    if (f.lobe !== 'right') return false;
    const segs = parsePathDataToSegments(f.pathData);
    if (!segs.length) return false;
    const first = segs[0]!;
    const last = segs[segs.length - 1]!;
    return Math.abs(first.p0.x - rect.right) <= tol && Math.abs(last.p3.x - rect.right) <= tol;
  };

  const next = fingers.slice();
  if (!next.some(atTop)) next.push(makeStraightBoundary('left', rect, rect.top));
  if (!next.some(atBottom)) next.push(makeStraightBoundary('left', rect, rect.bottom));
  if (!next.some(atLeft)) next.push(makeStraightBoundary('right', rect, rect.left));
  if (!next.some(atRight)) next.push(makeStraightBoundary('right', rect, rect.right));
  return next;
}

export function fingerToPathData(finger: Finger): string {
  return finger.pathData;
}

export function normalizeFinger(raw: unknown): Finger | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RawFinger;

  const id = typeof r.id === 'string' ? r.id : null;
  const lobe = r.lobe === 'left' || r.lobe === 'right' ? (r.lobe as LobeId) : null;
  if (!id || !lobe) return null;

  const pathData = typeof r.pathData === 'string' ? r.pathData : null;
  if (!pathData || !pathData.trim()) return null;

  const segments = parsePathDataToSegments(pathData);
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (first && last) {
    const nodeTypes = normalizeNodeTypes((r as any).nodeTypes, segments.length);
    return {
      id,
      lobe,
      pathData: segmentsToPathData(segments),
      nodeTypes
    };
  }

  return null;
}

export function normalizeHeartDesign(raw: unknown): HeartDesign | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RawDesign;

  const id = typeof r.id === 'string' ? r.id : '';
  const name = typeof r.name === 'string' ? r.name : 'Untitled';
  const author = typeof r.author === 'string' ? r.author : '';
  const description = typeof r.description === 'string' ? r.description : undefined;
  const weaveParity = normalizeWeaveParity((r as any).weaveParity);
  const gridSize = normalizeGridSize(r.gridSize);

  const fingersRaw = Array.isArray(r.fingers) ? r.fingers : [];
  let fingers = fingersRaw
    .map(normalizeFinger)
    .filter((f): f is Finger => f !== null);

  const rect = inferOverlapRectFromFingers(fingers, gridSize);
  fingers = fingers.map((f) => canonicalizeFingerForGrid(f, rect));
  fingers = ensureOuterBoundaries(fingers, rect);

  const inferredGrid: GridSize = {
    x: clampInt(fingers.filter((f) => f.lobe === 'right').length - 1, 2, 8),
    y: clampInt(fingers.filter((f) => f.lobe === 'left').length - 1, 2, 8)
  };

  return {
    id,
    name,
    author,
    description,
    weaveParity,
    gridSize: inferredGrid,
    fingers
  };
}

export function serializeHeartDesign(design: HeartDesign): Omit<HeartDesign, 'fingers'> & {
  fingers: Array<{ id: string; lobe: LobeId; pathData: string; nodeTypes?: Record<string, NodeType> }>;
} {
  return {
    id: design.id,
    name: design.name,
    author: design.author,
    description: design.description,
    weaveParity: design.weaveParity ?? 0,
    gridSize: design.gridSize,
    fingers: design.fingers.map((f) => ({
      id: f.id,
      lobe: f.lobe,
      pathData: fingerToPathData(f),
      nodeTypes: f.nodeTypes && Object.keys(f.nodeTypes).length ? f.nodeTypes : undefined
    }))
  };
}
