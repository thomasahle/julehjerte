import type { LobeId, Vec } from '$lib/types/heart';
import type { BezierSegment } from '$lib/geometry/bezierSegments';
import { parsePathDataToSegments } from '$lib/geometry/bezierSegments';

interface ValidationResult {
  valid: boolean;
  warnings: string[];
}

// JSON format uses normalized 0-100 coordinates for the overlap area
const JSON_BOUNDS = {
  left: 0,
  right: 100,
  top: 0,
  bottom: 100
};

/**
 * Check if all coordinates in segments are within 0-100 bounds
 */
function checkBounds(segments: BezierSegment[], tolerance: number = 1): string[] {
  const warnings: string[] = [];
  const bounds = {
    left: JSON_BOUNDS.left - tolerance,
    right: JSON_BOUNDS.right + tolerance,
    top: JSON_BOUNDS.top - tolerance,
    bottom: JSON_BOUNDS.bottom + tolerance
  };

  const checkPoint = (point: Vec, segIdx: number, pointName: string) => {
    if (
      point.x < bounds.left ||
      point.x > bounds.right ||
      point.y < bounds.top ||
      point.y > bounds.bottom
    ) {
      warnings.push(
        `Segment ${segIdx} ${pointName} (${point.x.toFixed(1)}, ${point.y.toFixed(1)}) outside bounds [0-100]`
      );
    }
  };

  segments.forEach((seg, idx) => {
    checkPoint(seg.p0, idx, 'p0');
    checkPoint(seg.p1, idx, 'p1');
    checkPoint(seg.p2, idx, 'p2');
    checkPoint(seg.p3, idx, 'p3');
  });

  return warnings;
}

/**
 * Check that segments connect properly (p3 of one matches p0 of next)
 */
function checkContinuity(segments: BezierSegment[], tolerance: number = 0.1): string[] {
  const warnings: string[] = [];

  for (let i = 0; i < segments.length - 1; i++) {
    const current = segments[i];
    const next = segments[i + 1];
    const dist = Math.hypot(current.p3.x - next.p0.x, current.p3.y - next.p0.y);
    if (dist > tolerance) {
      warnings.push(
        `Gap between segment ${i} end (${current.p3.x.toFixed(1)}, ${current.p3.y.toFixed(1)}) and segment ${i + 1} start (${next.p0.x.toFixed(1)}, ${next.p0.y.toFixed(1)}): ${dist.toFixed(2)}`
      );
    }
  }

  return warnings;
}

/**
 * Check that finger endpoints align with expected grid edges (0 or 100)
 * Note: Some designs intentionally have fingers that don't span edge-to-edge
 * (e.g., kogle with bump patterns, juletrae with custom shapes)
 * So this check is informational only - not a hard requirement
 */
function checkEndpointAlignment(
  segments: BezierSegment[],
  lobe: LobeId,
  _tolerance: number = 1
): string[] {
  // Skip endpoint alignment checks - many valid designs don't span edge-to-edge
  // The bounds check already ensures coordinates are within 0-100
  return [];
}

/**
 * Sample points along a bezier segment
 */
function sampleBezier(seg: BezierSegment, numSamples: number = 10): Vec[] {
  const points: Vec[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    points.push({
      x: mt3 * seg.p0.x + 3 * mt2 * t * seg.p1.x + 3 * mt * t2 * seg.p2.x + t3 * seg.p3.x,
      y: mt3 * seg.p0.y + 3 * mt2 * t * seg.p1.y + 3 * mt * t2 * seg.p2.y + t3 * seg.p3.y
    });
  }
  return points;
}

/**
 * Check if two line segments intersect
 */
