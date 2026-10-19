import type { Finger, GridSize, HeartDescriptions, HeartDesign, HeartNames, HeartDesignJson, HeartPattern, LobeId, NodeType, Vec } from '$lib/types/heart';
import { STRIP_WIDTH, BASE_CENTER, MIN_GRID_SIZE, MAX_GRID_SIZE } from '$lib/constants';
import { clamp, clampInt } from '$lib/utils/math';
import {
  type BezierSegment,
  parsePathDataToSegments,
  parsePathDataToSubpaths,
  segmentsToPathData,
  cloneSegments,
  reverseSegments
} from '$lib/geometry/bezierSegments';
import { inferOverlapRect as inferOverlapRectFromFingers } from '$lib/utils/overlapRect';
import { parseHeartColors } from '$lib/utils/heartColors';
import { validateRawFingers } from '$lib/utils/validatePaths';
import { SITE_DOMAIN } from '$lib/config';
import { vecDist } from '$lib/geometry/vec';
import { escapeXml } from '$lib/utils/xml';

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
function transformSegmentsToPixels(segments: BezierSegment[], gridSize: GridSize, aspectRatio?: number): BezierSegment[] {
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

function normalizeWeaveParity(raw: unknown): 0 | 1 {
  const v = typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 0;
  return v % 2 === 1 ? 1 : 0;
}

/**
 * A tile of Tegn's Escher tab as a heart keeps it (`HeartPattern`), or undefined
 * when it is not well formed. Only its form is checked here, so reading a heart
 * does not need the tiling: whether the type is one of ours and the cuts are
 * still the tile's is the Escher tab's to say ($lib/pattern/escherTab).
 */
function normalizePattern(raw: unknown): HeartPattern | undefined {
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
  if (r.offset !== undefined && !pair(r.offset)) return undefined;
  if (r.pan !== undefined && !pair(r.pan)) return undefined;
  if (lines !== undefined && !(lines && whole(lines.V) && whole(lines.H))) return undefined;
  return {
    rule: r.rule,
    cuts: r.cuts,
    curves,
    ...(r.offset ? { offset: [...(r.offset as [number, number])] as [number, number] } : {}),
    ...(r.pan ? { pan: [...(r.pan as [number, number])] as [number, number] } : {}),
    ...(lines ? { lines: { V: [...(lines.V as [number, number])] as [number, number], H: [...(lines.H as [number, number])] as [number, number] } } : {})
  };
}

/** A tile of the Escher tab from an SVG's `data-pattern`, or undefined. */
function patternFromAttribute(attr: string | null): HeartPattern | undefined {
  if (!attr) return undefined;
  try {
    return normalizePattern(JSON.parse(attr));
  } catch {
    return undefined;
  }
}

function normalizeAspectRatio(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0.01 && raw <= 100 ? raw : undefined;
}

function serializationRect(design: HeartDesign): OverlapRect {
  // Read the actual edited frame when an explicit shape is carried. Grid edits
  // may have changed it since import; strip counts are not physical dimensions.
  return design.overlapAspectRatio === undefined ? getOverlapRect(design.gridSize) : inferOverlapRectFromFingers(design.fingers, design.gridSize);
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

function ensureOuterBoundaries(fingers: Finger[], rect: { left: number; right: number; top: number; bottom: number }): Finger[] {
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
function normalizeDescriptions(raw: unknown): HeartDescriptions | undefined {
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
function normalizeNames(raw: unknown): HeartNames | undefined {
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
// SVG Serialization / Parsing
// ============================================================================

export function serializeHeartToSVG(design: HeartDesign): string {
  const rect = serializationRect(design);
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
  if (design.overlapAspectRatio !== undefined) attrs.push(`data-overlap-aspect-ratio="${rect.width / rect.height}"`);
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

/**
 * Detect lobe from path direction:
 * - Left lobe: horizontal paths (large x span)
 * - Right lobe: vertical paths (large y span)
 * Uses bounding box analysis if endpoints don't provide a clear direction.
 */
// Closed or zero-length subpaths (decorative shapes, a stray "M x y Z") can never be
// strip boundaries, which run from one edge of the overlap square to another.
function isDegeneratePath(segments: BezierSegment[]): boolean {
  if (!segments.length) return true;
  const start = segments[0].p0;
  const end = segments[segments.length - 1].p3;
  return vecDist(start, end) < 0.01;
}

function detectLobeFromSegments(segments: BezierSegment[]): LobeId | null {
  if (!segments.length) return null;

  const start = segments[0].p0;
  const end = segments[segments.length - 1].p3;

  const xSpan = Math.abs(end.x - start.x);
  const ySpan = Math.abs(end.y - start.y);

  // If endpoints give a clear direction, use that
  if (xSpan > ySpan + 1) return 'left';
  if (ySpan > xSpan + 1) return 'right';

  // Fallback: analyze bounding box of all points
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const seg of segments) {
    for (const p of [seg.p0, seg.p1, seg.p2, seg.p3]) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }

  const xExtent = maxX - minX;
  const yExtent = maxY - minY;

  // If the path spans more in X than Y, it's horizontal (left lobe)
  if (xExtent > yExtent + 1) return 'left';
  if (yExtent > xExtent + 1) return 'right';

  return null;
}

// ============================================================================
// SVG Transform Support
// ============================================================================

type TransformMatrix = [number, number, number, number, number, number]; // [a, b, c, d, e, f]

function identityMatrix(): TransformMatrix {
  return [1, 0, 0, 1, 0, 0];
}

function multiplyMatrices(m1: TransformMatrix, m2: TransformMatrix): TransformMatrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ];
}

function applyMatrixToPoint(m: TransformMatrix, p: Vec): Vec {
  const [a, b, c, d, e, f] = m;
  return {
    x: a * p.x + c * p.y + e,
    y: b * p.x + d * p.y + f
  };
}

function parseTransform(transform: string): TransformMatrix {
  let result = identityMatrix();

  // Match transform functions: name(args)
  const regex = /(\w+)\s*\(([^)]+)\)/g;
  let match;

  while ((match = regex.exec(transform)) !== null) {
    const [, name, argsStr] = match;
    const args = argsStr.split(/[\s,]+/).filter(Boolean).map(Number);

    let matrix: TransformMatrix;

    switch (name) {
      case 'matrix':
        if (args.length >= 6) {
          matrix = [args[0], args[1], args[2], args[3], args[4], args[5]];
        } else {
          continue;
        }
        break;

      case 'translate': {
        const tx = args[0] ?? 0;
        const ty = args[1] ?? 0;
        matrix = [1, 0, 0, 1, tx, ty];
        break;
      }

      case 'scale': {
        const sx = args[0] ?? 1;
        const sy = args[1] ?? sx;
        matrix = [sx, 0, 0, sy, 0, 0];
        break;
      }

      case 'rotate': {
        const angle = (args[0] ?? 0) * Math.PI / 180;
        const cx = args[1] ?? 0;
        const cy = args[2] ?? 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        // Rotate around (cx, cy): translate to origin, rotate, translate back
        if (cx !== 0 || cy !== 0) {
          matrix = multiplyMatrices(
            [1, 0, 0, 1, cx, cy],
            multiplyMatrices([cos, sin, -sin, cos, 0, 0], [1, 0, 0, 1, -cx, -cy])
          );
        } else {
          matrix = [cos, sin, -sin, cos, 0, 0];
        }
        break;
      }

      case 'skewX': {
        const angle = (args[0] ?? 0) * Math.PI / 180;
        matrix = [1, 0, Math.tan(angle), 1, 0, 0];
        break;
      }

      case 'skewY': {
        const angle = (args[0] ?? 0) * Math.PI / 180;
        matrix = [1, Math.tan(angle), 0, 1, 0, 0];
        break;
      }

      default:
        continue;
    }

    result = multiplyMatrices(result, matrix);
  }

  return result;
}

function getCumulativeTransform(element: Element, stopAt: Element): TransformMatrix {
  let matrix = identityMatrix();
  let current: Element | null = element;

  // Collect transforms from element up to (but not including) stopAt
  const transforms: TransformMatrix[] = [];
  while (current && current !== stopAt) {
    const transform = current.getAttribute('transform');
    if (transform) {
      transforms.push(parseTransform(transform));
    }
    current = current.parentElement;
  }

  // Apply transforms from root to element (reverse order)
  for (let i = transforms.length - 1; i >= 0; i--) {
    matrix = multiplyMatrices(matrix, transforms[i]);
  }

  return matrix;
}

function applyTransformToSegments(segments: BezierSegment[], matrix: TransformMatrix): BezierSegment[] {
  return segments.map(seg => ({
    p0: applyMatrixToPoint(matrix, seg.p0),
    p1: applyMatrixToPoint(matrix, seg.p1),
    p2: applyMatrixToPoint(matrix, seg.p2),
    p3: applyMatrixToPoint(matrix, seg.p3)
  }));
}

/**
 * Recursively resolve a <use> element to find all paths it references,
 * accumulating transforms along the way. Handles chains like use -> use -> use -> path.
 */
function resolveUseElement(
  useEl: Element,
  svg: SVGSVGElement,
  accumulatedTransform: TransformMatrix,
  visited: Set<string>
): Array<{ pathEl: SVGPathElement; useTransform: TransformMatrix }> {
  const results: Array<{ pathEl: SVGPathElement; useTransform: TransformMatrix }> = [];

  // Get the href (supports both xlink:href and href attributes)
  const href = useEl.getAttribute('xlink:href') || useEl.getAttribute('href');
  if (!href || !href.startsWith('#')) return results;

  const targetId = href.slice(1);

  // Prevent infinite loops from circular references
  if (visited.has(targetId)) return results;
  visited.add(targetId);

  const targetEl = svg.getElementById(targetId);
  if (!targetEl) return results;

  // Get the transform from this <use> element
  const useTransform = parseTransform(useEl.getAttribute('transform') || '');
  const combinedTransform = multiplyMatrices(accumulatedTransform, useTransform);

  const tagName = targetEl.tagName.toLowerCase();

  if (tagName === 'use') {
    // Recursively resolve the referenced <use> element
    return resolveUseElement(targetEl, svg, combinedTransform, visited);
  } else if (tagName === 'path') {
    // Found a path - add it with the accumulated transform
    results.push({ pathEl: targetEl as SVGPathElement, useTransform: combinedTransform });
  } else {
    // It's a group or other container - find all paths within
    const paths = Array.from(targetEl.querySelectorAll('path'));
    for (const pathEl of paths) {
      results.push({ pathEl, useTransform: combinedTransform });
    }

    // Also check for nested <use> elements within the group
    const nestedUses = Array.from(targetEl.querySelectorAll('use'));
    for (const nestedUse of nestedUses) {
      results.push(...resolveUseElement(nestedUse, svg, combinedTransform, visited));
    }
  }

  return results;
}

/**
 * Resolve all <use> elements in the SVG by finding referenced elements and collecting their paths
 * with the combined transform. Handles nested <use> chains.
 */
function resolveUseElements(svg: SVGSVGElement): Array<{ pathEl: SVGPathElement; useTransform: TransformMatrix }> {
  const results: Array<{ pathEl: SVGPathElement; useTransform: TransformMatrix }> = [];
  const useElements = Array.from(svg.querySelectorAll('use'));

  for (const useEl of useElements) {
    // Get the cumulative transform from <use> element's parents (but not the <use> itself)
    let parentTransform = identityMatrix();
    let parent: Element | null = useEl.parentElement;
    const transforms: TransformMatrix[] = [];
    while (parent && parent !== (svg as Element)) {
      const transform = parent.getAttribute('transform');
      if (transform) {
        transforms.push(parseTransform(transform));
      }
      parent = parent.parentElement;
    }
    // Apply transforms from root to element (reverse order)
    for (let i = transforms.length - 1; i >= 0; i--) {
      parentTransform = multiplyMatrices(parentTransform, transforms[i]);
    }

    const resolved = resolveUseElement(useEl, svg, parentTransform, new Set());
    results.push(...resolved);
  }

  return results;
}

// ============================================================================
// SVG import: from drawn paths to strip boundaries
// ============================================================================

/** What the SVG importer did with a drawing, for the editor's notice and the CLI. */
export interface SvgImportReport {
  /**
   * What the overlap square was taken from: the drawn outline (paths lying on the
   * bounding box of the cuts' endpoints, then dropped), the viewBox, or neither
   * (coordinates read as 0–100).
   */
  square: 'outline' | 'viewBox' | 'none';
  /** Sides of the drawn outline that were found and dropped (0–4). */
  droppedEdges: number;
  /** Subpaths joined end to end onto another piece of the same cut. */
  stitchedSubpaths: number;
  /** Cuts that still do not run from one side of the square to the other. */
  unjoined: string[];
  /** Paths with no clear direction (neither horizontal nor vertical), left out. */
  skipped: string[];
  /** Interior cuts per half after import (outer edges not counted). */
  cutsPerHalf: { left: number; right: number };
}

/** A drawn element in the editor's import coordinates. */
interface ImportPiece {
  name: string;
  subpaths: BezierSegment[][];
}

/** Path data for the elements the importer reads: <path>, <line> and <polyline>. */
function elementPathData(el: Element): string | null {
  const tag = el.localName.toLowerCase();
  if (tag === 'path') return el.getAttribute('d');
  if (tag === 'line') {
    const n = (attr: string) => Number(el.getAttribute(attr) ?? 0) || 0;
    return `M ${n('x1')} ${n('y1')} L ${n('x2')} ${n('y2')}`;
  }
  if (tag === 'polyline') {
    const nums = (el.getAttribute('points') ?? '').match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g)?.map(Number) ?? [];
    if (nums.length < 4) return null;
    let d = `M ${nums[0]} ${nums[1]}`;
    for (let i = 2; i + 1 < nums.length; i += 2) d += ` L ${nums[i]} ${nums[i + 1]}`;
    return d;
  }
  return null;
}

/** The name an author sees in Inkscape: the label, else the id, else "path 3". */
function elementName(el: Element, index: number): string {
  return (
    el.getAttribute('inkscape:label') ||
    el.getAttribute('id') ||
    `${el.localName.toLowerCase()} ${index + 1}`
  );
}

function parseViewBox(attr: string | null): { minX: number; minY: number; width: number; height: number } | null {
  const parts = (attr ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite) || parts[2]! <= 0 || parts[3]! <= 0) return null;
  return { minX: parts[0]!, minY: parts[1]!, width: parts[2]!, height: parts[3]! };
}

