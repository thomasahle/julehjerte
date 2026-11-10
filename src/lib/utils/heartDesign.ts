import type { Finger, GridSize, HeartDescriptions, HeartDesign, HeartNames, HeartDesignJson, HeartPattern, LobeId, NodeType, Vec } from '$lib/types/heart';
import { STRIP_WIDTH, BASE_CENTER, MIN_GRID_SIZE, MAX_GRID_SIZE } from '$lib/constants';
import { clamp, clampInt } from '$lib/utils/math';
import {
  type BezierSegment,
  parsePathDataToSegments,
  segmentsToPathData,
  cloneSegments,
  reverseSegments
} from '$lib/geometry/bezierSegments';
import { inferOverlapRect as inferOverlapRectFromFingers } from '$lib/utils/overlapRect';
import { parseHeartColors } from '$lib/utils/heartColors';
import { validateRawFingers } from '$lib/utils/validatePaths';
import { SITE_DOMAIN } from '$lib/config';
import { escapeXml } from '$lib/utils/xml';

// Reading a heart from an SVG is its own module, re-exported for the callers
// that import it from here. It uses the normalisers below, so the two modules
// import each other; only functions cross, called after both have loaded.
export { parseHeartFromSVG, parseHeartFromSVGWithReport } from '$lib/utils/svgImport';

type RawFinger = { id?: unknown; lobe?: unknown; pathData?: unknown; nodeTypes?: unknown };
type RawDesign = Omit<Partial<HeartDesignJson>, 'gridSize' | 'fingers' | 'colors'> & {
  gridSize?: unknown;
  fingers?: unknown;
  colors?: unknown;
};

// ============================================================================
// Coordinate Transform: JSON (0-100) ↔ Internal Pixels
// ============================================================================

interface OverlapRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function getOverlapRect(gridSize: GridSize, aspectRatio?: number): OverlapRect {
  const width = aspectRatio === undefined ? gridSize.x * STRIP_WIDTH : Math.max(gridSize.x, gridSize.y * aspectRatio) * STRIP_WIDTH;
  const height = aspectRatio === undefined ? gridSize.y * STRIP_WIDTH : width / aspectRatio;
  return {
    left: BASE_CENTER - width / 2,
    top: BASE_CENTER - height / 2,
    width,
    height
  };
}

/** Transform a single coordinate from JSON (0-100) to pixels */
function jsonToPixel(jsonCoord: number, rectOffset: number, rectSize: number): number {
  return rectOffset + (jsonCoord / 100) * rectSize;
}

/** Transform a single coordinate from pixels to JSON (0-100) */
function pixelToJson(pixelCoord: number, rectOffset: number, rectSize: number): number {
  return ((pixelCoord - rectOffset) / rectSize) * 100;
}

/** Transform segments from JSON (0-100) coordinates to internal pixel coordinates */
export function transformSegmentsToPixels(segments: BezierSegment[], gridSize: GridSize, aspectRatio?: number): BezierSegment[] {
  const rect = getOverlapRect(gridSize, aspectRatio);
  return segments.map((seg) => ({
    p0: { x: jsonToPixel(seg.p0.x, rect.left, rect.width), y: jsonToPixel(seg.p0.y, rect.top, rect.height) },
    p1: { x: jsonToPixel(seg.p1.x, rect.left, rect.width), y: jsonToPixel(seg.p1.y, rect.top, rect.height) },
    p2: { x: jsonToPixel(seg.p2.x, rect.left, rect.width), y: jsonToPixel(seg.p2.y, rect.top, rect.height) },
    p3: { x: jsonToPixel(seg.p3.x, rect.left, rect.width), y: jsonToPixel(seg.p3.y, rect.top, rect.height) }
  }));
}

/** Transform segments from internal pixel coordinates to JSON (0-100) coordinates */
function transformSegmentsToJson(segments: BezierSegment[], rect: OverlapRect): BezierSegment[] {
  return segments.map((seg) => ({
    p0: { x: pixelToJson(seg.p0.x, rect.left, rect.width), y: pixelToJson(seg.p0.y, rect.top, rect.height) },
    p1: { x: pixelToJson(seg.p1.x, rect.left, rect.width), y: pixelToJson(seg.p1.y, rect.top, rect.height) },
    p2: { x: pixelToJson(seg.p2.x, rect.left, rect.width), y: pixelToJson(seg.p2.y, rect.top, rect.height) },
    p3: { x: pixelToJson(seg.p3.x, rect.left, rect.width), y: pixelToJson(seg.p3.y, rect.top, rect.height) }
  }));
}

