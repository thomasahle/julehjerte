import type { Finger, GridSize, HeartDesign, HeartDesignJson, LobeId, NodeType, Vec } from '$lib/types/heart';
import { STRIP_WIDTH, BASE_CENTER } from '$lib/constants';
import { clamp, clampInt } from '$lib/utils/math';
import {
  type BezierSegment,
  parsePathDataToSegments,
  segmentsToPathData,
  cloneSegments,
  reverseSegments
} from '$lib/geometry/bezierSegments';
import {
  getCenteredRectParams,
  inferOverlapRect as inferOverlapRectFromFingers
} from '$lib/utils/overlapRect';
import { validateRawFingers } from '$lib/utils/validatePaths';
import { SITE_DOMAIN } from '$lib/config';
import { vecDist } from '$lib/geometry/vec';

type RawFinger = { id?: unknown; lobe?: unknown; pathData?: unknown; nodeTypes?: unknown };
type RawDesign = Omit<Partial<HeartDesignJson>, 'gridSize' | 'fingers'> & { gridSize?: unknown; fingers?: unknown };

// ============================================================================
// Coordinate Transform: JSON (0-100) ↔ Internal Pixels
// ============================================================================

interface OverlapRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function getOverlapRect(gridSize: GridSize): OverlapRect {
  const width = gridSize.x * STRIP_WIDTH;
  const height = gridSize.y * STRIP_WIDTH;
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
function transformSegmentsToPixels(segments: BezierSegment[], gridSize: GridSize): BezierSegment[] {
  const rect = getOverlapRect(gridSize);
  return segments.map((seg) => ({
    p0: { x: jsonToPixel(seg.p0.x, rect.left, rect.width), y: jsonToPixel(seg.p0.y, rect.top, rect.height) },
    p1: { x: jsonToPixel(seg.p1.x, rect.left, rect.width), y: jsonToPixel(seg.p1.y, rect.top, rect.height) },
    p2: { x: jsonToPixel(seg.p2.x, rect.left, rect.width), y: jsonToPixel(seg.p2.y, rect.top, rect.height) },
    p3: { x: jsonToPixel(seg.p3.x, rect.left, rect.width), y: jsonToPixel(seg.p3.y, rect.top, rect.height) }
  }));
}

/** Transform segments from internal pixel coordinates to JSON (0-100) coordinates */
function transformSegmentsToJson(segments: BezierSegment[], gridSize: GridSize): BezierSegment[] {
  const rect = getOverlapRect(gridSize);
  return segments.map((seg) => ({
    p0: { x: pixelToJson(seg.p0.x, rect.left, rect.width), y: pixelToJson(seg.p0.y, rect.top, rect.height) },
    p1: { x: pixelToJson(seg.p1.x, rect.left, rect.width), y: pixelToJson(seg.p1.y, rect.top, rect.height) },
    p2: { x: pixelToJson(seg.p2.x, rect.left, rect.width), y: pixelToJson(seg.p2.y, rect.top, rect.height) },
    p3: { x: pixelToJson(seg.p3.x, rect.left, rect.width), y: pixelToJson(seg.p3.y, rect.top, rect.height) }
  }));
}

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

function normalizeFinger(raw: unknown, gridSize: GridSize): Finger | null {
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
    const pixelSegments = transformSegmentsToPixels(jsonSegments, gridSize);
    const nodeTypes = normalizeNodeTypes((r as any).nodeTypes, pixelSegments.length);
    return {
      id,
      lobe,
      segments: pixelSegments,
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
  const authorUrl =
    typeof r.authorUrl === 'string' && r.authorUrl.trim() ? r.authorUrl.trim() : undefined;
  const publisher =
    typeof r.publisher === 'string' && r.publisher.trim() ? r.publisher.trim() : undefined;
  const publisherUrl =
    typeof r.publisherUrl === 'string' && r.publisherUrl.trim() ? r.publisherUrl.trim() : undefined;
  const source = typeof r.source === 'string' && r.source.trim() ? r.source.trim() : undefined;
  const date = typeof r.date === 'string' && r.date.trim() ? r.date.trim() : undefined;
  const description = typeof r.description === 'string' ? r.description : undefined;
  const weaveParity = normalizeWeaveParity((r as any).weaveParity);
  const gridSize = normalizeGridSize(r.gridSize);

  const fingersRaw = Array.isArray(r.fingers) ? r.fingers : [];

  // Validate raw JSON paths (0-100 coords) before transformation
  if (fingersRaw.length > 0) {
    validateRawFingers(id || 'unknown', fingersRaw, name);
  }

  let fingers = fingersRaw
    .map((f) => normalizeFinger(f, gridSize))
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
    authorUrl,
    publisher,
    publisherUrl,
    source,
    date,
    description,
    weaveParity,
    gridSize: inferredGrid,
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
    author: design.author,
    authorUrl: design.authorUrl,
    publisher: design.publisher,
    publisherUrl: design.publisherUrl,
    source: design.source,
    date: design.date,
    description: design.description,
    weaveParity: design.weaveParity ?? 0,
    gridSize: design.gridSize,
    fingers: interiorFingers.map((f) => {
      // Transform from internal pixel coords to JSON 0-100 coords
      const jsonSegments = transformSegmentsToJson(f.segments, design.gridSize);
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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function serializeHeartToSVG(design: HeartDesign): string {
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
    const jsonSegments = transformSegmentsToJson(f.segments, design.gridSize);
    return segmentsToPathData(jsonSegments);
  });
  const rightPaths = interiorRight.map((f) => {
    const jsonSegments = transformSegmentsToJson(f.segments, design.gridSize);
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

  const lines: string[] = [
    `<svg ${attrs.join(' ')}>`,
    `  <title>${escapeXml(design.name)}</title>`
  ];
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
 * Split a path string into subpaths at M/m commands
 */
function splitPathIntoSubpaths(pathData: string): string[] {
  // Match M/m commands and split, keeping track of current position for relative commands
  const commands = pathData.match(/[MmLlHhVvCcSsQqTtAaZz][^MmLlHhVvCcSsQqTtAaZz]*/g) || [];

  const subpaths: string[] = [];
  let currentSubpath = '';
  let currentX = 0;
  let currentY = 0;

  for (const cmd of commands) {
    const type = cmd[0];
    if (!type) continue;

    const isRelative = type === type.toLowerCase();
    const absType = type.toUpperCase();

    if (absType === 'M') {
      // Start a new subpath
      if (currentSubpath.trim()) {
        subpaths.push(currentSubpath.trim());
      }

      const args = cmd.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (isRelative) {
        currentX += args[0] ?? 0;
        currentY += args[1] ?? 0;
      } else {
        currentX = args[0] ?? 0;
        currentY = args[1] ?? 0;
      }
      // Always write absolute M for the new subpath
      currentSubpath = `M ${currentX} ${currentY}`;

      // Handle implicit lineto after M
      for (let i = 2; i < args.length; i += 2) {
        if (isRelative) {
          currentX += args[i] ?? 0;
          currentY += args[i + 1] ?? 0;
        } else {
          currentX = args[i] ?? 0;
          currentY = args[i + 1] ?? 0;
        }
        currentSubpath += ` L ${currentX} ${currentY}`;
      }
    } else {
      // Continue current subpath, converting relative to absolute
      if (isRelative) {
        // Convert relative command to absolute
        const args = cmd.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
        switch (absType) {
          case 'L':
            for (let i = 0; i < args.length; i += 2) {
              currentX += args[i] ?? 0;
              currentY += args[i + 1] ?? 0;
              currentSubpath += ` L ${currentX} ${currentY}`;
            }
            break;
          case 'H':
            for (const arg of args) {
              currentX += arg;
              currentSubpath += ` H ${currentX}`;
            }
            break;
          case 'V':
            for (const arg of args) {
              currentY += arg;
              currentSubpath += ` V ${currentY}`;
            }
            break;
          case 'C':
            for (let i = 0; i < args.length; i += 6) {
              const c1x = currentX + (args[i] ?? 0);
              const c1y = currentY + (args[i + 1] ?? 0);
              const c2x = currentX + (args[i + 2] ?? 0);
              const c2y = currentY + (args[i + 3] ?? 0);
              const endX = currentX + (args[i + 4] ?? 0);
              const endY = currentY + (args[i + 5] ?? 0);
              currentSubpath += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${endX} ${endY}`;
              currentX = endX;
              currentY = endY;
            }
            break;
          case 'A':
            // Arc: rx ry x-axis-rotation large-arc-flag sweep-flag x y
            for (let i = 0; i < args.length; i += 7) {
              const rx = args[i] ?? 0;
              const ry = args[i + 1] ?? 0;
              const rotation = args[i + 2] ?? 0;
              const largeArc = args[i + 3] ?? 0;
              const sweep = args[i + 4] ?? 0;
              const endX = currentX + (args[i + 5] ?? 0);
              const endY = currentY + (args[i + 6] ?? 0);
              currentSubpath += ` A ${rx} ${ry} ${rotation} ${largeArc} ${sweep} ${endX} ${endY}`;
              currentX = endX;
              currentY = endY;
            }
            break;
          default:
            // For other commands, just append as-is (may need expansion later)
            currentSubpath += ' ' + cmd;
        }
      } else {
        // Absolute command - just append and track position
        currentSubpath += ' ' + cmd;
        // Update current position based on command type
        const args = cmd.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
        switch (absType) {
          case 'L':
            if (args.length >= 2) {
              currentX = args[args.length - 2] ?? currentX;
              currentY = args[args.length - 1] ?? currentY;
            }
            break;
          case 'H':
            currentX = args[args.length - 1] ?? currentX;
            break;
          case 'V':
            currentY = args[args.length - 1] ?? currentY;
            break;
          case 'C':
            if (args.length >= 6) {
              currentX = args[args.length - 2] ?? currentX;
              currentY = args[args.length - 1] ?? currentY;
            }
            break;
          case 'A':
            // Arc: rx ry x-axis-rotation large-arc-flag sweep-flag x y
            if (args.length >= 7) {
              currentX = args[args.length - 2] ?? currentX;
              currentY = args[args.length - 1] ?? currentY;
            }
            break;
        }
      }
    }
  }

  if (currentSubpath.trim()) {
    subpaths.push(currentSubpath.trim());
  }

  return subpaths;
}

/**
 * Join subpaths whose endpoints touch (within tolerance) into continuous paths
 */
function joinSubpaths(subpaths: string[], tolerance: number = 1): string[] {
  if (subpaths.length <= 1) return subpaths;

  // Parse each subpath to get start/end points
  interface SubpathInfo {
    pathData: string;
    segments: BezierSegment[];
    start: Vec;
    end: Vec;
    used: boolean;
  }

  const infos: SubpathInfo[] = subpaths.map(p => {
    const segments = parsePathDataToSegments(p);
    return {
      pathData: p,
      segments,
      start: segments.length > 0 ? segments[0].p0 : { x: 0, y: 0 },
      end: segments.length > 0 ? segments[segments.length - 1].p3 : { x: 0, y: 0 },
      used: false
    };
  }).filter(info => info.segments.length > 0);

  const result: string[] = [];

  while (infos.some(i => !i.used)) {
    // Find first unused subpath
    const startIdx = infos.findIndex(i => !i.used);
    if (startIdx === -1) break;

    let chain: BezierSegment[] = [...infos[startIdx].segments];
    infos[startIdx].used = true;

    // Try to extend the chain in both directions
    let extended = true;
    while (extended) {
      extended = false;
      const chainStart = chain[0].p0;
      const chainEnd = chain[chain.length - 1].p3;

      for (const info of infos) {
        if (info.used) continue;

        // Check if this subpath connects to the end of our chain
        if (vecDist(chainEnd, info.start) < tolerance) {
          chain.push(...info.segments);
          info.used = true;
          extended = true;
          break;
        }
        if (vecDist(chainEnd, info.end) < tolerance) {
          chain.push(...reverseSegments(info.segments));
          info.used = true;
          extended = true;
          break;
        }
        // Check if this subpath connects to the start of our chain
        if (vecDist(chainStart, info.end) < tolerance) {
          chain = [...info.segments, ...chain];
          info.used = true;
          extended = true;
          break;
        }
        if (vecDist(chainStart, info.start) < tolerance) {
          chain = [...reverseSegments(info.segments), ...chain];
          info.used = true;
          extended = true;
          break;
        }
      }
    }

    result.push(segmentsToPathData(chain));
  }

  return result;
}

/**
 * Process a single path element's data: split at M commands and rejoin connected subpaths
 */
function processPathData(pathData: string): string[] {
  const subpaths = splitPathIntoSubpaths(pathData);
  return joinSubpaths(subpaths);
}

/**
 * Detect lobe from path direction:
 * - Left lobe: horizontal paths (large x span)
 * - Right lobe: vertical paths (large y span)
 * Uses bounding box analysis if endpoints don't provide a clear direction.
 */
function detectLobeFromPath(pathData: string): LobeId | null {
  const segments = parsePathDataToSegments(pathData);
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

export function parseHeartFromSVG(svgText: string, filename?: string): HeartDesign | null {
  // Parse SVG using DOMParser
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');

  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    console.error('SVG parse error:', parseError.textContent);
    return null;
  }

  const svg = doc.querySelector('svg');
  if (!svg) return null;

  // Extract metadata - check both standard SVG elements and Dublin Core (Inkscape) format
  const titleEl = svg.querySelector('title');
  const descEl = svg.querySelector('desc');

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

  // Extract id from filename (remove .svg extension)
  const id = filename ? filename.replace(/\.svg$/i, '') : '';

  // Get all paths from anywhere in the SVG (handles nested groups from Inkscape, etc.)
  let leftPathData: string[] = [];
  let rightPathData: string[] = [];
  const POSITION_TOLERANCE = 2; // Consider positions within 2 units as the same strip

  // Find all path elements regardless of grouping
  const allPaths = Array.from(svg.querySelectorAll('path'));

  // Also resolve <use> elements to get paths they reference
  const usePaths = resolveUseElements(svg as SVGSVGElement);
  for (const pathEl of allPaths) {
    const pathData = pathEl.getAttribute('d');
    if (!pathData) continue;

    // Get cumulative transform from all parent elements
    const transform = getCumulativeTransform(pathEl, svg);
    const hasTransform = transform[0] !== 1 || transform[1] !== 0 || transform[2] !== 0 ||
                         transform[3] !== 1 || transform[4] !== 0 || transform[5] !== 0;

    // Apply transform to get actual coordinates
    let transformedPathData = pathData;
    if (hasTransform) {
      const segments = parsePathDataToSegments(pathData);
      const transformedSegments = applyTransformToSegments(segments, transform);
      transformedPathData = segmentsToPathData(transformedSegments);
    }

    // Split and rejoin subpaths within this path element
    const joinedPaths = processPathData(transformedPathData);

    for (const joinedPath of joinedPaths) {
      const segments = parsePathDataToSegments(joinedPath);
      if (!segments.length) {
        console.warn(`[parseHeartFromSVG: ${name}] Skipping path with no segments: ${joinedPath.slice(0, 50)}...`);
        continue;
      }

      // Detect lobe based on whether path is more horizontal or vertical
      const lobe = detectLobeFromPath(joinedPath);
      if (lobe === 'left') {
        leftPathData.push(joinedPath);
      } else if (lobe === 'right') {
        rightPathData.push(joinedPath);
      } else {
        // Path doesn't have a clear horizontal or vertical direction
        const start = segments[0].p0;
        const end = segments[segments.length - 1].p3;
        console.warn(
          `[parseHeartFromSVG: ${name}] Skipping ambiguous path (neither horizontal nor vertical): ` +
          `start=(${start.x.toFixed(1)}, ${start.y.toFixed(1)}), end=(${end.x.toFixed(1)}, ${end.y.toFixed(1)}), ` +
          `path: ${joinedPath.slice(0, 80)}...`
        );
      }
    }
  }

  // Process paths from <use> elements
  for (const { pathEl, useTransform } of usePaths) {
    const pathData = pathEl.getAttribute('d');
    if (!pathData) continue;

    // Get the path's own transform within its parent group
    const pathTransform = getCumulativeTransform(pathEl, svg);

    // Combine: first apply the path's transform, then the <use> element's transform
    const combinedTransform = multiplyMatrices(useTransform, pathTransform);
    const hasTransform = combinedTransform[0] !== 1 || combinedTransform[1] !== 0 || combinedTransform[2] !== 0 ||
                         combinedTransform[3] !== 1 || combinedTransform[4] !== 0 || combinedTransform[5] !== 0;

    // Apply transform to get actual coordinates
    let transformedPathData = pathData;
    if (hasTransform) {
      const segments = parsePathDataToSegments(pathData);
      const transformedSegments = applyTransformToSegments(segments, combinedTransform);
      transformedPathData = segmentsToPathData(transformedSegments);
    }

    // Split and rejoin subpaths within this path element
    const joinedPaths = processPathData(transformedPathData);

    for (const joinedPath of joinedPaths) {
      const segments = parsePathDataToSegments(joinedPath);
      if (!segments.length) {
        console.warn(`[parseHeartFromSVG: ${name}] Skipping <use> path with no segments: ${joinedPath.slice(0, 50)}...`);
        continue;
      }

      // Detect lobe based on whether path is more horizontal or vertical
      const lobe = detectLobeFromPath(joinedPath);
      if (lobe === 'left') {
        leftPathData.push(joinedPath);
      } else if (lobe === 'right') {
        rightPathData.push(joinedPath);
      } else {
        // Path doesn't have a clear horizontal or vertical direction
        const start = segments[0].p0;
        const end = segments[segments.length - 1].p3;
        console.warn(
          `[parseHeartFromSVG: ${name}] Skipping ambiguous <use> path (neither horizontal nor vertical): ` +
          `start=(${start.x.toFixed(1)}, ${start.y.toFixed(1)}), end=(${end.x.toFixed(1)}, ${end.y.toFixed(1)}), ` +
          `path: ${joinedPath.slice(0, 80)}...`
        );
      }
    }
  }

  // Normalize paths if they don't span 0-100 (e.g., SVGs exported with non-standard coordinate systems)
  // Find the actual span of path endpoints and normalize to 0-100
  const normalizePathsToFullSpan = (paths: string[], lobe: LobeId): string[] => {
    if (paths.length === 0) return paths;

    // Collect all endpoint coordinates for the spanning dimension
    let minSpan = Infinity, maxSpan = -Infinity;
    for (const pathData of paths) {
      const segments = parsePathDataToSegments(pathData);
      if (!segments.length) continue;
      const start = segments[0].p0;
      const end = segments[segments.length - 1].p3;
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
    if (spansFullRange || minSpan === Infinity) return paths;

    // Normalize paths to span 0-100
    const span = maxSpan - minSpan;
    if (span < 10) return paths; // Too narrow, skip normalization

    return paths.map(pathData => {
      const segments = parsePathDataToSegments(pathData);
      const normalizedSegments = segments.map(seg => {
        const normalizeCoord = (coord: number) => ((coord - minSpan) / span) * 100;
        if (lobe === 'left') {
          // Normalize X coordinates, keep Y as-is
          return {
            p0: { x: normalizeCoord(seg.p0.x), y: seg.p0.y },
            p1: { x: normalizeCoord(seg.p1.x), y: seg.p1.y },
            p2: { x: normalizeCoord(seg.p2.x), y: seg.p2.y },
            p3: { x: normalizeCoord(seg.p3.x), y: seg.p3.y }
          };
        } else {
          // Normalize Y coordinates, keep X as-is
          return {
            p0: { x: seg.p0.x, y: normalizeCoord(seg.p0.y) },
            p1: { x: seg.p1.x, y: normalizeCoord(seg.p1.y) },
            p2: { x: seg.p2.x, y: normalizeCoord(seg.p2.y) },
            p3: { x: seg.p3.x, y: normalizeCoord(seg.p3.y) }
          };
        }
      });
      return segmentsToPathData(normalizedSegments);
    });
  };

  leftPathData = normalizePathsToFullSpan(leftPathData, 'left');
  rightPathData = normalizePathsToFullSpan(rightPathData, 'right');

  // Deduplicate paths that are at the same position (within tolerance)
  const deduplicatePaths = (paths: string[], lobe: LobeId): string[] => {
    const seen: number[] = [];
    return paths.filter(pathData => {
      const segments = parsePathDataToSegments(pathData);
      if (!segments.length) return false;
      // Position is the non-spanning coordinate (Y for left lobe, X for right lobe)
      const position = lobe === 'left' ? segments[0].p0.y : segments[0].p0.x;
      if (seen.some(p => Math.abs(p - position) < POSITION_TOLERANCE)) return false;
      seen.push(position);
      return true;
    });
  };

  leftPathData = deduplicatePaths(leftPathData, 'left');
  rightPathData = deduplicatePaths(rightPathData, 'right');

  // Check if we found any valid paths
  if (leftPathData.length === 0 && rightPathData.length === 0) {
    console.error(
      `[parseHeartFromSVG: ${name}] No valid horizontal or vertical paths found. ` +
      `The SVG may contain complex paths that don't represent a woven heart pattern, ` +
      `or the paths may not span clearly in one direction.`
    );
    return null;
  }

  if (leftPathData.length === 0) {
    console.warn(`[parseHeartFromSVG: ${name}] No horizontal paths (left lobe) found`);
  }
  if (rightPathData.length === 0) {
    console.warn(`[parseHeartFromSVG: ${name}] No vertical paths (right lobe) found`);
  }

  // Infer grid size from path counts (interior cuts = strips - 1)
  const gridSize: GridSize = {
    x: clampInt(rightPathData.length + 1, 2, 8),
    y: clampInt(leftPathData.length + 1, 2, 8)
  };

  // Convert paths to fingers
  const fingers: Finger[] = [];

  for (let i = 0; i < leftPathData.length; i++) {
    const jsonSegments = parsePathDataToSegments(leftPathData[i]);
    if (!jsonSegments.length) continue;

    const pixelSegments = transformSegmentsToPixels(jsonSegments, gridSize);
    fingers.push({
      id: `L-tmp-${i}`,
      lobe: 'left',
      segments: pixelSegments
    });
  }

  for (let i = 0; i < rightPathData.length; i++) {
    const jsonSegments = parsePathDataToSegments(rightPathData[i]);
    if (!jsonSegments.length) continue;

    const pixelSegments = transformSegmentsToPixels(jsonSegments, gridSize);
    fingers.push({
      id: `R-tmp-${i}`,
      lobe: 'right',
      segments: pixelSegments
    });
  }

  // Add outer boundaries and canonicalize
  const rect = inferOverlapRectFromFingers(fingers, gridSize);
  const canonicalizedFingers = fingers.map((f) => canonicalizeFingerForGrid(f, rect));
  const finalFingers = ensureOuterBoundaries(canonicalizedFingers, rect);

  // Recalculate grid size from final finger count
  const inferredGrid: GridSize = {
    x: clampInt(finalFingers.filter((f) => f.lobe === 'right').length - 1, 2, 8),
    y: clampInt(finalFingers.filter((f) => f.lobe === 'left').length - 1, 2, 8)
  };

  return {
    id,
    name,
    author,
    authorUrl,
    publisher,
    publisherUrl,
    source,
    date,
    description,
    weaveParity,
    gridSize: inferredGrid,
    fingers: finalFingers
  };
}
