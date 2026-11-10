/**
 * Reading a heart from an SVG file (`parseHeartFromSVGWithReport`): its
 * metadata, and its drawn paths turned into the strip boundaries of a heart.
 * Writing one is `serializeHeartToSVG` in $lib/utils/heartDesign, whose
 * normalisers this shares with reading a heart's JSON.
 */
import type { Finger, GridSize, HeartDesign, HeartPattern, LobeId, Vec } from '$lib/types/heart';
import { MIN_GRID_SIZE, MAX_GRID_SIZE } from '$lib/constants';
import { clampInt } from '$lib/utils/math';
import { type BezierSegment, parsePathDataToSubpaths, reverseSegments } from '$lib/geometry/bezierSegments';
import { inferOverlapRect as inferOverlapRectFromFingers } from '$lib/utils/overlapRect';
import { parseHeartColors } from '$lib/utils/heartColors';
import { vecDist } from '$lib/geometry/vec';
import {
  canonicalizeFingerForGrid,
  ensureOuterBoundaries,
  normalizeAspectRatio,
  normalizeDescriptions,
  normalizeNames,
  normalizePattern,
  normalizeWeaveParity,
  transformSegmentsToPixels
} from '$lib/utils/heartDesign';

/** A tile of the Escher tab from an SVG's `data-pattern`, or undefined. */
function patternFromAttribute(attr: string | null): HeartPattern | undefined {
  if (!attr) return undefined;
  try {
    return normalizePattern(JSON.parse(attr));
  } catch {
    return undefined;
  }
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

  // A path drawn twice is one cut. Pieces of one strip that were not joined
  // into a whole cut count once per position (within 2 units); whole cuts all
  // stay, since dense generated patterns can have distinct cuts less than two
  // normalized units apart at the paper edge.
  const POSITION_TOLERANCE = 2;
  const deduplicatePaths = (cuts: Cut[], lobe: LobeId): Cut[] => {
    const kept: BezierSegment[][] = [];
    const matches = (a: BezierSegment[], b: BezierSegment[]) =>
      a.length === b.length && a.every((segment, i) =>
        (['p0', 'p1', 'p2', 'p3'] as const).every(key =>
          Math.hypot(segment[key].x - b[i]![key].x, segment[key].y - b[i]![key].y) < 1e-6
        )
      );
    // Position is the non-spanning coordinate (Y for left lobe, X for right lobe)
    const position = (segments: BezierSegment[]) => lobe === 'left' ? segments[0]!.p0.y : segments[0]!.p0.x;
    return cuts.filter(({ segments }) => {
      if (!segments.length) return false;
      if (kept.some(prior => matches(prior, segments) || matches(reverseSegments(prior), segments))) return false;
      if (!spansEdgeToEdge(segments, lobe) &&
        kept.some(prior => Math.abs(position(prior) - position(segments)) < POSITION_TOLERANCE)) return false;
      kept.push(segments);
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