function normalizeGridSize(raw: unknown): GridSize {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = clampInt(raw, MIN_GRID_SIZE, MAX_GRID_SIZE);
    return { x: n, y: n };
  }
  if (raw && typeof raw === 'object') {
    const { x, y } = raw as { x?: unknown; y?: unknown };
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      return { x: clampInt(x, MIN_GRID_SIZE, MAX_GRID_SIZE), y: clampInt(y, MIN_GRID_SIZE, MAX_GRID_SIZE) };
    }
  }
  return { x: 3, y: 3 };
}

/** Which way the checks fall, from whatever a file or a prop says: 1 for a finite number that rounds to a positive odd one, else 0. */
export function normalizeWeaveParity(raw: unknown): 0 | 1 {
  const v = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 0;
  return v % 2 === 1 ? 1 : 0;
}

/**
 * A tile of Tegn's Escher tab as a heart keeps it (`HeartPattern`), or undefined
 * when it is not well formed. Only its form is checked here, so reading a heart
 * does not need the tiling: whether the type is one of ours and the cuts are
 * still the tile's is the Escher tab's to say ($lib/pattern/escherTab).
 */
export function normalizePattern(raw: unknown): HeartPattern | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(finite);
  const whole = (v: unknown): v is [number, number] => pair(v) && v.every(Number.isInteger);
  if (typeof r.rule !== 'string' || !r.rule) return undefined;
  if (!finite(r.cuts) || !Number.isInteger(r.cuts) || r.cuts < MIN_GRID_SIZE - 1 || r.cuts > MAX_GRID_SIZE - 1) return undefined;
  if (!r.curves || typeof r.curves !== 'object' || Array.isArray(r.curves)) return undefined;
  const curves: Record<string, number[][]> = {};
  for (const [key, curve] of Object.entries(r.curves as Record<string, unknown>)) {
    if (!Array.isArray(curve) || !curve.length) return undefined;
    if (!curve.every((seg) => Array.isArray(seg) && seg.length === 8 && seg.every(finite))) return undefined;
    curves[key] = curve.map((seg) => [...(seg as number[])]);
  }
  const lines = r.lines as { V?: unknown; H?: unknown } | undefined;
  const four = (v: unknown): v is [number, number, number, number] => Array.isArray(v) && v.length === 4 && v.every(finite);
  if (r.corners !== undefined && !(Array.isArray(r.corners) && r.corners.length <= 32 && r.corners.every(finite))) return undefined;
  const joints = r.joints as { join?: unknown; free?: unknown } | undefined;
  if (joints !== undefined && !(joints && ['red', 'white', 'level', 'upright'].includes(joints.join as string) && Array.isArray(joints.free) && joints.free.length <= 32 && joints.free.every(finite))) return undefined;
  if (r.offset !== undefined && !pair(r.offset)) return undefined;
  if (r.inverted !== undefined && r.inverted !== true) return undefined;
  if (r.shape !== undefined && !four(r.shape)) return undefined;
  if (r.turn !== undefined && !finite(r.turn)) return undefined;
  // The node types the visitor gave the curves: by curve, by node, each one of ours.
  const typesOk = (v: unknown) =>
    !!v && typeof v === 'object' && !Array.isArray(v) &&
    Object.values(v as Record<string, unknown>).every((types) =>
      !!types && typeof types === 'object' && !Array.isArray(types) &&
      Object.values(types as Record<string, unknown>).every((t) => t === 'corner' || t === 'smooth' || t === 'symmetric'));
  if (r.nodeTypes !== undefined && !typesOk(r.nodeTypes)) return undefined;
  if (r.pan !== undefined && !pair(r.pan)) return undefined;
  if (lines !== undefined && !(lines && whole(lines.V) && whole(lines.H))) return undefined;
  return {
    rule: r.rule,
    cuts: r.cuts,
    curves,
    ...(r.corners ? { corners: [...(r.corners as number[])] } : {}),
    ...(joints ? { joints: { join: joints.join as 'red' | 'white' | 'level' | 'upright', free: [...(joints.free as number[])] } } : {}),
    ...(r.offset ? { offset: [...(r.offset as [number, number])] as [number, number] } : {}),
    ...(r.inverted ? { inverted: true } : {}),
    ...(r.shape ? { shape: [...(r.shape as [number, number, number, number])] as [number, number, number, number] } : {}),
    ...(r.turn !== undefined ? { turn: r.turn as number } : {}),
    ...(r.nodeTypes !== undefined
      ? { nodeTypes: Object.fromEntries(Object.entries(r.nodeTypes as Record<string, Record<string, NodeType>>).map(([key, types]) => [key, { ...types }])) }
      : {}),
    ...(r.pan ? { pan: [...(r.pan as [number, number])] as [number, number] } : {}),
    ...(lines ? { lines: { V: [...(lines.V as [number, number])] as [number, number], H: [...(lines.H as [number, number])] as [number, number] } } : {})
  };
}

