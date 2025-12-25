import type { HeartDesign, Finger, GridSize } from '$lib/types/heart';
import { fingerToSegments, type BezierSegment } from '$lib/geometry/bezierSegments';
import { STRIP_WIDTH } from '$lib/constants';
import { vecSub, vecLength } from '$lib/geometry/vec';

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'expert';

interface DifficultyResult {
  level: DifficultyLevel;
  score: number; // 0-100
}

/**
 * Calculate the difficulty of a heart design based on multiple factors:
 * - Number of strips/fingers (more = harder to weave)
 * - Sharp corners (harder to cut cleanly)
 * - Curvy paths (harder to cut smoothly)
 * - Non-monotonicity (paths that change direction are harder)
 * - Minimum finger thickness (very thin areas are hard to cut; low weight)
 */
export function calculateDifficulty(design: HeartDesign): DifficultyResult {
  const fingerScore = calculateFingerCountDifficulty(design.gridSize);
  const cornerScore = calculateCornerDifficulty(design.fingers);
  const curvatureScore = calculatePathCurvature(design.fingers);
  const monotonicityScore = calculateNonMonotonicity(design.fingers);
  const thicknessScore = calculateThicknessDifficulty(design.fingers);

  // Weighted combination: emphasize finger count + corners; thickness is intentionally low weight.
  const score = Math.round(
    fingerScore * 0.35 +
    cornerScore * 0.30 +
    curvatureScore * 0.20 +
    monotonicityScore * 0.10 +
    thicknessScore * 0.05
  );

  const level = scoreToLevel(score);

  return { level, score };
}

function scoreToLevel(score: number): DifficultyLevel {
  // Intentionally bias towards extremes: fewer "hard", more "easy" and "expert".
  if (score < 30) return 'easy';
  if (score < 55) return 'medium';
  if (score < 70) return 'hard';
  return 'expert';
}

/**
 * Strip count contributes to difficulty: more strips = harder.
 * Use a gentle ramp so a simple 5x5 isn't automatically "hard".
 */
function calculateFingerCountDifficulty(gridSize: GridSize): number {
  const totalStrips = gridSize.x + gridSize.y;
  // 6 strips (3x3) = 0, 10 strips (5x5) ≈ 50, 14 strips (7x7) = 100
  return Math.min(100, Math.max(0, (totalStrips - 6) * 12.5));
}

/**
 * Path curvature: how curvy are the finger paths?
 * Measures deviation of control points from the chord line.
 */
function calculatePathCurvature(fingers: Finger[]): number {
  if (fingers.length === 0) return 0;

  let totalCurvature = 0;
  let totalSegments = 0;

  for (const finger of fingers) {
    const segments = fingerToSegments(finger);
    totalSegments += segments.length;

    for (const seg of segments) {
      totalCurvature += measureSegmentCurvature(seg);
    }
  }

  const avgCurvature = totalSegments > 0 ? totalCurvature / totalSegments : 0;
  return Math.min(100, avgCurvature * 100);
}

/**
 * Measure how curved a bezier segment is by checking control point deviation
 * Returns 0 for a straight line, higher values for more curved segments
 */
function measureSegmentCurvature(seg: BezierSegment): number {
  const chord = vecSub(seg.p3, seg.p0);
  const chordLength = vecLength(chord);
  if (chordLength < 0.001) return 0;

  // Perpendicular distance from control points to chord line, normalized by chord length.
  const pointLineDistance = (p: { x: number; y: number }): number => {
    const cross = Math.abs((p.x - seg.p0.x) * chord.y - (p.y - seg.p0.y) * chord.x);
    return cross / chordLength;
  };
  const d1 = pointLineDistance(seg.p1) / chordLength;
  const d2 = pointLineDistance(seg.p2) / chordLength;

  // Scale so typical gentle curves register, but cap at 1.
  const deviation = Math.max(d1, d2);
  return Math.min(1, deviation * 4);
}

/**
 * Non-monotonicity: curves that change direction are harder to cut and weave.
 * A monotonic curve always moves in one direction (e.g., always left-to-right).
 * Non-monotonic curves (like circles or S-curves) change direction.
 */
function calculateNonMonotonicity(fingers: Finger[]): number {
  if (fingers.length === 0) return 0;

  let totalDirectionChanges = 0;
  let totalSamples = 0;

  for (const finger of fingers) {
    const segments = fingerToSegments(finger);
    const points = sampleBezierPoints(segments, 20);

    if (points.length < 3) continue;

    // Count direction changes in both x and y
    // For left lobe (horizontal fingers), we care about y direction changes
    // For right lobe (vertical fingers), we care about x direction changes
    const isHorizontal = finger.lobe === 'left';

    let directionChanges = 0;
    let prevDelta = 0;

    for (let i = 1; i < points.length; i++) {
      const delta = isHorizontal
        ? points[i].y - points[i - 1].y
        : points[i].x - points[i - 1].x;

      // Skip very small movements (noise)
      if (Math.abs(delta) < 0.1) continue;

      // Check if direction changed
      if (prevDelta !== 0 && Math.sign(delta) !== Math.sign(prevDelta)) {
        directionChanges++;
      }
      prevDelta = delta;
    }

    totalDirectionChanges += directionChanges;
    totalSamples++;
  }

  if (totalSamples === 0) return 0;

  // Average direction changes per finger
  // 0 changes = monotonic = easy, 2+ changes = non-monotonic = hard
  const avgChanges = totalDirectionChanges / totalSamples;

  // Score: 0 changes = 0, 1 change = 33, 2 changes = 66, 3+ changes = 100
  return Math.min(100, avgChanges * 33);
}