type Side = 'top' | 'bottom' | 'left' | 'right';
interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function segmentPoints(seg: BezierSegment): Vec[] {
  return [seg.p0, seg.p1, seg.p2, seg.p3];
}

/** The side of `box` that the whole (straight) segment lies on, within `tol`. */
function sideOfSegment(seg: BezierSegment, box: Box, tol: number): Side | null {
  const pts = segmentPoints(seg);
  if (pts.every((p) => Math.abs(p.y - box.minY) <= tol)) return 'top';
  if (pts.every((p) => Math.abs(p.y - box.maxY) <= tol)) return 'bottom';
  if (pts.every((p) => Math.abs(p.x - box.minX) <= tol)) return 'left';
  if (pts.every((p) => Math.abs(p.x - box.maxX) <= tol)) return 'right';
  return null;
}

/**
 * Find the overlap square's outline in a drawing: subpaths every segment of which
 * lies on a side of the bounding box of all the subpaths' endpoints (within 0.5 % of
 * its size). It only counts as an outline if the remaining cuts still touch all four
 * sides of that box — otherwise the outermost cuts of a drawing without an outline
 * would be mistaken for one. Returns the box (from the outline's own coordinates
 * where a side was drawn), the outline's subpaths and the number of sides found.
 */
function detectOutline(
  pieces: ImportPiece[]
): { box: Box; outline: Set<BezierSegment[]>; sides: number } | null {
  const ends: Vec[] = [];
  for (const piece of pieces) {
    for (const sub of piece.subpaths) {
      if (isDegeneratePath(sub)) continue;
      ends.push(sub[0]!.p0, sub[sub.length - 1]!.p3);
    }
  }
  if (!ends.length) return null;
  const bbox: Box = {
    minX: Math.min(...ends.map((p) => p.x)),
    minY: Math.min(...ends.map((p) => p.y)),
    maxX: Math.max(...ends.map((p) => p.x)),
    maxY: Math.max(...ends.map((p) => p.y))
  };
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  if (w <= 0 || h <= 0) return null;
  const tol = Math.max(w, h) * 0.005;

  const outline = new Set<BezierSegment[]>();
  const sidePoints: Record<Side, number[]> = { top: [], bottom: [], left: [], right: [] };
  for (const piece of pieces) {
    for (const sub of piece.subpaths) {
      const sides = sub.map((seg) => sideOfSegment(seg, bbox, tol));
      if (sides.some((s) => s === null)) continue;
      // A subpath along one side must cover a good part of it (not a stray tick).
      const covered = sub.reduce((sum, seg) => sum + vecDist(seg.p0, seg.p3), 0);
      if (covered < 0.25 * Math.min(w, h)) continue;
      outline.add(sub);
      sub.forEach((seg, i) => {
        const side = sides[i]!;
        for (const p of [seg.p0, seg.p3]) sidePoints[side].push(side === 'top' || side === 'bottom' ? p.y : p.x);
      });
    }
  }
  if (!outline.size) return null;

  // The rest must still reach all four sides of the box.
  const touched = new Set<Side>();
  for (const piece of pieces) {
    for (const sub of piece.subpaths) {
      if (outline.has(sub) || isDegeneratePath(sub)) continue;
      for (const p of [sub[0]!.p0, sub[sub.length - 1]!.p3]) {
        if (Math.abs(p.y - bbox.minY) <= tol) touched.add('top');
        if (Math.abs(p.y - bbox.maxY) <= tol) touched.add('bottom');
        if (Math.abs(p.x - bbox.minX) <= tol) touched.add('left');
        if (Math.abs(p.x - bbox.maxX) <= tol) touched.add('right');
      }
    }
  }
  if (touched.size < 4) return null;

  const mean = (xs: number[], fallback: number) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : fallback);
  const box: Box = {
    minX: mean(sidePoints.left, bbox.minX),
    maxX: mean(sidePoints.right, bbox.maxX),
    minY: mean(sidePoints.top, bbox.minY),
    maxY: mean(sidePoints.bottom, bbox.maxY)
  };
  const sides = (Object.keys(sidePoints) as Side[]).filter((s) => sidePoints[s].length).length;
  return { box, outline, sides };
}

