import type { Finger, HeartDesign, LobeId, Vec } from '$lib/types/heart';

type RawFinger = Partial<Finger> & { id?: unknown; lobe?: unknown; pathData?: unknown };
type RawDesign = Partial<HeartDesign> & { fingers?: unknown };

type BezierSegment = { p0: Vec; p1: Vec; p2: Vec; p3: Vec };

const BASE_CANVAS_SIZE = 600;
const CENTER = { x: BASE_CANVAS_SIZE / 2, y: BASE_CANVAS_SIZE / 2 };
const STRIP_WIDTH = 75;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getSquareParams(gridSize: number, stripWidth: number = STRIP_WIDTH) {
  const squareSize = gridSize * stripWidth;
  const squareLeft = CENTER.x - squareSize / 2;
  const squareTop = CENTER.y - squareSize / 2;
  return { squareSize, squareLeft, squareTop };
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

  let segments = parsePathDataToSegments(finger.pathData);
  if (!segments.length) return finger;

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
    pathData: segmentsToPathData(segments)
  };
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
    return {
      id,
      lobe,
      pathData: segmentsToPathData(segments)
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
  const gridSize = typeof r.gridSize === 'number' && Number.isFinite(r.gridSize) ? r.gridSize : 3;

  const fingersRaw = Array.isArray(r.fingers) ? r.fingers : [];
  let fingers = fingersRaw
    .map(normalizeFinger)
    .filter((f): f is Finger => f !== null);

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
