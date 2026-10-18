import type { Finger, FingerPathData, Vec, BezierSegment } from '$lib/types/heart';
import { vecLerp } from '$lib/geometry/vec';

export type { BezierSegment };

export function cloneSegments(segments: BezierSegment[]): BezierSegment[] {
  return segments.map((seg) => ({
    p0: { ...seg.p0 },
    p1: { ...seg.p1 },
    p2: { ...seg.p2 },
    p3: { ...seg.p3 }
  }));
}

export function reverseSegments(segments: BezierSegment[]): BezierSegment[] {
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

export function fingerToSegments(finger: Finger): BezierSegment[] {
  return finger.segments;
}

export function fingerToPathData(finger: Finger): string {
  return segmentsToPathData(finger.segments);
}

export function fingerFromPathData(finger: FingerPathData): Finger {
  const segments = parsePathDataToSegments(finger.pathData);
  return { id: finger.id, lobe: finger.lobe, segments, nodeTypes: finger.nodeTypes };
}

export function segmentsToPathData(segments: BezierSegment[]): string {
  if (segments.length === 0) return '';
  const parts = new Array<string>(segments.length + 1);
  parts[0] = `M ${segments[0]!.p0.x} ${segments[0]!.p0.y}`;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    parts[i + 1] = ` C ${seg.p1.x} ${seg.p1.y} ${seg.p2.x} ${seg.p2.y} ${seg.p3.x} ${seg.p3.y}`;
  }
  return parts.join('');
}

// Convert a line to a cubic bezier (control points at 1/3 and 2/3)
function lineToCubic(start: Vec, end: Vec): BezierSegment {
  return {
    p0: start,
    p1: { x: start.x + (end.x - start.x) / 3, y: start.y + (end.y - start.y) / 3 },
    p2: { x: start.x + ((end.x - start.x) * 2) / 3, y: start.y + ((end.y - start.y) * 2) / 3 },
    p3: end
  };
}

// Convert quadratic bezier to cubic using degree elevation
// c1 = p0 + 2/3 * (control - p0)
// c2 = end + 2/3 * (control - end)
function quadraticToCubic(start: Vec, control: Vec, end: Vec): BezierSegment {
  return {
    p0: start,
    p1: { x: start.x + (2 / 3) * (control.x - start.x), y: start.y + (2 / 3) * (control.y - start.y) },
    p2: { x: end.x + (2 / 3) * (control.x - end.x), y: end.y + (2 / 3) * (control.y - end.y) },
    p3: end
  };
}