/**
 * Corner difficulty: sharp direction changes at segment joins are harder to cut cleanly.
 */
function calculateCornerDifficulty(fingers: Finger[]): number {
  let totalSharpness = 0;

  // Ignore tiny bends; focus on corners.
  const TURN_THRESHOLD = 0.05; // ≈ 25° ( (1 - cosθ)/2 )

  for (const finger of fingers) {
    const segments = fingerToSegments(finger);
    if (segments.length < 2) continue;

    for (let i = 0; i < segments.length - 1; i++) {
      const a = segments[i]!;
      const b = segments[i + 1]!;

      const v1 = vecSub(a.p3, a.p0);
      const v2 = vecSub(b.p3, b.p0);
      const len1 = vecLength(v1);
      const len2 = vecLength(v2);
      if (len1 < 0.001 || len2 < 0.001) continue;

      const dot = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
      const clampedDot = Math.max(-1, Math.min(1, dot));

      // 0 = straight, 1 = 180° turn (worst case)
      const turn = (1 - clampedDot) / 2;
      if (turn <= TURN_THRESHOLD) continue;

      const sharpness = (turn - TURN_THRESHOLD) / (1 - TURN_THRESHOLD);
      totalSharpness += sharpness;
    }
  }

  // Rough calibration: ~10 sharp corners => 100.
  return Math.min(100, (totalSharpness / 10) * 100);
}

/**
 * Thickness difficulty: thinner fingers are harder to cut and weave
 * Measures minimum distance between adjacent finger paths
 */
function calculateThicknessDifficulty(fingers: Finger[]): number {
  // Group fingers by lobe
  const leftFingers = fingers.filter(f => f.lobe === 'left');
  const rightFingers = fingers.filter(f => f.lobe === 'right');

  // Calculate minimum thickness for each lobe
  const leftThickness = calculateMinThickness(leftFingers);
  const rightThickness = calculateMinThickness(rightFingers);

  // Use the thinner of the two
  const minThickness = Math.min(leftThickness, rightThickness);

  // Expected thickness for a uniform grid
  const expectedThickness = STRIP_WIDTH;

  // How much thinner than expected? ratio < 1 means thinner
  const ratio = minThickness / expectedThickness;

  // Thinner fingers (ratio < 0.5) = harder
  // ratio 1.0+ = score 0, ratio 0.3 = score 100
  const score = Math.max(0, Math.min(100, (1 - ratio) * 140));

  return score;
}

/**
 * Calculate minimum thickness between adjacent fingers of same lobe
 */
function calculateMinThickness(fingers: Finger[]): number {
  if (fingers.length < 2) return 100; // Only one finger, no thinness issue

  // Sample points along each finger and find minimum distance to neighbors
  let minDist = Infinity;

  // Sort fingers by their starting position to compare adjacent ones
  const sortedFingers = [...fingers].sort((a, b) => {
    const segsA = fingerToSegments(a);
    const segsB = fingerToSegments(b);
    if (!segsA.length || !segsB.length) return 0;
    // Sort by y for left lobe (horizontal), x for right lobe (vertical)
    if (a.lobe === 'left') {
      return segsA[0].p0.y - segsB[0].p0.y;
    }
    return segsA[0].p0.x - segsB[0].p0.x;
  });

  // Compare adjacent fingers
  for (let i = 0; i < sortedFingers.length - 1; i++) {
    const finger1 = sortedFingers[i];
    const finger2 = sortedFingers[i + 1];

    const segs1 = fingerToSegments(finger1);
    const segs2 = fingerToSegments(finger2);

    // Sample points along each finger
    const points1 = sampleBezierPoints(segs1, 10);
    const points2 = sampleBezierPoints(segs2, 10);

    // Find minimum distance between the two curves
    for (const p1 of points1) {
      for (const p2 of points2) {
        const dist = vecLength(vecSub(p1, p2));
        if (dist < minDist) minDist = dist;
      }
    }
  }

  return Number.isFinite(minDist) ? minDist : 100;
}

/**
 * Sample points along a series of bezier segments
 */
function sampleBezierPoints(segments: BezierSegment[], samplesPerSegment: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];

  for (const seg of segments) {
    for (let i = 0; i <= samplesPerSegment; i++) {
      const t = i / samplesPerSegment;
      points.push(evaluateBezier(seg, t));
    }
  }

  return points;
}

/**
 * Evaluate a cubic bezier at parameter t
 */
function evaluateBezier(seg: BezierSegment, t: number): { x: number; y: number } {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;

  return {
    x: mt3 * seg.p0.x + 3 * mt2 * t * seg.p1.x + 3 * mt * t2 * seg.p2.x + t3 * seg.p3.x,
    y: mt3 * seg.p0.y + 3 * mt2 * t * seg.p1.y + 3 * mt * t2 * seg.p2.y + t3 * seg.p3.y
  };
}