export function normalizeAspectRatio(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0.01 && raw <= 100 ? raw : undefined;
}

function serializationRect(design: HeartDesign): OverlapRect {
  // Read the actual edited frame when an explicit shape is carried. Grid edits
  // may have changed it since import; strip counts are not physical dimensions.
  return design.overlapAspectRatio === undefined ? getOverlapRect(design.gridSize) : inferOverlapRectFromFingers(design.fingers, design.gridSize);
}

/**
 * Whether a heart's woven area has a shape of its own rather than the one its
 * strip counts give: an explicit shape it was imported with, or a frame its cuts
 * say is another (a strip added by dragging an edge in, a moved Escher pattern's
 * extra line: a strip more one way in the same square).
 */
function hasOwnShape(design: HeartDesign): boolean {
  if (design.overlapAspectRatio !== undefined) return true;
  const own = inferOverlapRectFromFingers(design.fingers, design.gridSize);
  const strips = getOverlapRect(design.gridSize);
  return Math.abs(own.width / own.height - strips.width / strips.height) > 1e-6;
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

export function canonicalizeFingerForGrid(finger: Finger, rect: { left: number; right: number; top: number; bottom: number }): Finger {
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

  let segments = cloneSegments(finger.segments);
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
    segments,
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
    return { id, lobe, segments: [{ p0, p1, p2, p3 }] };
  }
  const y = pos;
  const p0: Vec = { x: rect.right, y };
  const p3: Vec = { x: rect.left, y };
  const p1: Vec = { ...p0 };
  const p2: Vec = { ...p3 };
  return { id, lobe, segments: [{ p0, p1, p2, p3 }] };
}

export function ensureOuterBoundaries(fingers: Finger[], rect: { left: number; right: number; top: number; bottom: number }): Finger[] {
  const tol = 0.75;

  const atTop = (f: Finger) => {
    if (f.lobe !== 'left') return false;
    const segs = f.segments;
    if (!segs.length) return false;
    const first = segs[0]!;
    const last = segs[segs.length - 1]!;
    return Math.abs(first.p0.y - rect.top) <= tol && Math.abs(last.p3.y - rect.top) <= tol;
  };
  const atBottom = (f: Finger) => {
    if (f.lobe !== 'left') return false;
    const segs = f.segments;
    if (!segs.length) return false;
    const first = segs[0]!;
    const last = segs[segs.length - 1]!;
    return Math.abs(first.p0.y - rect.bottom) <= tol && Math.abs(last.p3.y - rect.bottom) <= tol;
  };
  const atLeft = (f: Finger) => {
    if (f.lobe !== 'right') return false;
    const segs = f.segments;
    if (!segs.length) return false;
    const first = segs[0]!;
    const last = segs[segs.length - 1]!;
    return Math.abs(first.p0.x - rect.left) <= tol && Math.abs(last.p3.x - rect.left) <= tol;
  };
  const atRight = (f: Finger) => {
    if (f.lobe !== 'right') return false;
    const segs = f.segments;
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
  return segmentsToPathData(finger.segments);
}

function normalizeFinger(raw: unknown, gridSize: GridSize, aspectRatio?: number): Finger | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RawFinger;

  const lobe = r.lobe === 'left' || r.lobe === 'right' ? (r.lobe as LobeId) : null;
  if (!lobe) return null;

  const pathData = typeof r.pathData === 'string' ? r.pathData : null;
  if (!pathData || !pathData.trim()) return null;

  // Generate ID if not provided (IDs are regenerated on load anyway)
  const id = typeof r.id === 'string' ? r.id : `${lobe === 'left' ? 'L' : 'R'}-tmp-${Math.random().toString(36).slice(2, 9)}`;

  // Parse path data (in JSON 0-100 format) and transform to internal pixel coordinates
  const jsonSegments = parsePathDataToSegments(pathData);
  const first = jsonSegments[0];
  const last = jsonSegments[jsonSegments.length - 1];
  if (first && last) {
    // Transform from JSON 0-100 coords to internal pixel coords
    const pixelSegments = transformSegmentsToPixels(jsonSegments, gridSize, aspectRatio);
    const nodeTypes = normalizeNodeTypes(r.nodeTypes, pixelSegments.length);
    return {
      id,
      lobe,
      segments: pixelSegments,
      nodeTypes
    };
  }

  return null;
}

