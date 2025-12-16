import type { Finger, Vec } from '$lib/types/heart';
import { fingerToSegments } from '$lib/geometry/bezierSegments';

const TOLERANCE = 5; // pixels

function vecDistance(a: Vec, b: Vec): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function vecMirrorY(v: Vec, centerY: number): Vec {
  return { x: v.x, y: 2 * centerY - v.y };
}

function vecSwapXY(v: Vec): Vec {
  return { x: v.y, y: v.x };
}

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
  return vecDistance(a, b) < TOLERANCE;
}

// Check if a curve is symmetric within itself (around its midpoint)
function isCurveSymmetric(finger: Finger): boolean {
  const segments = fingerToSegments(finger);
  if (segments.length === 0) return true;

  for (const seg of segments) {
    const mirrorP2 = reflectAcrossChordBisector(seg.p0, seg.p3, seg.p1);
    const mirrorP1 = reflectAcrossChordBisector(seg.p0, seg.p3, seg.p2);
    const antiP2 = pointReflectAcrossMidpoint(seg.p0, seg.p3, seg.p1);
    const antiP1 = pointReflectAcrossMidpoint(seg.p0, seg.p3, seg.p2);

    const mirrorOk = pointsEqual(seg.p2, mirrorP2) || pointsEqual(seg.p1, mirrorP1);
    const antiOk = pointsEqual(seg.p2, antiP2) || pointsEqual(seg.p1, antiP1);
    if (!mirrorOk && !antiOk) return false;
  }

  return true;
}

// Check if all curves within each lobe are symmetric (mirrored around lobe center)
function areLobesInternallySymmetric(fingers: Finger[]): boolean {
  const leftFingers = fingers.filter(f => f.lobe === 'left');
  const rightFingers = fingers.filter(f => f.lobe === 'right');

  // Check if left lobe fingers mirror each other
  if (leftFingers.length > 1) {
    const firstY = fingerToSegments(leftFingers[0])?.[0]?.p0.y ?? 0;
    const lastY = fingerToSegments(leftFingers[leftFingers.length - 1])?.[0]?.p0.y ?? 0;
    const centerY = (firstY + lastY) / 2;
    for (let i = 0; i < Math.floor(leftFingers.length / 2); i++) {
      const f1 = leftFingers[i];
      const f2 = leftFingers[leftFingers.length - 1 - i];
      const s1 = fingerToSegments(f1);
      const s2 = fingerToSegments(f2);
      const f1p0 = s1[0]?.p0;
      const f1p3 = s1[s1.length - 1]?.p3;
      const f2p0 = s2[0]?.p0;
      const f2p3 = s2[s2.length - 1]?.p3;
      if (!f1p0 || !f1p3 || !f2p0 || !f2p3) return false;
      if (!pointsEqual(vecMirrorY(f1p0, centerY), f2p0) || !pointsEqual(vecMirrorY(f1p3, centerY), f2p3)) {
        return false;
      }
    }
  }

  // Check if right lobe fingers mirror each other
  if (rightFingers.length > 1) {
    const firstX = fingerToSegments(rightFingers[0])?.[0]?.p0.x ?? 0;
    const lastX = fingerToSegments(rightFingers[rightFingers.length - 1])?.[0]?.p0.x ?? 0;
    const centerX = (firstX + lastX) / 2;
    for (let i = 0; i < Math.floor(rightFingers.length / 2); i++) {
      const f1 = rightFingers[i];
      const f2 = rightFingers[rightFingers.length - 1 - i];
      const s1 = fingerToSegments(f1);
      const s2 = fingerToSegments(f2);
      const f1p0 = s1[0]?.p0;
      const f2p0 = s2[0]?.p0;
      if (!f1p0 || !f2p0) return false;
      const f1MirrorX = { x: 2 * centerX - f1p0.x, y: f1p0.y };
      if (!pointsEqual(f1MirrorX, f2p0)) {
        return false;
      }
    }
  }

  return true;
}

// Check if left and right lobes mirror each other (diagonal symmetry)
function areLobesMirrored(fingers: Finger[]): boolean {
  const leftFingers = fingers.filter(f => f.lobe === 'left');
  const rightFingers = fingers.filter(f => f.lobe === 'right');

  if (leftFingers.length !== rightFingers.length) return false;

  // For mirror symmetry, left fingers should map to right fingers when swapping x/y
  for (let i = 0; i < leftFingers.length; i++) {
    const left = leftFingers[i];
    const right = rightFingers[i];

    const lSegs = fingerToSegments(left);
    const rSegs = fingerToSegments(right);
    if (lSegs.length !== rSegs.length) return false;
    for (let s = 0; s < lSegs.length; s++) {
      const l = lSegs[s];
      const r = rSegs[s];
      if (!l || !r) return false;
      if (
        !pointsEqual(vecSwapXY(l.p0), r.p0) ||
        !pointsEqual(vecSwapXY(l.p1), r.p1) ||
        !pointsEqual(vecSwapXY(l.p2), r.p2) ||
        !pointsEqual(vecSwapXY(l.p3), r.p3)
      ) {
        return false;
      }
    }
  }

  return true;
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
