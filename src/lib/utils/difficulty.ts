import type { HeartDesign, Finger, GridSize } from '$lib/types/heart';
import { fingerToSegments, type BezierSegment } from '$lib/geometry/bezierSegments';
import { vecSub, vecLength } from '$lib/geometry/vec';

export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'expert';

export interface DifficultyResult {
  level: DifficultyLevel;
  score: number; // 0-100
}

/**
 * Calculate the difficulty of a heart design based on multiple factors:
 * - Grid size (more strips = harder)
 * - Path complexity (more segments, more curvature = harder)
 * - Non-monotonicity (curves that change direction are harder)
 * - Minimum finger thickness (thinner = harder to cut)
 */
export function calculateDifficulty(design: HeartDesign): DifficultyResult {
  const gridScore = calculateGridDifficulty(design.gridSize);
  const pathScore = calculatePathComplexity(design.fingers);
  const monotonicityScore = calculateNonMonotonicity(design.fingers);
  const thicknessScore = calculateThicknessDifficulty(design.fingers, design.gridSize);

  // Weighted combination - non-monotonicity is important for "tricky" curves
  const score = Math.round(
    gridScore * 0.25 +
    pathScore * 0.25 +
    monotonicityScore * 0.30 +
    thicknessScore * 0.20
  );

  const level = scoreToLevel(score);

  return { level, score };
}

function scoreToLevel(score: number): DifficultyLevel {
  if (score < 25) return 'easy';
  if (score < 50) return 'medium';
  if (score < 75) return 'hard';
  return 'expert';
}

/**
 * Grid size contributes to difficulty: more strips = harder
 * 3x3 = easy, 4x4 = medium, 5x5+ = hard
 */
function calculateGridDifficulty(gridSize: GridSize): number {
  const totalStrips = gridSize.x + gridSize.y;
  // 6 strips (3x3) = 0, 8 strips (4x4) = 40, 10 strips (5x5) = 80
  return Math.min(100, Math.max(0, (totalStrips - 6) * 20));
}

/**
 * Path complexity: how curved/complex are the finger paths?
 * Measures deviation of control points from straight lines
 */
function calculatePathComplexity(fingers: Finger[]): number {
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

  // Average curvature per segment, normalized
  // A straight line has curvature 0, a heavily curved segment ~1
  const avgCurvature = totalSegments > 0 ? totalCurvature / totalSegments : 0;

  // Also factor in segment count per finger (more segments = more complex)
  const avgSegmentsPerFinger = totalSegments / Math.max(1, fingers.length);
  const segmentComplexity = Math.min(1, (avgSegmentsPerFinger - 1) / 3); // 1 seg = 0, 4+ seg = 1

  // Combine curvature and segment count
  const complexity = avgCurvature * 0.7 + segmentComplexity * 0.3;

  return Math.min(100, complexity * 100);
}

/**
 * Measure how curved a bezier segment is by checking control point deviation
 * Returns 0 for a straight line, higher values for more curved segments
 */
function measureSegmentCurvature(seg: BezierSegment): number {
  // Vector from start to end
  const chord = vecSub(seg.p3, seg.p0);
  const chordLength = vecLength(chord);

  if (chordLength < 0.001) return 0;

  // Measure how far control points deviate from the chord line
  // For a straight line, p1 is at 1/3 and p2 is at 2/3 along the chord
  const expectedP1 = {
    x: seg.p0.x + chord.x / 3,
    y: seg.p0.y + chord.y / 3
  };
  const expectedP2 = {
    x: seg.p0.x + (chord.x * 2) / 3,
    y: seg.p0.y + (chord.y * 2) / 3
  };

  const dev1 = vecLength(vecSub(seg.p1, expectedP1)) / chordLength;
  const dev2 = vecLength(vecSub(seg.p2, expectedP2)) / chordLength;

  // Average deviation, capped at 1
  return Math.min(1, (dev1 + dev2) / 2);
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
 * Thickness difficulty: thinner fingers are harder to cut and weave
 * Measures minimum distance between adjacent finger paths
 */
function calculateThicknessDifficulty(fingers: Finger[], gridSize: GridSize): number {
  // Group fingers by lobe
  const leftFingers = fingers.filter(f => f.lobe === 'left');
  const rightFingers = fingers.filter(f => f.lobe === 'right');

  // Calculate minimum thickness for each lobe
  const leftThickness = calculateMinThickness(leftFingers, gridSize);
  const rightThickness = calculateMinThickness(rightFingers, gridSize);

  // Use the thinner of the two
  const minThickness = Math.min(leftThickness, rightThickness);

  // Expected thickness for a uniform grid
  const expectedThickness = 100 / Math.max(gridSize.x, gridSize.y);

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
function calculateMinThickness(fingers: Finger[], gridSize: GridSize): number {
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