/**
 * The written paragraphs in each site language, or `undefined` when there are
 * none. Anything that is not a non-empty string for `da` or `en` is dropped, so
 * hearts saved before the field existed (or a hand-edited file) load as before.
 */
export function normalizeDescriptions(raw: unknown): HeartDescriptions | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: HeartDescriptions = {};
  for (const lang of ['da', 'en'] as const) {
    const text = typeof r[lang] === 'string' ? (r[lang] as string).trim() : '';
    if (text) out[lang] = text;
  }
  return out.da || out.en ? out : undefined;
}

/**
 * The name in each site language, or `undefined` when there is none; validated
 * like `normalizeDescriptions`, so a name that is not a non-empty string is
 * dropped and the heart falls back to its own `name`.
 */
export function normalizeNames(raw: unknown): HeartNames | undefined {
  return normalizeDescriptions(raw);
}

export function normalizeHeartDesign(raw: unknown): HeartDesign | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RawDesign;

  const id = typeof r.id === 'string' ? r.id : '';
  const name = typeof r.name === 'string' ? r.name : 'Untitled';
  const names = normalizeNames(r.names);
  const author = typeof r.author === 'string' ? r.author : '';
  const authorUrl =
    typeof r.authorUrl === 'string' && r.authorUrl.trim() ? r.authorUrl.trim() : undefined;
  const publisher =
    typeof r.publisher === 'string' && r.publisher.trim() ? r.publisher.trim() : undefined;
  const publisherUrl =
    typeof r.publisherUrl === 'string' && r.publisherUrl.trim() ? r.publisherUrl.trim() : undefined;
  const source = typeof r.source === 'string' && r.source.trim() ? r.source.trim() : undefined;
  const date = typeof r.date === 'string' && r.date.trim() ? r.date.trim() : undefined;
  const description = typeof r.description === 'string' ? r.description : undefined;
  const descriptions = normalizeDescriptions(r.descriptions);
  const weaveParity = normalizeWeaveParity(r.weaveParity);
  // Absent or malformed colours leave the heart on the site-wide pair.
  const colors = parseHeartColors(r.colors);
  const gridSize = normalizeGridSize(r.gridSize);
  const overlapAspectRatio = normalizeAspectRatio(r.overlapAspectRatio);
  const pattern = normalizePattern(r.pattern);

  const fingersRaw = Array.isArray(r.fingers) ? r.fingers : [];

  // Validate raw JSON paths (0-100 coords) before transformation
  if (fingersRaw.length > 0) {
    validateRawFingers(id || 'unknown', fingersRaw, name);
  }

  let fingers = fingersRaw
    .map((f) => normalizeFinger(f, gridSize, overlapAspectRatio))
    .filter((f): f is Finger => f !== null);

  const rect = inferOverlapRectFromFingers(fingers, gridSize);
  fingers = fingers.map((f) => canonicalizeFingerForGrid(f, rect));
  fingers = ensureOuterBoundaries(fingers, rect);

  const inferredGrid: GridSize = {
    x: clampInt(fingers.filter((f) => f.lobe === 'right').length - 1, MIN_GRID_SIZE, MAX_GRID_SIZE),
    y: clampInt(fingers.filter((f) => f.lobe === 'left').length - 1, MIN_GRID_SIZE, MAX_GRID_SIZE)
  };

  return {
    id,
    name,
    names,
    author,
    authorUrl,
    publisher,
    publisherUrl,
    source,
    date,
    description,
    descriptions,
    weaveParity,
    colors,
    gridSize: inferredGrid,
    ...(overlapAspectRatio === undefined ? {} : { overlapAspectRatio }),
    ...(pattern ? { pattern } : {}),
    fingers
  };
}