/** Make a chain of segments continuous: each segment starts where the previous ended. */
function makeContinuous(segments: BezierSegment[]): BezierSegment[] {
  return segments.map((seg, i) => (i === 0 ? seg : { ...seg, p0: segments[i - 1]!.p3 }));
}

/**
 * Join subpaths whose endpoints touch (within `tolerance`) into continuous chains,
 * reversing a subpath where that makes it fit. Returns the chains and how many
 * subpaths were joined onto another.
 */
function stitchSubpaths(subpaths: BezierSegment[][], tolerance: number): { chains: BezierSegment[][]; joins: number } {
  const infos = subpaths.filter((s) => s.length > 0).map((segments) => ({ segments, used: false }));
  if (infos.length <= 1) return { chains: infos.map((i) => i.segments), joins: 0 };

  const chains: BezierSegment[][] = [];
  let joins = 0;
  while (infos.some((i) => !i.used)) {
    const first = infos.find((i) => !i.used)!;
    first.used = true;
    let chain: BezierSegment[] = [...first.segments];

    let extended = true;
    while (extended) {
      extended = false;
      const chainStart = chain[0]!.p0;
      const chainEnd = chain[chain.length - 1]!.p3;
      for (const info of infos) {
        if (info.used) continue;
        const start = info.segments[0]!.p0;
        const end = info.segments[info.segments.length - 1]!.p3;
        if (vecDist(chainEnd, start) < tolerance) chain = [...chain, ...info.segments];
        else if (vecDist(chainEnd, end) < tolerance) chain = [...chain, ...reverseSegments(info.segments)];
        else if (vecDist(chainStart, end) < tolerance) chain = [...info.segments, ...chain];
        else if (vecDist(chainStart, start) < tolerance) chain = [...reverseSegments(info.segments), ...chain];
        else continue;
        info.used = true;
        extended = true;
        joins++;
        break;
      }
    }
    chains.push(makeContinuous(chain));
  }
  return { chains, joins };
}

