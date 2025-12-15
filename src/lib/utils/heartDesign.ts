import type { Finger, HeartDesign, LobeId, Vec } from '$lib/types/heart';

type RawVec = Partial<Vec> & { x?: unknown; y?: unknown };
type RawFinger = Partial<Finger> & { id?: unknown; lobe?: unknown; pathData?: unknown };
type RawDesign = Partial<HeartDesign> & { fingers?: unknown };

type BezierSegment = { p0: Vec; p1: Vec; p2: Vec; p3: Vec };

const BASE_CANVAS_SIZE = 600;
const CENTER = { x: BASE_CANVAS_SIZE / 2, y: BASE_CANVAS_SIZE / 2 };
const STRIP_WIDTH = 75;
const LEGACY_STRIP_WIDTH = 50;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getSquareParams(gridSize: number, stripWidth: number = STRIP_WIDTH) {
  const squareSize = gridSize * stripWidth;
  const squareLeft = CENTER.x - squareSize / 2;
  const squareTop = CENTER.y - squareSize / 2;
  return { squareSize, squareLeft, squareTop };
}

function scaleVecAroundCenter(v: Vec, scale: number): Vec {
  return { x: CENTER.x + (v.x - CENTER.x) * scale, y: CENTER.y + (v.y - CENTER.y) * scale };
}

function migrateFingerScaleIfNeeded(finger: Finger, scale: number): Finger {
  if (finger.pathData) {
    const segments = parsePathDataToSegments(finger.pathData).map((seg) => ({
      p0: scaleVecAroundCenter(seg.p0, scale),
      p1: scaleVecAroundCenter(seg.p1, scale),
      p2: scaleVecAroundCenter(seg.p2, scale),
      p3: scaleVecAroundCenter(seg.p3, scale)
    }));
    if (!segments.length) return finger;
    return {
      ...finger,
      p0: segments[0].p0,
      p1: segments[0].p1,
      p2: segments[0].p2,
      p3: segments[segments.length - 1].p3,
      pathData: segments.length > 1 ? segmentsToPathData(segments) : undefined
    };
  }

  return {
    ...finger,
    p0: scaleVecAroundCenter(finger.p0, scale),
    p1: scaleVecAroundCenter(finger.p1, scale),
    p2: scaleVecAroundCenter(finger.p2, scale),
    p3: scaleVecAroundCenter(finger.p3, scale),
    pathData: undefined
  };
}

function edgeEndpointCost(fingers: Finger[], gridSize: number, stripWidth: number): number {
  if (!fingers.length) return Number.POSITIVE_INFINITY;
  const { squareSize, squareLeft, squareTop } = getSquareParams(gridSize, stripWidth);
  const minX = squareLeft;
  const maxX = squareLeft + squareSize;
  const minY = squareTop;
  const maxY = squareTop + squareSize;

  let cost = 0;
  for (const finger of fingers) {
    if (finger.lobe === 'left') {
      const direct = Math.abs(finger.p0.x - maxX) + Math.abs(finger.p3.x - minX);
      const swapped = Math.abs(finger.p3.x - maxX) + Math.abs(finger.p0.x - minX);
      cost += Math.min(direct, swapped);
    } else {
      const direct = Math.abs(finger.p0.y - maxY) + Math.abs(finger.p3.y - minY);
      const swapped = Math.abs(finger.p3.y - maxY) + Math.abs(finger.p0.y - minY);
      cost += Math.min(direct, swapped);
    }
  }
  return cost / fingers.length;
}

function isVec(v: unknown): v is Vec {
  if (!v || typeof v !== 'object') return false;
  const x = (v as RawVec).x;
  const y = (v as RawVec).y;
  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y);
}

