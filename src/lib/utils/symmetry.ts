import type { Finger, Vec } from '$lib/types/heart';

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

// Check if two points are approximately equal
function pointsEqual(a: Vec, b: Vec): boolean {
  return vecDistance(a, b) < TOLERANCE;
}

// Check if a curve is symmetric within itself (around its midpoint)
function isCurveSymmetric(finger: Finger): boolean {
  // For a symmetric curve, p0-p1 should mirror p3-p2
  const midX = (finger.p0.x + finger.p3.x) / 2;
  const midY = (finger.p0.y + finger.p3.y) / 2;

  // Check if control points are symmetric around midpoint
  const p1MirrorX = 2 * midX - finger.p1.x;
  const p1MirrorY = 2 * midY - finger.p1.y;

  return pointsEqual({ x: p1MirrorX, y: p1MirrorY }, finger.p2);
}

// Check if all curves within each lobe are symmetric (mirrored around lobe center)
function areLobesInternallySymmetric(fingers: Finger[]): boolean {
  const leftFingers = fingers.filter(f => f.lobe === 'left');
  const rightFingers = fingers.filter(f => f.lobe === 'right');

  // Check if left lobe fingers mirror each other
  if (leftFingers.length > 1) {
    const centerY = (leftFingers[0].p0.y + leftFingers[leftFingers.length - 1].p0.y) / 2;
    for (let i = 0; i < Math.floor(leftFingers.length / 2); i++) {
      const f1 = leftFingers[i];
      const f2 = leftFingers[leftFingers.length - 1 - i];
      if (!pointsEqual(vecMirrorY(f1.p0, centerY), f2.p0) ||
          !pointsEqual(vecMirrorY(f1.p3, centerY), f2.p3)) {
        return false;
      }
    }
  }

  // Check if right lobe fingers mirror each other
  if (rightFingers.length > 1) {
    const centerX = (rightFingers[0].p0.x + rightFingers[rightFingers.length - 1].p0.x) / 2;
    for (let i = 0; i < Math.floor(rightFingers.length / 2); i++) {
      const f1 = rightFingers[i];
      const f2 = rightFingers[rightFingers.length - 1 - i];
      const f1MirrorX = { x: 2 * centerX - f1.p0.x, y: f1.p0.y };
      const f2Check = f2.p0;
      if (!pointsEqual(f1MirrorX, f2Check)) {
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

    // When mirrored across diagonal, x and y swap
    if (!pointsEqual(vecSwapXY(left.p0), right.p0) ||
        !pointsEqual(vecSwapXY(left.p3), right.p3) ||
        !pointsEqual(vecSwapXY(left.p1), right.p1) ||
        !pointsEqual(vecSwapXY(left.p2), right.p2)) {
      return false;
    }
  }

  return true;
}

// Check if it's a "classic" design (all straight lines, no curves)
function isClassicDesign(fingers: Finger[]): boolean {
  for (const finger of fingers) {
    // A straight line has control points on the line between endpoints
    const dx = finger.p3.x - finger.p0.x;
    const dy = finger.p3.y - finger.p0.y;

    // Expected control points for straight line (1/3 and 2/3 along)
    const expectedP1 = { x: finger.p0.x + dx / 3, y: finger.p0.y + dy / 3 };
    const expectedP2 = { x: finger.p0.x + 2 * dx / 3, y: finger.p0.y + 2 * dy / 3 };

    if (!pointsEqual(finger.p1, expectedP1) || !pointsEqual(finger.p2, expectedP2)) {
      return false;
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