/** Get the primary coordinate for a finger (y for left lobe, x for right lobe) */
function getFingerPosition(finger: Finger): number {
  const segments = finger.segments;
  if (!segments.length) return 0;
  // For left lobe, position is the y-coordinate (horizontal paths)
  // For right lobe, position is the x-coordinate (vertical paths)
  if (finger.lobe === 'left') {
    return segments[0]!.p0.y;
  }
  return segments[0]!.p0.x;
}

export function serializeHeartDesign(design: HeartDesign): HeartDesignJson {
  const rect = serializationRect(design);
  // Sort fingers by position so boundaries are at correct positions
  const leftFingers = design.fingers
    .filter((f) => f.lobe === 'left')
    .sort((a, b) => getFingerPosition(a) - getFingerPosition(b));
  const rightFingers = design.fingers
    .filter((f) => f.lobe === 'right')
    .sort((a, b) => getFingerPosition(a) - getFingerPosition(b));

  // Filter out outer boundary curves (first and last of each lobe - dummy edges for editing)
  const interiorFingers = [
    ...leftFingers.slice(1, -1),
    ...rightFingers.slice(1, -1)
  ];

  return {
    id: design.id,
    name: design.name,
    names: design.names,
    author: design.author,
    authorUrl: design.authorUrl,
    publisher: design.publisher,
    publisherUrl: design.publisherUrl,
    source: design.source,
    date: design.date,
    description: design.description,
    descriptions: design.descriptions,
    weaveParity: design.weaveParity ?? 0,
    colors: design.colors,
    gridSize: design.gridSize,
    ...(design.overlapAspectRatio === undefined ? {} : { overlapAspectRatio: rect.width / rect.height }),
    ...(design.pattern ? { pattern: design.pattern } : {}),
    fingers: interiorFingers.map((f) => {
      // Transform from internal pixel coords to JSON 0-100 coords
      const jsonSegments = transformSegmentsToJson(f.segments, rect);
      return {
        id: f.id,
        lobe: f.lobe,
        pathData: segmentsToPathData(jsonSegments),
        nodeTypes: f.nodeTypes && Object.keys(f.nodeTypes).length ? f.nodeTypes : undefined
      };
    })
  };
}

// ============================================================================
// SVG Serialization (reading an SVG back is $lib/utils/svgImport)
// ============================================================================

