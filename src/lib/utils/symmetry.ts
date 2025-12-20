import type { Finger, Vec } from '$lib/types/heart';
import { fingerToSegments, reverseSegments, type BezierSegment } from '$lib/geometry/bezierSegments';
import { vecDist } from '$lib/geometry/vec';

const TOLERANCE = 5; // pixels

type Segment = BezierSegment;

function reflectAcrossChordBisector(p0: Vec, p3: Vec, p: Vec): Vec {
  const mid = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 };
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const vx = -uy;
  const vy = ux;
  const rx = p.x - mid.x;
  const ry = p.y - mid.y;
  const uComp = rx * ux + ry * uy;
  const vComp = rx * vx + ry * vy;
  return { x: mid.x + (-uComp) * ux + vComp * vx, y: mid.y + (-uComp) * uy + vComp * vy };
}

function pointReflectAcrossMidpoint(p0: Vec, p3: Vec, p: Vec): Vec {
  return { x: p0.x + p3.x - p.x, y: p0.y + p3.y - p.y };
}

// Check if two points are approximately equal
function pointsEqual(a: Vec, b: Vec): boolean {
  return vecDist(a, b) < TOLERANCE;
}

function mapSegments(
  segments: Segment[],
  mapPoint: (p: Vec) => Vec,
  reverseDirection = false
): Segment[] {
  const mapped = segments.map((seg) => ({
    p0: mapPoint(seg.p0),
    p1: mapPoint(seg.p1),
    p2: mapPoint(seg.p2),
    p3: mapPoint(seg.p3)
  }));
  return reverseDirection ? reverseSegments(mapped) : mapped;
}

function segmentsEqual(a: Segment[], b: Segment[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const s1 = a[i]!;
    const s2 = b[i]!;
    if (
      !pointsEqual(s1.p0, s2.p0) ||
      !pointsEqual(s1.p1, s2.p1) ||
      !pointsEqual(s1.p2, s2.p2) ||
      !pointsEqual(s1.p3, s2.p3)
    ) {
      return false;
    }
  }
  return true;
}

function inferSquareBounds(fingers: Finger[]): { minX: number; maxX: number; minY: number; maxY: number; size: number } | null {
  const endpoints: Vec[] = [];
  for (const finger of fingers) {
    const segs = fingerToSegments(finger);
    if (!segs.length) continue;
    endpoints.push(segs[0]!.p0, segs[segs.length - 1]!.p3);
  }
  if (!endpoints.length) return null;
  const xs = endpoints.map((p) => p.x);
  const ys = endpoints.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const size = (sizeX + sizeY) / 2;
  if (!Number.isFinite(size) || size < 1) return null;
  return { minX, maxX, minY, maxY, size };
}

function mapPointWithinLobe(bounds: { minX: number; maxX: number; minY: number; maxY: number }, lobe: Finger['lobe'], p: Vec, anti = false): Vec {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  if (anti) return { x: 2 * cx - p.x, y: 2 * cy - p.y };
  if (lobe === 'left') return { x: p.x, y: 2 * cy - p.y };
  return { x: 2 * cx - p.x, y: p.y };
}

function mapPointBetweenLobes(bounds: { minX: number; minY: number; size: number }, p: Vec, anti = false): Vec {
  const { minX, minY, size } = bounds;
  if (!anti) {
    return { x: minX + (p.y - minY), y: minY + (p.x - minX) };
  }
  return { x: minX + size - (p.y - minY), y: minY + size - (p.x - minX) };
}

function isCurveSymmetricUnder(finger: Finger, anti: boolean): boolean {
  const segments = fingerToSegments(finger);
  const n = segments.length;
  if (n === 0) return true;

  const start = segments[0]!.p0;
  const end = segments[n - 1]!.p3;
  const mate = (p: Vec) => (anti ? pointReflectAcrossMidpoint(start, end, p) : reflectAcrossChordBisector(start, end, p));

  for (let i = 0; i < n; i++) {
    const j = n - 1 - i;
    const a = segments[i]!;
    const b = segments[j]!;
    if (
      !pointsEqual(a.p0, mate(b.p3)) ||
      !pointsEqual(a.p1, mate(b.p2)) ||
      !pointsEqual(a.p2, mate(b.p1)) ||
      !pointsEqual(a.p3, mate(b.p0))
    ) {
      return false;
    }
  }

  return true;
}

function isCurveSymmetric(finger: Finger): boolean {
  return isCurveSymmetricUnder(finger, false) || isCurveSymmetricUnder(finger, true);
}

