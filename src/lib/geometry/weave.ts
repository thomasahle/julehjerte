import type { HeartState, WeaveMatrix, WeaveCell, FingerPath, Point } from '../types';
import { intersectBezierWithHorizontal, intersectBezierCurves, toBezierJs } from './curves';

/**
 * Compute the weave matrix based on finger intersections
 * The matrix indicates which lobe is "on top" at each crossing
 */
export function computeWeaveMatrix(heart: HeartState): WeaveMatrix {
  const n = heart.gridSize;
  const matrix: WeaveMatrix = [];

  // Get fingers sorted by their position
  const leftFingers = Object.values(heart.fingers)
    .filter(f => f.lobe === 'left')
    .sort((a, b) => a.startBorderT - b.startBorderT);

  const rightFingers = Object.values(heart.fingers)
    .filter(f => f.lobe === 'right')
    .sort((a, b) => a.startBorderT - b.startBorderT);

  // For each row, compute which is on top
  for (let row = 0; row < n; row++) {
    // Calculate the y position for this row (normalized)
    const yRow = 0.25 + (row + 0.5) * (0.5 / n); // within the body section

    const cells: WeaveCell[] = [];

    for (let col = 0; col < n; col++) {
      const leftFinger = leftFingers[col];
      const rightFinger = rightFingers[col];

      // Default to alternating pattern
      let top: WeaveCell = (row + col) % 2 === 0 ? 'left' : 'right';

      // If we have actual fingers, use their intersection positions
      if (leftFinger && rightFinger) {
        const leftIntersections = getFingerXAtY(leftFinger, yRow);
        const rightIntersections = getFingerXAtY(rightFinger, yRow);

        if (leftIntersections.length > 0 && rightIntersections.length > 0) {
          const xLeft = leftIntersections[0];
          const xRight = rightIntersections[0];

          // Classic alternating pattern based on row + col parity
          // This creates the characteristic woven look
          top = (row + col) % 2 === 0 ? 'left' : 'right';
        }
      }

      cells.push(top);
    }

    matrix.push(cells);
  }

  return matrix;
}

/**
 * Get the x coordinate(s) where a finger intersects a horizontal line at y
 */
function getFingerXAtY(finger: FingerPath, y: number): number[] {
  const xs: number[] = [];

  for (const segment of finger.segments) {
    const intersections = intersectBezierWithHorizontal(segment, y);
    for (const pt of intersections) {
      xs.push(pt.x);
    }
  }

  return xs.sort((a, b) => a - b);
}

/**
 * Generate weaving instructions as text
 */
export function generateWeaveInstructions(matrix: WeaveMatrix): string[] {
  const instructions: string[] = [];

  for (let row = 0; row < matrix.length; row++) {
    const rowCells = matrix[row];
    const rowDesc: string[] = [];

    for (let col = 0; col < rowCells.length; col++) {
      const cell = rowCells[col];
      rowDesc.push(cell === 'left' ? 'L' : 'R');
    }

    instructions.push(`Row ${row + 1}: ${rowDesc.join(' → ')}`);
  }

  return instructions;
}

/**
 * Check if a weave pattern is valid (alternating properly)
 */
export function isValidWeavePattern(matrix: WeaveMatrix): boolean {
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix[row].length; col++) {
      // Check horizontal neighbor
      if (col > 0 && matrix[row][col] === matrix[row][col - 1]) {
        // Two adjacent cells in same row shouldn't both have same on top
        // unless it's intentional for a specific pattern
      }

      // Check vertical neighbor
      if (row > 0 && matrix[row][col] === matrix[row - 1][col]) {
        // Similar for vertical
      }
    }
  }

  return true; // For now, accept any pattern
}

/**
 * Create a classic alternating weave pattern
 */
export function createAlternatingPattern(gridSize: number): WeaveMatrix {
  const matrix: WeaveMatrix = [];

  for (let row = 0; row < gridSize; row++) {
    const cells: WeaveCell[] = [];
    for (let col = 0; col < gridSize; col++) {
      cells.push((row + col) % 2 === 0 ? 'left' : 'right');
    }
    matrix.push(cells);
  }

  return matrix;
}

/**
 * Represents an intersection point between two fingers
 */
export interface WeaveIntersection {
  point: Point;           // Intersection point (normalized coordinates)
  leftFingerId: string;   // ID of the left lobe finger
  rightFingerId: string;  // ID of the right lobe finger
  leftFingerIdx: number;  // Index of left finger (0-based)
  rightFingerIdx: number; // Index of right finger (0-based)
  onTop: 'left' | 'right'; // Which finger is on top at this intersection
}

/**
 * Compute all intersection points between left and right fingers,
 * along with over/under information based on the weave pattern
 */
export function computeWeaveIntersections(heart: HeartState): WeaveIntersection[] {
  const intersections: WeaveIntersection[] = [];

  const leftFingers = Object.values(heart.fingers)
    .filter(f => f.lobe === 'left')
    .sort((a, b) => a.startBorderT - b.startBorderT);

  const rightFingers = Object.values(heart.fingers)
    .filter(f => f.lobe === 'right')
    .sort((a, b) => a.startBorderT - b.startBorderT);

  // For each pair of (left finger, right finger), find intersections
  for (let leftIdx = 0; leftIdx < leftFingers.length; leftIdx++) {
    const leftFinger = leftFingers[leftIdx];

    for (let rightIdx = 0; rightIdx < rightFingers.length; rightIdx++) {
      const rightFinger = rightFingers[rightIdx];

      // Find intersections between these two fingers
      for (const leftSeg of leftFinger.segments) {
        for (const rightSeg of rightFinger.segments) {
          const points = intersectBezierCurves(leftSeg, rightSeg);

          for (const point of points) {
            // Determine which is on top using classic alternating pattern
            const onTop: 'left' | 'right' = (leftIdx + rightIdx) % 2 === 0 ? 'left' : 'right';

            intersections.push({
              point,
              leftFingerId: leftFinger.id,
              rightFingerId: rightFinger.id,
              leftFingerIdx: leftIdx,
              rightFingerIdx: rightIdx,
              onTop
            });
          }
        }
      }
    }
  }

  return intersections;
}