function lineSegmentsIntersect(p1: Vec, p2: Vec, p3: Vec, p4: Vec): boolean {
  const d1 = (p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x);
  const d2 = (p4.x - p3.x) * (p2.y - p3.y) - (p4.y - p3.y) * (p2.x - p3.x);
  const d3 = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  const d4 = (p2.x - p1.x) * (p4.y - p1.y) - (p2.y - p1.y) * (p4.x - p1.x);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

/**
 * Check for self-intersections within a finger's path
 */
function checkSelfIntersection(segments: BezierSegment[], samplesPerSegment: number = 10): string[] {
  const warnings: string[] = [];

  // Sample all segments into polylines
  const allPoints: { segIdx: number; pointIdx: number; point: Vec }[] = [];
  segments.forEach((seg, segIdx) => {
    const samples = sampleBezier(seg, samplesPerSegment);
    samples.forEach((point, pointIdx) => {
      allPoints.push({ segIdx, pointIdx, point });
    });
  });

  // Long repeated patterns contain thousands of samples. Compare only lines
  // whose bounding boxes overlap, retaining the same exact crossing predicate
  // and first warning for each original sample as the former pairwise scan.
  const lines = allPoints.slice(0, -1).map((p, index) => {
    const q = allPoints[index + 1];
    return {
      index, a: p.point, b: q.point,
      minX: Math.min(p.point.x, q.point.x), maxX: Math.max(p.point.x, q.point.x),
      minY: Math.min(p.point.y, q.point.y), maxY: Math.max(p.point.y, q.point.y)
    };
  }).sort((a, b) => a.minX - b.minX);
  const first = new Map<number, number>();
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i];
    for (let j = i + 1; j < lines.length; j++) {
      const b = lines[j];
      if (b.minX > a.maxX) break;
      if (b.minY > a.maxY || a.minY > b.maxY) continue;
      const from = Math.min(a.index, b.index), to = Math.max(a.index, b.index);
      if (to - from < 3 || to >= (first.get(from) ?? Infinity)) continue;
      if (lineSegmentsIntersect(a.a, a.b, b.a, b.b)) first.set(from, to);
    }
  }
  for (const [i, j] of [...first].sort(([a], [b]) => a - b))
    warnings.push(`Self-intersection detected between segment ${allPoints[i].segIdx} and segment ${allPoints[j].segIdx}`);

  // Deduplicate warnings
  return [...new Set(warnings)];
}

/**
 * Validate a single finger's raw path data (in JSON 0-100 format)
 */
function validateFingerPathData(
  pathData: string,
  lobe: LobeId,
  _fingerId: string
): ValidationResult {
  const warnings: string[] = [];

  const segments = parsePathDataToSegments(pathData);
  if (segments.length === 0) {
    return { valid: false, warnings: ['No valid segments parsed from pathData'] };
  }

  // Run all checks
  warnings.push(...checkBounds(segments));
  warnings.push(...checkContinuity(segments));
  warnings.push(...checkEndpointAlignment(segments, lobe));
  warnings.push(...checkSelfIntersection(segments));

  return {
    valid: warnings.length === 0,
    warnings
  };
}

/**
 * Validate raw finger data from JSON (before coordinate transformation)
 */
export function validateRawFingers(
  heartId: string,
  rawFingers: Array<{ lobe?: unknown; pathData?: unknown; id?: unknown }>,
  heartName?: string
): void {
  let hasWarnings = false;

  for (let i = 0; i < rawFingers.length; i++) {
    const raw = rawFingers[i];
    const lobe = raw.lobe === 'left' || raw.lobe === 'right' ? raw.lobe : null;
    const pathData = typeof raw.pathData === 'string' ? raw.pathData : null;
    const id = typeof raw.id === 'string' ? raw.id : `finger-${i}`;

    if (!lobe || !pathData) continue;

    const result = validateFingerPathData(pathData, lobe, id);
    if (!result.valid) {
      hasWarnings = true;
      const heartLabel = heartName ? `${heartName} (${heartId})` : heartId;
      for (const warning of result.warnings) {
        console.warn(`[Heart: ${heartLabel}] Finger ${id}: ${warning}`);
      }
    }
  }

  if (hasWarnings) {
    const heartLabel = heartName ? `${heartName} (${heartId})` : heartId;
    console.warn(`[Heart: ${heartLabel}] JSON coordinates should be in 0-100 range (overlap area)`);
  }
}