/** Whether a cut (in 0–100 coordinates) runs from one side of the square to the opposite one. */
function spansEdgeToEdge(segments: BezierSegment[], lobe: LobeId, tol = 5): boolean {
  const a = segments[0]!.p0;
  const b = segments[segments.length - 1]!.p3;
  const [u, v] = lobe === 'left' ? [a.x, b.x] : [a.y, b.y];
  return Math.min(u, v) <= tol && Math.max(u, v) >= 100 - tol;
}

/** Whether a point lies more than `tol` inside every side of the 0–100 square. */
function isInterior(p: Vec, tol = 5): boolean {
  return p.x > tol && p.x < 100 - tol && p.y > tol && p.y < 100 - tol;
}

export function parseHeartFromSVG(svgText: string, filename?: string): HeartDesign | null {
  return parseHeartFromSVGWithReport(svgText, filename).design;
}

/**
 * Read a heart from an SVG: a gallery file, an exported one, or a drawing from
 * Inkscape or another editor. Each <path>, <line> and <polyline> (and paths drawn
 * through <use>) is read with its transforms; its subpaths are joined end to end into
 * cuts; a drawn outline of the overlap square is recognised and dropped; and the
 * square — the outline, else the viewBox — is scaled to the editor's 0–100. Horizontal
 * cuts go to the left half, vertical ones to the right half. The report says what was
 * done, for the editor's import notice.
 */