// Convert arc to cubic bezier segments
// Based on the SVG arc implementation algorithm
export function arcToCubic(
  start: Vec,
  rx: number,
  ry: number,
  xAxisRotationDeg: number,
  largeArcFlag: boolean,
  sweepFlag: boolean,
  end: Vec
): BezierSegment[] {
  // Handle degenerate cases
  if (rx === 0 || ry === 0) {
    return [lineToCubic(start, end)];
  }

  // Same point - no arc needed
  if (start.x === end.x && start.y === end.y) {
    return [];
  }

  rx = Math.abs(rx);
  ry = Math.abs(ry);

  const xAxisRotation = (xAxisRotationDeg * Math.PI) / 180;
  const cosAngle = Math.cos(xAxisRotation);
  const sinAngle = Math.sin(xAxisRotation);

  // Step 1: Compute (x1', y1') - transform to unit circle space
  const dx = (start.x - end.x) / 2;
  const dy = (start.y - end.y) / 2;
  const x1p = cosAngle * dx + sinAngle * dy;
  const y1p = -sinAngle * dx + cosAngle * dy;

  // Step 2: Correct radii if necessary
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx = sqrtLambda * rx;
    ry = sqrtLambda * ry;
  }

  // Step 3: Compute center point in transformed space
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const x1p2 = x1p * x1p;
  const y1p2 = y1p * y1p;

  let sq = (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2);
  sq = sq < 0 ? 0 : sq;
  const coef = (largeArcFlag === sweepFlag ? -1 : 1) * Math.sqrt(sq);
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);

  // Step 4: Compute center point in original space
  const cx = cosAngle * cxp - sinAngle * cyp + (start.x + end.x) / 2;
  const cy = sinAngle * cxp + cosAngle * cyp + (start.y + end.y) / 2;

  // Step 5: Compute start angle and delta angle
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  // Angle between two vectors
  function angleBetween(ux: number, uy: number, vx: number, vy: number): number {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let angle = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) angle = -angle;
    return angle;
  }

  const theta1 = angleBetween(1, 0, ux, uy);
  let dTheta = angleBetween(ux, uy, vx, vy);

  if (!sweepFlag && dTheta > 0) {
    dTheta -= 2 * Math.PI;
  } else if (sweepFlag && dTheta < 0) {
    dTheta += 2 * Math.PI;
  }

  // Step 6: Split arc into segments of at most 90 degrees
  const segments: BezierSegment[] = [];
  const numSegments = Math.ceil(Math.abs(dTheta) / (Math.PI / 2));
  const deltaPerSegment = dTheta / numSegments;

  // Control-point distance along the tangent for a cubic approximating an arc of
  // angle d, per unit of the tangent's length (L. Maisonobe, "Drawing an elliptical
  // arc using polylines, quadratic or cubic Bézier curves", 2003):
  //   alpha = sin(d) * (sqrt(4 + 3 tan²(d/2)) - 1) / 3,  (√7 - 1)/3 ≈ 0.5486 for 90°.
  // (The circle-midpoint choice 4/3 tan(d/4) ≈ 0.5523 would move the gallery's
  // arcs by up to 0.013 px; this one is what their committed data was built with.)
  const alpha = Math.sin(deltaPerSegment) * (Math.sqrt(4 + 3 * Math.tan(deltaPerSegment / 2) ** 2) - 1) / 3;

  let currentAngle = theta1;
  let currentPoint = start;

  for (let i = 0; i < numSegments; i++) {
    const nextAngle = currentAngle + deltaPerSegment;

    const cosStart = Math.cos(currentAngle);
    const sinStart = Math.sin(currentAngle);
    const cosEnd = Math.cos(nextAngle);
    const sinEnd = Math.sin(nextAngle);

    // Points on the (rotated) ellipse: centre + R(phi) * (rx cos t, ry sin t)
    const p1x = cx + rx * cosAngle * cosStart - ry * sinAngle * sinStart;
    const p1y = cy + rx * sinAngle * cosStart + ry * cosAngle * sinStart;
    const p4x = cx + rx * cosAngle * cosEnd - ry * sinAngle * sinEnd;
    const p4y = cy + rx * sinAngle * cosEnd + ry * cosAngle * sinEnd;

    // Tangent vectors
    const t1x = -rx * cosAngle * sinStart - ry * sinAngle * cosStart;
    const t1y = -rx * sinAngle * sinStart + ry * cosAngle * cosStart;
    const t2x = -rx * cosAngle * sinEnd - ry * sinAngle * cosEnd;
    const t2y = -rx * sinAngle * sinEnd + ry * cosAngle * cosEnd;

    // Control points
    const p2x = p1x + alpha * t1x;
    const p2y = p1y + alpha * t1y;
    const p3x = p4x - alpha * t2x;
    const p3y = p4y - alpha * t2y;

    segments.push({
      p0: currentPoint,
      p1: { x: p2x, y: p2y },
      p2: { x: p3x, y: p3y },
      p3: { x: p4x, y: p4y }
    });

    currentAngle = nextAngle;
    currentPoint = { x: p4x, y: p4y };
  }

  // Ensure the last point matches the end point exactly
  if (segments.length > 0) {
    segments[segments.length - 1].p3 = end;
  }

  return segments;
}

const ARG_COUNTS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUMBER_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/**
 * Split SVG path data into commands with their numeric arguments, the way the SVG
 * grammar reads them: numbers may run together (`1.5.5`, `10-20`, `1e-5`), commas and
 * whitespace are optional separators, and an arc's two flags may be written as single
 * digits with nothing between them (`a 5 5 0 01 10 0`). Parsing stops at the first
 * token that is not part of the grammar, keeping what came before (as browsers do).
 */