function parsePathDataToSegments(pathData: string): BezierSegment[] {
  const segments: BezierSegment[] = [];
  const commands = pathData.match(/[MLCQAZ][^MLCQAZ]*/gi) || [];
  let currentX = 0;
  let currentY = 0;

  for (const cmd of commands) {
    const type = cmd[0]?.toUpperCase();
    const args = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);

    if (type === 'M') {
      currentX = args[0] ?? currentX;
      currentY = args[1] ?? currentY;
    } else if (type === 'C') {
      // Cubic bezier: C x1 y1 x2 y2 x y
      if (args.length >= 6) {
        segments.push({
          p0: { x: currentX, y: currentY },
          p1: { x: args[0]!, y: args[1]! },
          p2: { x: args[2]!, y: args[3]! },
          p3: { x: args[4]!, y: args[5]! }
        });
        currentX = args[4]!;
        currentY = args[5]!;
      }
    }
  }

  return segments;
}

function segmentsToPathData(segments: BezierSegment[]): string {
  if (!segments.length) return '';
  let d = `M ${segments[0].p0.x} ${segments[0].p0.y}`;
  for (const seg of segments) {
    d += ` C ${seg.p1.x} ${seg.p1.y} ${seg.p2.x} ${seg.p2.y} ${seg.p3.x} ${seg.p3.y}`;
  }
  return d;
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

function canonicalizeFingerForGrid(finger: Finger, gridSize: number): Finger {
  const { squareSize, squareLeft, squareTop } = getSquareParams(gridSize);
  const minX = squareLeft;
  const maxX = squareLeft + squareSize;
  const minY = squareTop;
  const maxY = squareTop + squareSize;

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

  if (typeof finger.pathData === 'string' && finger.pathData.trim()) {
    let segments = parsePathDataToSegments(finger.pathData);
    if (!segments.length) return finger;

    const start = segments[0].p0;
    const end = segments[segments.length - 1].p3;

    const expectedStart = projectEndpoint(start, 'p0');
    const expectedEnd = projectEndpoint(end, 'p3');
    const directCost = Math.hypot(start.x - expectedStart.x, start.y - expectedStart.y) + Math.hypot(end.x - expectedEnd.x, end.y - expectedEnd.y);

    const swappedStart = end;
    const swappedEnd = start;
    const expectedSwappedStart = projectEndpoint(swappedStart, 'p0');
    const expectedSwappedEnd = projectEndpoint(swappedEnd, 'p3');
    const swappedCost = Math.hypot(swappedStart.x - expectedSwappedStart.x, swappedStart.y - expectedSwappedStart.y) + Math.hypot(swappedEnd.x - expectedSwappedEnd.x, swappedEnd.y - expectedSwappedEnd.y);

    if (swappedCost + 0.01 < directCost) {
      segments = reverseSegments(segments);
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

    const multi = segments.length > 1;
    const next: Finger = {
      id: finger.id,
      lobe: finger.lobe,
      p0: segments[0].p0,
      p1: segments[0].p1,
      p2: segments[0].p2,
      p3: segments[segments.length - 1].p3,
      pathData: multi ? segmentsToPathData(segments) : undefined
    };

    if (!multi) {
      // Single segment: ensure p2/p1 preserved after endpoint projection.
      next.p2 = segments[0].p2;
      next.p3 = segments[0].p3;
    }

    return next;
  }

  // Simple cubic (no pathData): enforce expected orientation and snap endpoints.
  const expectedP0 = projectEndpoint(finger.p0, 'p0');
  const expectedP3 = projectEndpoint(finger.p3, 'p3');
  const directCost = Math.hypot(finger.p0.x - expectedP0.x, finger.p0.y - expectedP0.y) + Math.hypot(finger.p3.x - expectedP3.x, finger.p3.y - expectedP3.y);

  const swappedExpectedP0 = projectEndpoint(finger.p3, 'p0');
  const swappedExpectedP3 = projectEndpoint(finger.p0, 'p3');
  const swappedCost = Math.hypot(finger.p3.x - swappedExpectedP0.x, finger.p3.y - swappedExpectedP0.y) + Math.hypot(finger.p0.x - swappedExpectedP3.x, finger.p0.y - swappedExpectedP3.y);

  let next = finger;
  if (swappedCost + 0.01 < directCost) {
    next = {
      ...finger,
      p0: finger.p3,
      p1: finger.p2,
      p2: finger.p1,
      p3: finger.p0
    };
  }

  const desiredP0 = projectEndpoint(next.p0, 'p0');
  const desiredP3 = projectEndpoint(next.p3, 'p3');
  const d0 = { x: desiredP0.x - next.p0.x, y: desiredP0.y - next.p0.y };
  const d3 = { x: desiredP3.x - next.p3.x, y: desiredP3.y - next.p3.y };

  return {
    ...next,
    p0: desiredP0,
    p1: { x: next.p1.x + d0.x, y: next.p1.y + d0.y },
    p2: { x: next.p2.x + d3.x, y: next.p2.y + d3.y },
    p3: desiredP3,
    pathData: undefined
  };
}

export function fingerToPathData(finger: Finger): string {
  if (typeof finger.pathData === 'string' && finger.pathData.trim()) return finger.pathData;
  return `M ${finger.p0.x} ${finger.p0.y} C ${finger.p1.x} ${finger.p1.y} ${finger.p2.x} ${finger.p2.y} ${finger.p3.x} ${finger.p3.y}`;
}

export function normalizeFinger(raw: unknown): Finger | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RawFinger;

  const id = typeof r.id === 'string' ? r.id : null;
  const lobe = r.lobe === 'left' || r.lobe === 'right' ? (r.lobe as LobeId) : null;
  if (!id || !lobe) return null;

  const pathData = typeof r.pathData === 'string' ? r.pathData : null;
  if (pathData && pathData.trim()) {
    const segments = parsePathDataToSegments(pathData);
    const first = segments[0];
    const last = segments[segments.length - 1];
    if (first && last) {
      return {
        id,
        lobe,
        p0: first.p0,
        p1: first.p1,
        p2: first.p2,
        p3: last.p3,
        // Only keep pathData for multi-segment curves (single cubic uses p0-p3)
        pathData: segments.length > 1 ? pathData : undefined
      };
    }
  }

  if (isVec(r.p0) && isVec(r.p1) && isVec(r.p2) && isVec(r.p3)) {
    const finger: Finger = {
      id,
      lobe,
      p0: r.p0,
      p1: r.p1,
      p2: r.p2,
      p3: r.p3
    };
    return r.pathData ? { ...finger, pathData: String(r.pathData) } : finger;
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
  const gridSize = typeof r.gridSize === 'number' && Number.isFinite(r.gridSize) ? r.gridSize : 3;

  const fingersRaw = Array.isArray(r.fingers) ? r.fingers : [];
  let fingers = fingersRaw
    .map(normalizeFinger)
    .filter((f): f is Finger => f !== null);

  // Migrate older designs that were authored with the legacy 50px strip width.
  const legacyCost = edgeEndpointCost(fingers, gridSize, LEGACY_STRIP_WIDTH);
  const currentCost = edgeEndpointCost(fingers, gridSize, STRIP_WIDTH);
  if (legacyCost + 0.5 < currentCost) {
    const scale = STRIP_WIDTH / LEGACY_STRIP_WIDTH;
    fingers = fingers.map((f) => migrateFingerScaleIfNeeded(f, scale));
  }

  fingers = fingers.map((f) => canonicalizeFingerForGrid(f, gridSize));

  return {
    id,
    name,
    author,
    description,
    gridSize,
    fingers
  };
}

export function serializeHeartDesign(design: HeartDesign): Omit<HeartDesign, 'fingers'> & {
  fingers: Array<{ id: string; lobe: LobeId; pathData: string }>;
} {
  return {
    id: design.id,
    name: design.name,
    author: design.author,
    description: design.description,
    gridSize: design.gridSize,
    fingers: design.fingers.map((f) => ({ id: f.id, lobe: f.lobe, pathData: fingerToPathData(f) }))
  };
}