export function serializeHeartToSVG(design: HeartDesign): string {
  // An SVG is read back by the shape it says it has, its strip counts' unless it
  // says otherwise, so a heart with a shape of its own is written in its own frame
  // and says so; JSON reads the frame back off the cuts and needs no such word.
  const ownShape = hasOwnShape(design);
  const rect = ownShape ? inferOverlapRectFromFingers(design.fingers, design.gridSize) : serializationRect(design);
  // Sort fingers by position so boundaries are at correct positions, then filter out outer boundaries
  const leftFingers = design.fingers
    .filter((f) => f.lobe === 'left')
    .sort((a, b) => getFingerPosition(a) - getFingerPosition(b));
  const rightFingers = design.fingers
    .filter((f) => f.lobe === 'right')
    .sort((a, b) => getFingerPosition(a) - getFingerPosition(b));
  const interiorLeft = leftFingers.slice(1, -1);
  const interiorRight = rightFingers.slice(1, -1);

  // Transform to 0-100 coords and keep lobe info
  const leftPaths = interiorLeft.map((f) => {
    const jsonSegments = transformSegmentsToJson(f.segments, rect);
    return segmentsToPathData(jsonSegments);
  });
  const rightPaths = interiorRight.map((f) => {
    const jsonSegments = transformSegmentsToJson(f.segments, rect);
    return segmentsToPathData(jsonSegments);
  });

  // Build SVG with RDF/Dublin Core metadata (W3C standard)
  const attrs: string[] = [
    'viewBox="0 0 100 100"',
    'xmlns="http://www.w3.org/2000/svg"',
    'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"',
    'xmlns:cc="http://creativecommons.org/ns#"',
    'xmlns:dc="http://purl.org/dc/elements/1.1/"',
    `data-weave-parity="${design.weaveParity ?? 0}"`
  ];
  if (ownShape) attrs.push(`data-overlap-aspect-ratio="${rect.width / rect.height}"`);
  // The Escher tab's tile, when the heart was drawn from one, so the tab takes it up again on import.
  if (design.pattern) attrs.push(`data-pattern="${escapeXml(JSON.stringify(design.pattern))}"`);
  // The heart's own colours, when it has them. Gallery hearts carry none, so an
  // exported file only pins the colours if the visitor picked them in the editor.
  if (design.colors) {
    attrs.push(`data-color-left="${escapeXml(design.colors.left)}"`);
    attrs.push(`data-color-right="${escapeXml(design.colors.right)}"`);
  }

  const lines: string[] = [
    `<svg ${attrs.join(' ')}>`,
    `  <title>${escapeXml(design.name)}</title>`
  ];
  // The name per site language, right after the plain title (which stays the
  // heart's own name and the fallback). Written even when empty, like the
  // paragraphs below, so an exported file shows where they go.
  for (const lang of ['da', 'en'] as const) {
    lines.push(`  <title xml:lang="${lang}">${escapeXml(design.names?.[lang] ?? '')}</title>`);
  }
  // The paragraphs per site language, right after the title. Written even when
  // empty, so an exported file shows where a gallery heart's texts go
  // (docs/ADDING-A-HEART.md).
  for (const lang of ['da', 'en'] as const) {
    lines.push(`  <desc xml:lang="${lang}">${escapeXml(design.descriptions?.[lang] ?? '')}</desc>`);
  }
  if (design.description) {
    lines.push(`  <desc>${escapeXml(design.description)}</desc>`);
  }

  // RDF/Dublin Core metadata block
  lines.push('  <metadata>');
  lines.push('    <rdf:RDF>');
  lines.push('      <cc:Work rdf:about="">');
  lines.push(`        <dc:title>${escapeXml(design.name)}</dc:title>`);
  if (design.author) {
    lines.push('        <dc:creator>');
    if (design.authorUrl) {
      lines.push(`          <cc:Agent rdf:about="${escapeXml(design.authorUrl)}">`);
    } else {
      lines.push('          <cc:Agent>');
    }
    lines.push(`            <dc:title>${escapeXml(design.author)}</dc:title>`);
    lines.push('          </cc:Agent>');
    lines.push('        </dc:creator>');
  }
  if (design.publisher) {
    lines.push('        <dc:publisher>');
    if (design.publisherUrl) {
      lines.push(`          <cc:Agent rdf:about="${escapeXml(design.publisherUrl)}">`);
    } else {
      lines.push('          <cc:Agent>');
    }
    lines.push(`            <dc:title>${escapeXml(design.publisher)}</dc:title>`);
    lines.push('          </cc:Agent>');
    lines.push('        </dc:publisher>');
  }
  if (design.description) {
    lines.push(`        <dc:description>${escapeXml(design.description)}</dc:description>`);
  }
  lines.push(`        <dc:source>${escapeXml(design.source ?? SITE_DOMAIN)}</dc:source>`);
  lines.push(`        <dc:date>${escapeXml(design.date ?? new Date().toISOString().split('T')[0])}</dc:date>`);
  lines.push('      </cc:Work>');
  lines.push('    </rdf:RDF>');
  lines.push('  </metadata>');

  // Horizontal paths (left lobe) in orange, vertical paths (right lobe) in green
  for (const path of leftPaths) {
    lines.push(`  <path d="${path}" stroke="orange" fill="none"/>`);
  }
  for (const path of rightPaths) {
    lines.push(`  <path d="${path}" stroke="green" fill="none"/>`);
  }

  lines.push('</svg>');
  return lines.join('\n');
}