export function tokenizePathData(pathData: string): Array<{ type: string; args: number[] }> {
  const out: Array<{ type: string; args: number[] }> = [];
  const s = pathData;
  let i = 0;
  const skipSeparators = () => {
    while (i < s.length && /[\s,]/.test(s[i]!)) i++;
  };
  let current: { type: string; args: number[] } | null = null;
  while (true) {
    skipSeparators();
    if (i >= s.length) break;
    const ch = s[i]!;
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) {
      current = { type: ch, args: [] };
      out.push(current);
      i++;
      continue;
    }
    if (!current) break;
    const absType = current.type.toUpperCase();
    const perGroup = ARG_COUNTS[absType] ?? 0;
    if (perGroup === 0) break;
    const position = current.args.length % perGroup;
    if (absType === 'A' && (position === 3 || position === 4)) {
      if (ch !== '0' && ch !== '1') break;
      current.args.push(ch === '1' ? 1 : 0);
      i++;
      continue;
    }
    NUMBER_RE.lastIndex = i;
    const m = NUMBER_RE.exec(s);
    if (!m) break;
    current.args.push(Number(m[0]));
    i += m[0].length;
  }
  return out;
}

/**
 * Parse SVG path data into its subpaths, each a list of cubic Bézier segments in
 * absolute coordinates. Every command of the SVG path grammar is read, absolute and
 * relative: M/L/H/V become straight cubics, Q/T are degree-elevated, S/T reflect the
 * previous control point, A is converted to cubics (at most 90° each), and Z closes
 * the subpath with a straight segment when it is not already closed. A subpath with
 * no drawing command (a bare `M x y`) is left out.
 */
export function parsePathDataToSubpaths(pathData: string): BezierSegment[][] {
  const subpaths: BezierSegment[][] = [];
  let segments: BezierSegment[] = [];
  const startSubpath = () => {
    if (segments.length) subpaths.push(segments);
    segments = [];
  };

  let currentX = 0;
  let currentY = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;
  // For S/T smooth commands - previous control point
  let lastControlX = 0;
  let lastControlY = 0;
  let lastCommandType: string | null = null;
  // After Z the next drawing command (without an M) starts a new subpath at the start point.
  let closed = false;

  for (const { type, args } of tokenizePathData(pathData)) {
    const isRelative = type === type.toLowerCase();
    const absType = type.toUpperCase();
    const toAbsX = (x: number) => (isRelative ? currentX + x : x);
    const toAbsY = (y: number) => (isRelative ? currentY + y : y);
    const n = ARG_COUNTS[absType] ?? 0;
    // Only whole argument groups count; a trailing partial group is ignored.
    const groups = n ? Math.floor(args.length / n) : 1;
    if (absType !== 'M' && absType !== 'Z' && closed) {
      startSubpath();
      closed = false;
    }

    for (let g = 0; g < groups; g++) {
      const a = (k: number) => args[g * n + k] ?? 0;
      switch (absType) {
        case 'M': {
          if (g === 0) {
            startSubpath();
            closed = false;
            currentX = toAbsX(a(0));
            currentY = toAbsY(a(1));
            subpathStartX = currentX;
            subpathStartY = currentY;
          } else {
            // Implicit lineto after the first pair (per SVG spec)
            const endX = toAbsX(a(0));
            const endY = toAbsY(a(1));
            segments.push(lineToCubic({ x: currentX, y: currentY }, { x: endX, y: endY }));
            currentX = endX;
            currentY = endY;
          }
          break;
        }
        case 'L': {
          const endX = toAbsX(a(0));
          const endY = toAbsY(a(1));
          segments.push(lineToCubic({ x: currentX, y: currentY }, { x: endX, y: endY }));
          currentX = endX;
          currentY = endY;
          break;
        }
        case 'H': {
          const endX = toAbsX(a(0));
          segments.push(lineToCubic({ x: currentX, y: currentY }, { x: endX, y: currentY }));
          currentX = endX;
          break;
        }
        case 'V': {
          const endY = toAbsY(a(0));
          segments.push(lineToCubic({ x: currentX, y: currentY }, { x: currentX, y: endY }));
          currentY = endY;
          break;
        }
        case 'C': {
          const c1x = toAbsX(a(0));
          const c1y = toAbsY(a(1));
          const c2x = toAbsX(a(2));
          const c2y = toAbsY(a(3));
          const endX = toAbsX(a(4));
          const endY = toAbsY(a(5));
          segments.push({
            p0: { x: currentX, y: currentY },
            p1: { x: c1x, y: c1y },
            p2: { x: c2x, y: c2y },
            p3: { x: endX, y: endY }
          });
          lastControlX = c2x;
          lastControlY = c2y;
          currentX = endX;
          currentY = endY;
          break;
        }
        case 'S': {
          // Reflect the previous control point if the last command was C or S
          let c1x = currentX;
          let c1y = currentY;
          if (lastCommandType === 'C' || lastCommandType === 'S') {
            c1x = 2 * currentX - lastControlX;
            c1y = 2 * currentY - lastControlY;
          }
          const c2x = toAbsX(a(0));
          const c2y = toAbsY(a(1));
          const endX = toAbsX(a(2));
          const endY = toAbsY(a(3));
          segments.push({
            p0: { x: currentX, y: currentY },
            p1: { x: c1x, y: c1y },
            p2: { x: c2x, y: c2y },
            p3: { x: endX, y: endY }
          });
          lastControlX = c2x;
          lastControlY = c2y;
          currentX = endX;
          currentY = endY;
          lastCommandType = 'S';
          break;
        }
        case 'Q': {
          const cx = toAbsX(a(0));
          const cy = toAbsY(a(1));
          const endX = toAbsX(a(2));
          const endY = toAbsY(a(3));
          segments.push(quadraticToCubic({ x: currentX, y: currentY }, { x: cx, y: cy }, { x: endX, y: endY }));
          lastControlX = cx;
          lastControlY = cy;
          currentX = endX;
          currentY = endY;
          lastCommandType = 'Q';
          break;
        }
        case 'T': {
          // Reflect the previous control point if the last command was Q or T
          let cx = currentX;
          let cy = currentY;
          if (lastCommandType === 'Q' || lastCommandType === 'T') {
            cx = 2 * currentX - lastControlX;
            cy = 2 * currentY - lastControlY;
          }
          const endX = toAbsX(a(0));
          const endY = toAbsY(a(1));
          segments.push(quadraticToCubic({ x: currentX, y: currentY }, { x: cx, y: cy }, { x: endX, y: endY }));
          lastControlX = cx;
          lastControlY = cy;
          currentX = endX;
          currentY = endY;
          lastCommandType = 'T';
          break;
        }
        case 'A': {
          const endX = toAbsX(a(5));
          const endY = toAbsY(a(6));
          segments.push(
            ...arcToCubic(
              { x: currentX, y: currentY },
              Math.abs(a(0)),
              Math.abs(a(1)),
              a(2),
              Boolean(a(3)),
              Boolean(a(4)),
              { x: endX, y: endY }
            )
          );
          currentX = endX;
          currentY = endY;
          break;
        }
        case 'Z': {
          if (currentX !== subpathStartX || currentY !== subpathStartY) {
            segments.push(lineToCubic({ x: currentX, y: currentY }, { x: subpathStartX, y: subpathStartY }));
            currentX = subpathStartX;
            currentY = subpathStartY;
          }
          closed = true;
          break;
        }
      }
    }

    lastCommandType = absType;
  }

  startSubpath();
  return subpaths;
}