// Check if all curves within each lobe are symmetric (mirrored around lobe center)
function areLobesInternallySymmetric(fingers: Finger[]): boolean {
  const bounds = inferSquareBounds(fingers);
  if (!bounds) return false;

  const check = (anti: boolean): boolean => {
    for (const lobe of ['left', 'right'] as const) {
      const lobeFingers = fingers.filter((f) => f.lobe === lobe);
      // For each finger, find its mirror pair within the same lobe
      const used = new Set<number>();
      for (let i = 0; i < lobeFingers.length; i++) {
        if (used.has(i)) continue;
        const s1 = fingerToSegments(lobeFingers[i]!);
        const mapped = mapSegments(s1, (p) => mapPointWithinLobe(bounds, lobe, p, anti), anti);
        // Check if it's self-symmetric
        if (segmentsEqual(mapped, s1)) {
          used.add(i);
          continue;
        }
        // Find a matching pair
        let foundPair = false;
        for (let j = i + 1; j < lobeFingers.length; j++) {
          if (used.has(j)) continue;
          const s2 = fingerToSegments(lobeFingers[j]!);
          if (segmentsEqual(mapped, s2)) {
            used.add(i);
            used.add(j);
            foundPair = true;
            break;
          }
        }
        if (!foundPair) return false;
      }
    }
    return true;
  };

  return check(false) || check(true);
}

// Check if left and right lobes mirror each other (diagonal symmetry)
function areLobesMirrored(fingers: Finger[]): boolean {
  const bounds = inferSquareBounds(fingers);
  if (!bounds) return false;

  const leftFingers = fingers.filter((f) => f.lobe === 'left');
  const rightFingers = fingers.filter((f) => f.lobe === 'right');
  if (leftFingers.length !== rightFingers.length) return false;

  const check = (anti: boolean): boolean => {
    // For each left finger, find a matching right finger (greedy matching)
    const usedRight = new Set<number>();
    for (const left of leftFingers) {
      const lSegs = fingerToSegments(left);
      const mapped = mapSegments(lSegs, (p) => mapPointBetweenLobes(bounds, p, anti), anti);
      let foundMatch = false;
      for (let j = 0; j < rightFingers.length; j++) {
        if (usedRight.has(j)) continue;
        const rSegs = fingerToSegments(rightFingers[j]!);
        if (segmentsEqual(mapped, rSegs)) {
          usedRight.add(j);
          foundMatch = true;
          break;
        }
      }
      if (!foundMatch) return false;
    }
    return true;
  };

  return check(false) || check(true);
}

// Check if it's a "classic" design (all straight lines, no curves)
function isClassicDesign(fingers: Finger[]): boolean {
  for (const finger of fingers) {
    const segments = fingerToSegments(finger);
    for (const seg of segments) {
      // A straight line has control points on the line between endpoints.
      const dx = seg.p3.x - seg.p0.x;
      const dy = seg.p3.y - seg.p0.y;
      const expectedP1 = { x: seg.p0.x + dx / 3, y: seg.p0.y + dy / 3 };
      const expectedP2 = { x: seg.p0.x + 2 * dx / 3, y: seg.p0.y + 2 * dy / 3 };
      if (!pointsEqual(seg.p1, expectedP1) || !pointsEqual(seg.p2, expectedP2)) return false;
    }
  }
  return true;
}

export interface SymmetryInfo {
  isClassic: boolean;
  curveSymmetry: boolean;
  lobeSymmetry: boolean;
  mirrorSymmetry: boolean;
}

export function detectSymmetry(fingers: Finger[]): SymmetryInfo {
  if (fingers.length === 0) {
    return {
      isClassic: true,
      curveSymmetry: true,
      lobeSymmetry: true,
      mirrorSymmetry: true
    };
  }

  const isClassic = isClassicDesign(fingers);
  const curveSymmetry = fingers.every(isCurveSymmetric);
  const lobeSymmetry = areLobesInternallySymmetric(fingers);
  const mirrorSymmetry = areLobesMirrored(fingers);

  return {
    isClassic,
    curveSymmetry,
    lobeSymmetry,
    mirrorSymmetry
  };
}

export function getSymmetryDescription(info: SymmetryInfo, t: (key: string) => string): string {
  if (info.isClassic) {
    return t('classic');
  }

  const parts: string[] = [];
  if (info.mirrorSymmetry) {
    parts.push(t('mirrorSymmetry'));
  }
  if (info.lobeSymmetry && !info.mirrorSymmetry) {
    parts.push(t('symmetricLobes'));
  }
  if (info.curveSymmetry && !info.mirrorSymmetry) {
    parts.push(t('symmetricCurves'));
  }

  return parts.length > 0 ? parts.join(', ') : t('noSymmetry');
}