export function parseHeartFromSVGWithReport(
  svgText: string,
  filename?: string
): { design: HeartDesign | null; report: SvgImportReport } {
  const emptyReport = (): SvgImportReport => ({
    square: 'none',
    droppedEdges: 0,
    stitchedSubpaths: 0,
    unjoined: [],
    skipped: [],
    cutsPerHalf: { left: 0, right: 0 }
  });
  // Parse SVG using DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');

  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    console.error('SVG parse error:', parseError.textContent);
    return { design: null, report: emptyReport() };
  }

  const svg = doc.querySelector('svg');
  if (!svg) return { design: null, report: emptyReport() };

  // Extract metadata - check both standard SVG elements and Dublin Core (Inkscape) format
  // A plain `<title>` is the heart's own name (`name`); the ones with an
  // `xml:lang` are its name per site language (`names`), as with `<desc>` below.
  const XML_NS = 'http://www.w3.org/XML/1998/namespace';
  const elLang = (el: Element): string =>
    el.getAttributeNS(XML_NS, 'lang') || el.getAttribute('xml:lang') || '';
  const titleEls = Array.from(svg.getElementsByTagName('title'));
  const titleEl = titleEls.find((el) => !elLang(el));
  const names = normalizeNames(
    Object.fromEntries(titleEls.filter((el) => elLang(el)).map((el) => [elLang(el), el.textContent]))
  );
  // A plain `<desc>` is the legacy one-line summary (`description`); the ones
  // with an `xml:lang` are the written paragraphs per site language
  // (`descriptions`), which a gallery SVG carries right after its `<title>`.
  const descEls = Array.from(svg.getElementsByTagName('desc'));
  const descLang = elLang;
  const descEl = descEls.find((el) => !descLang(el));
  const descriptions = normalizeDescriptions(
    Object.fromEntries(descEls.filter((el) => descLang(el)).map((el) => [descLang(el), el.textContent]))
  );

  // Dublin Core metadata (used by Inkscape) - need to use namespace-aware methods
  const DC_NS = 'http://purl.org/dc/elements/1.1/';
  const dcCreators = svg.getElementsByTagNameNS(DC_NS, 'creator');
  const dcPublishers = svg.getElementsByTagNameNS(DC_NS, 'publisher');

  const CC_NS = 'http://creativecommons.org/ns#';
  const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

  const workEls = svg.getElementsByTagNameNS(CC_NS, 'Work');
  let workEl: Element | undefined;
  for (let i = 0; i < workEls.length; i++) {
    const el = workEls[i];
    if (el.closest('metadata')) {
      workEl = el;
      break;
    }
  }
  workEl = workEl || workEls[0] || undefined;

  const isWithinAgent = (el: Element, root: Element | undefined): boolean => {
    let cur: Element | null = el.parentElement;
    while (cur && cur !== root) {
      if (cur.namespaceURI === CC_NS && cur.localName === 'Agent') return true;
      cur = cur.parentElement;
    }
    return false;
  };

  const getDcWorkField = (tagName: string): string | undefined => {
    if (!workEl) return undefined;
    const els = workEl.getElementsByTagNameNS(DC_NS, tagName);
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      if (isWithinAgent(el, workEl)) continue;
      const text = el.textContent?.trim();
      if (text) return text;
    }
    return undefined;
  };

  const dcTitle = getDcWorkField('title');
  const dcDesc = getDcWorkField('description');
  const dcSource = getDcWorkField('source');
  const dcDate = getDcWorkField('date');

  // Get DC creator (the author name is nested inside cc:Agent > dc:title)
  // Also extract author URL from cc:Agent rdf:about attribute
  let dcCreator: string | undefined;
  let dcCreatorUrl: string | undefined;
  if (dcCreators[0]) {
    // The creator element contains cc:Agent which contains dc:title with the name
    const agents = dcCreators[0].getElementsByTagNameNS(CC_NS, 'Agent');
    if (agents[0]) {
      // Get author URL from rdf:about attribute on cc:Agent
      dcCreatorUrl = agents[0].getAttributeNS(RDF_NS, 'about') || agents[0].getAttribute('rdf:about') || undefined;
      const creatorTitles = agents[0].getElementsByTagNameNS(DC_NS, 'title');
      dcCreator = creatorTitles[0]?.textContent?.trim();
    } else {
      // Fallback: look for dc:title directly in creator
      const creatorTitles = dcCreators[0].getElementsByTagNameNS(DC_NS, 'title');
      dcCreator = creatorTitles[0]?.textContent?.trim();
    }
  }

  // Get DC publisher (same structure as creator: dc:publisher > cc:Agent > dc:title)
  let dcPublisher: string | undefined;
  let dcPublisherUrl: string | undefined;
  let publisherEl: Element | undefined;
  for (let i = 0; i < dcPublishers.length; i++) {
    const el = dcPublishers[i];
    if (el.closest('metadata')) {
      publisherEl = el;
      break;
    }
  }
  publisherEl = publisherEl || dcPublishers[0] || undefined;
  if (publisherEl) {
    const agents = publisherEl.getElementsByTagNameNS(CC_NS, 'Agent');
    if (agents[0]) {
      dcPublisherUrl =
        agents[0].getAttributeNS(RDF_NS, 'about') ||
        agents[0].getAttribute('rdf:about') ||
        undefined;
      const publisherTitles = agents[0].getElementsByTagNameNS(DC_NS, 'title');
      dcPublisher = publisherTitles[0]?.textContent?.trim();
    } else {
      const publisherTitles = publisherEl.getElementsByTagNameNS(DC_NS, 'title');
      dcPublisher = publisherTitles[0]?.textContent?.trim();
    }
  }

  const name = titleEl?.textContent?.trim() || dcTitle || 'Untitled';
  const description = descEl?.textContent?.trim() || dcDesc || undefined;
  const author = svg.getAttribute('data-author') || dcCreator || '';
  const authorUrl = dcCreatorUrl || undefined;
  const publisher = svg.getAttribute('data-publisher') || dcPublisher || undefined;
  const publisherUrl = dcPublisherUrl || undefined;
  const source = svg.getAttribute('data-source') || dcSource || undefined;
  const date = svg.getAttribute('data-date') || dcDate || undefined;
  const weaveParity = normalizeWeaveParity(parseInt(svg.getAttribute('data-weave-parity') || '0', 10));
  const overlapAspectRatio = normalizeAspectRatio(Number(svg.getAttribute('data-overlap-aspect-ratio')));
  const pattern = patternFromAttribute(svg.getAttribute('data-pattern'));
  const colors = parseHeartColors({
    left: svg.getAttribute('data-color-left'),
    right: svg.getAttribute('data-color-right')
  });

  // Extract id from filename (remove .svg extension)
  const id = filename ? filename.replace(/\.svg$/i, '') : '';

  // Every drawn element, anywhere in the SVG (nested groups from Inkscape etc.), in
  // document coordinates: its own and its groups' transforms applied, arcs and the
  // other commands already turned into cubics, its subpaths kept apart.
  const rawPieces: ImportPiece[] = [];
  const drawnElements = Array.from(svg.querySelectorAll('path, line, polyline'));
  drawnElements.forEach((el, index) => {
    const pathData = elementPathData(el);
    if (!pathData) return;
    const transform = getCumulativeTransform(el, svg);
    rawPieces.push({
      name: elementName(el, index),
      subpaths: parsePathDataToSubpaths(pathData).map((sub) => applyTransformToSegments(sub, transform))
    });
  });
  // Paths drawn through <use> elements
  for (const { pathEl, useTransform } of resolveUseElements(svg as SVGSVGElement)) {
    const pathData = pathEl.getAttribute('d');
    if (!pathData) continue;
    // First the path's transform within its parent group, then the <use> element's
    const combinedTransform = multiplyMatrices(useTransform, getCumulativeTransform(pathEl, svg));
    rawPieces.push({
      name: elementName(pathEl, drawnElements.indexOf(pathEl)),
      subpaths: parsePathDataToSubpaths(pathData).map((sub) => applyTransformToSegments(sub, combinedTransform))
    });
  }

  // The overlap square: the drawn outline if there is one (dropped, it is not a cut),
  // else the viewBox, else the coordinates are already the editor's 0–100.
  const outline = detectOutline(rawPieces);
  const viewBox = parseViewBox(svg.getAttribute('viewBox'));
  const squareBox: Box | null = outline
    ? outline.box
    : viewBox
      ? { minX: viewBox.minX, minY: viewBox.minY, maxX: viewBox.minX + viewBox.width, maxY: viewBox.minY + viewBox.height }
      : null;
  const isIdentityBox = (b: Box) => b.minX === 0 && b.minY === 0 && b.maxX === 100 && b.maxY === 100;
  const toSquare: TransformMatrix =
    !squareBox || isIdentityBox(squareBox)
      ? identityMatrix()
      : (() => {
          const sx = 100 / (squareBox.maxX - squareBox.minX);
          const sy = 100 / (squareBox.maxY - squareBox.minY);
          return [sx, 0, 0, sy, -squareBox.minX * sx, -squareBox.minY * sy];
        })();
  const isIdentity = toSquare.every((v, i) => v === identityMatrix()[i]);

  const report: SvgImportReport = {
    square: outline ? 'outline' : viewBox ? 'viewBox' : 'none',
    droppedEdges: outline?.sides ?? 0,
    stitchedSubpaths: 0,
    unjoined: [],
    skipped: [],
    cutsPerHalf: { left: 0, right: 0 }
  };

  // Join each element's subpaths into cuts (Inkscape often splits one cut into
  // several pieces): ends that meet within 1 % of the square are joined.
  const STITCH_TOLERANCE = 1;
  interface Cut { name: string; segments: BezierSegment[] }
  const chains: Cut[] = [];
  for (const piece of rawPieces) {
    const subpaths = piece.subpaths
      .filter((sub) => !outline?.outline.has(sub))
      .map((sub) => (isIdentity ? sub : applyTransformToSegments(sub, toSquare)));
    const { chains: joined, joins } = stitchSubpaths(subpaths, STITCH_TOLERANCE);
    report.stitchedSubpaths += joins;
    joined.forEach((segments, i) => chains.push({ name: joined.length > 1 ? `${piece.name} #${i + 1}` : piece.name, segments }));
  }

  // A cut can also be split across elements. Join a chain that stops inside the
  // square to another one stopping at the same place.
  for (let i = 0; i < chains.length; i++) {
    const a = chains[i]!;
    if (isDegeneratePath(a.segments)) continue;
    for (let j = i + 1; j < chains.length; j++) {
      const b = chains[j]!;
      if (isDegeneratePath(b.segments)) continue;
      const aEnds = [a.segments[0]!.p0, a.segments[a.segments.length - 1]!.p3];
      const bEnds = [b.segments[0]!.p0, b.segments[b.segments.length - 1]!.p3];
      const meets = aEnds.some((p) => isInterior(p) && bEnds.some((q) => isInterior(q) && vecDist(p, q) < STITCH_TOLERANCE));
      if (!meets) continue;
      const { chains: joined } = stitchSubpaths([a.segments, b.segments], STITCH_TOLERANCE);
      if (joined.length !== 1) continue;
      a.segments = joined[0]!;
      chains.splice(j, 1);
      report.stitchedSubpaths++;
      j = i; // look again from the start: the longer chain may reach another piece
    }
  }

  let leftCuts: Cut[] = [];
  let rightCuts: Cut[] = [];
  const ambiguousCuts: Cut[] = [];
  for (const cut of chains) {
    // Closed or zero-length subpaths (decorative shapes) are never strip boundaries
    if (isDegeneratePath(cut.segments)) continue;
    // Horizontal cuts belong to the left half, vertical ones to the right half
    const lobe = detectLobeFromSegments(cut.segments);
    if (lobe === 'left') leftCuts.push(cut);
    else if (lobe === 'right') rightCuts.push(cut);
    // No clear direction on its own; it may be the tail of a path drawn as several elements
    else ambiguousCuts.push(cut);
  }

  // A strip boundary is sometimes drawn as several <path> elements laid end to end (Inkscape
  // can leave the last short segment of a line as its own element). Such a tail has no clear
  // direction on its own, so attach it to the classified path whose endpoint it touches.
  const attachTail = (tail: Cut, cuts: Cut[]): boolean => {
    for (const cut of cuts) {
      const { chains: joined } = stitchSubpaths([cut.segments, tail.segments], STITCH_TOLERANCE);
      if (joined.length === 1) {
        cut.segments = joined[0]!;
        report.stitchedSubpaths++;
        return true;
      }
    }
    return false;
  };

  for (const tail of ambiguousCuts) {
    if (attachTail(tail, leftCuts) || attachTail(tail, rightCuts)) continue;
    const start = tail.segments[0]!.p0;
    const end = tail.segments[tail.segments.length - 1]!.p3;
    report.skipped.push(tail.name);
    console.warn(
      `[parseHeartFromSVG: ${name}] Skipping ambiguous path ${tail.name} (neither horizontal nor vertical): ` +
      `start=(${start.x.toFixed(1)}, ${start.y.toFixed(1)}), end=(${end.x.toFixed(1)}, ${end.y.toFixed(1)})`
    );
  }

  // Normalize paths if they don't span 0-100 (e.g., SVGs exported with non-standard coordinate systems)
  // Find the actual span of path endpoints and normalize to 0-100
  const normalizePathsToFullSpan = (cuts: Cut[], lobe: LobeId): Cut[] => {
    if (cuts.length === 0) return cuts;

    // Collect all endpoint coordinates for the spanning dimension
    let minSpan = Infinity, maxSpan = -Infinity;
    for (const { segments } of cuts) {
      const start = segments[0]!.p0;
      const end = segments[segments.length - 1]!.p3;
      // For left lobe (horizontal), spanning dimension is X
      // For right lobe (vertical), spanning dimension is Y
      if (lobe === 'left') {
        minSpan = Math.min(minSpan, start.x, end.x);
        maxSpan = Math.max(maxSpan, start.x, end.x);
      } else {
        minSpan = Math.min(minSpan, start.y, end.y);
        maxSpan = Math.max(maxSpan, start.y, end.y);
      }
    }

    // Check if paths already span close to 0-100 (within tolerance)
    const EDGE_TOLERANCE = 5;
    const spansFullRange = minSpan < EDGE_TOLERANCE && maxSpan > 100 - EDGE_TOLERANCE;
    if (spansFullRange || minSpan === Infinity) return cuts;

    // Normalize paths to span 0-100
    const span = maxSpan - minSpan;
    if (span < 10) return cuts; // Too narrow, skip normalization

    const normalizeCoord = (coord: number) => ((coord - minSpan) / span) * 100;
    const normalizePoint = (p: Vec): Vec =>
      lobe === 'left' ? { x: normalizeCoord(p.x), y: p.y } : { x: p.x, y: normalizeCoord(p.y) };
    return cuts.map((cut) => ({
      name: cut.name,
      segments: cut.segments.map((seg) => ({
        p0: normalizePoint(seg.p0),
        p1: normalizePoint(seg.p1),
        p2: normalizePoint(seg.p2),
        p3: normalizePoint(seg.p3)
      }))
    }));
  };

  leftCuts = normalizePathsToFullSpan(leftCuts, 'left');
  rightCuts = normalizePathsToFullSpan(rightCuts, 'right');

  // Cuts that still stop short of a side: imported (their ends are moved to the
  // sides below, or dropped as a duplicate of another piece at the same place), but named in the report so the author can check them.
  for (const cut of leftCuts) if (!spansEdgeToEdge(cut.segments, 'left')) report.unjoined.push(cut.name);
  for (const cut of rightCuts) if (!spansEdgeToEdge(cut.segments, 'right')) report.unjoined.push(cut.name);

  // Deduplicate paths that are at the same position (within tolerance)
  const POSITION_TOLERANCE = 2; // Consider positions within 2 units as the same strip
  const deduplicatePaths = (cuts: Cut[], lobe: LobeId): Cut[] => {
    const seen: number[] = [];
    return cuts.filter(({ segments }) => {
      // Position is the non-spanning coordinate (Y for left lobe, X for right lobe)
      const position = lobe === 'left' ? segments[0]!.p0.y : segments[0]!.p0.x;
      if (seen.some(p => Math.abs(p - position) < POSITION_TOLERANCE)) return false;
      seen.push(position);
      return true;
    });
  };

  leftCuts = deduplicatePaths(leftCuts, 'left');
  rightCuts = deduplicatePaths(rightCuts, 'right');

  // Check if we found any valid paths
  if (leftCuts.length === 0 && rightCuts.length === 0) {
    console.error(
      `[parseHeartFromSVG: ${name}] No valid horizontal or vertical paths found. ` +
      `The SVG may contain complex paths that don't represent a woven heart pattern, ` +
      `or the paths may not span clearly in one direction.`
    );
    return { design: null, report };
  }

  if (leftCuts.length === 0) {
    console.warn(`[parseHeartFromSVG: ${name}] No horizontal paths (left lobe) found`);
  }
  if (rightCuts.length === 0) {
    console.warn(`[parseHeartFromSVG: ${name}] No vertical paths (right lobe) found`);
  }

  // Infer grid size from path counts (interior cuts = strips - 1)
  const gridSize: GridSize = {
    x: clampInt(rightCuts.length + 1, MIN_GRID_SIZE, MAX_GRID_SIZE),
    y: clampInt(leftCuts.length + 1, MIN_GRID_SIZE, MAX_GRID_SIZE)
  };

  // Convert paths to fingers
  const fingers: Finger[] = [];
  leftCuts.forEach((cut, i) => {
    fingers.push({ id: `L-tmp-${i}`, lobe: 'left', segments: transformSegmentsToPixels(cut.segments, gridSize, overlapAspectRatio) });
  });
  rightCuts.forEach((cut, i) => {
    fingers.push({ id: `R-tmp-${i}`, lobe: 'right', segments: transformSegmentsToPixels(cut.segments, gridSize, overlapAspectRatio) });
  });

  // Add outer boundaries and canonicalize
  const rect = inferOverlapRectFromFingers(fingers, gridSize);
  const canonicalizedFingers = fingers.map((f) => canonicalizeFingerForGrid(f, rect));
  const finalFingers = ensureOuterBoundaries(canonicalizedFingers, rect);

  // Recalculate grid size from final finger count
  const inferredGrid: GridSize = {
    x: clampInt(finalFingers.filter((f) => f.lobe === 'right').length - 1, MIN_GRID_SIZE, MAX_GRID_SIZE),
    y: clampInt(finalFingers.filter((f) => f.lobe === 'left').length - 1, MIN_GRID_SIZE, MAX_GRID_SIZE)
  };
  report.cutsPerHalf = {
    left: finalFingers.filter((f) => f.lobe === 'left').length - 2,
    right: finalFingers.filter((f) => f.lobe === 'right').length - 2
  };

  return {
    design: {
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
      fingers: finalFingers
    },
    report
  };
}