/** All the segments of a path, its subpaths one after another (see parsePathDataToSubpaths). */
export function parsePathDataToSegments(pathData: string): BezierSegment[] {
  return parsePathDataToSubpaths(pathData).flat();
}

export function updateFingerSegments(finger: Finger, segments: BezierSegment[]): Finger {
  return { ...finger, segments };
}

export function splitBezierAt(seg: BezierSegment, t: number): [BezierSegment, BezierSegment] {
  const p0 = seg.p0;
  const p1 = seg.p1;
  const p2 = seg.p2;
  const p3 = seg.p3;

  const p01 = vecLerp(p0, p1, t);
  const p12 = vecLerp(p1, p2, t);
  const p23 = vecLerp(p2, p3, t);

  const p012 = vecLerp(p01, p12, t);
  const p123 = vecLerp(p12, p23, t);

  const p0123 = vecLerp(p012, p123, t);

  return [
    { p0, p1: p01, p2: p012, p3: p0123 },
    { p0: p0123, p1: p123, p2: p23, p3 }
  ];
}

export function mergeBezierSegments(seg1: BezierSegment, seg2: BezierSegment): BezierSegment {
  // Simple merge heuristic: preserve endpoints and blend controls near the join.
  // This intentionally avoids heavy fitting (good enough for interactive editing).
  const bridge = vecLerp(seg1.p2, seg2.p1, 0.5);
  return {
    p0: seg1.p0,
    p1: vecLerp(seg1.p1, bridge, 0.5),
    p2: vecLerp(bridge, seg2.p2, 0.5),
    p3: seg2.p3
  };
}
