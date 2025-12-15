import { derived } from 'svelte/store';
import { heartStore } from './heart';
import { editorStore } from './editor';
import type { Point, ControlPoint, WeaveMatrix } from '../types';
import { sampleBezierPath } from '../geometry/curves';
import { computeWeaveMatrix, computeWeaveIntersections, type WeaveIntersection } from '../geometry/weave';
import { toScreen, CANVAS_WIDTH, CANVAS_HEIGHT } from '../geometry/heart';

/**
 * Derived store for sampled finger path points (for rendering)
 * Returns screen coordinates
 */
export const sampledPaths = derived(heartStore, $heart => {
  const paths: Record<string, Point[]> = {};

  for (const [fingerId, finger] of Object.entries($heart.fingers)) {
    const normalizedPoints = sampleBezierPath(finger.segments, 30);
    paths[fingerId] = normalizedPoints.map(p => toScreen(p));
  }

  return paths;
});

/**
 * Derived store for lobe outline points (for rendering)
 */
export const lobeOutlines = derived(heartStore, $heart => {
  return {
    left: $heart.lobes.left.pathPoints.map(p => toScreen(p)),
    right: $heart.lobes.right.pathPoints.map(p => toScreen(p))
  };
});

/**
 * Derived store for all control points (for rendering handles)
 */
export const controlPoints = derived(
  [heartStore, editorStore],
  ([$heart, $editor]) => {
    const points: ControlPoint[] = [];

    // Only show control points for selected path, or all in edit mode
    const showAll = $editor.mode !== 'select';
    const selectedId = $editor.selectedPathId;

    for (const [fingerId, finger] of Object.entries($heart.fingers)) {
      if (!showAll && fingerId !== selectedId) continue;

      finger.segments.forEach((segment, segIdx) => {
        const keys: Array<'p0' | 'p1' | 'p2' | 'p3'> = ['p0', 'p1', 'p2', 'p3'];

        keys.forEach((key, keyIdx) => {
          const isEndpoint = key === 'p0' || key === 'p3';
          const screenPos = toScreen(segment[key]);

          points.push({
            id: `${fingerId}-${segIdx}-${key}`,
            pathId: fingerId,
            segmentIndex: segIdx,
            pointKey: key,
            position: screenPos,
            type: isEndpoint ? 'endpoint' : 'handle',
            isConstrained: isEndpoint
          });
        });
      });
    }

    return points;
  }
);

/**
 * Derived store for the weave matrix
 */
export const weaveMatrix = derived(heartStore, $heart => {
  return computeWeaveMatrix($heart);
});

/**
 * Derived store for weave intersections (for rendering over/under effect)
 */
export const weaveIntersections = derived(heartStore, $heart => {
  const intersections = computeWeaveIntersections($heart);
  // Convert to screen coordinates
  return intersections.map(int => ({
    ...int,
    screenPoint: toScreen(int.point)
  }));
});

/**
 * Derived store for path visibility/styling based on selection
 */
export const pathStyles = derived(
  [heartStore, editorStore],
  ([$heart, $editor]) => {
    const styles: Record<string, { strokeWidth: number; opacity: number }> = {};

    for (const fingerId of Object.keys($heart.fingers)) {
      const isSelected = fingerId === $editor.selectedPathId;
      styles[fingerId] = {
        strokeWidth: isSelected ? 4 : 2,
        opacity: isSelected ? 1 : 0.8
      };
    }

    return styles;
  }
);

