import { writable } from 'svelte/store';
import type { HeartState, Point } from '../types';
import {
  createDefaultHeart,
  updateControlPoint as updateControlPointFn,
  addFingerPath as addFingerPathFn,
  removeFingerPath as removeFingerPathFn,
  translateFinger as translateFingerFn,
  setGridSize as setGridSizeFn
} from '../heartFactory';

// Create the main heart state store
function createHeartStore() {
  const { subscribe, set, update } = writable<HeartState>(createDefaultHeart(4));

  return {
    subscribe,
    set,
    update,

    // Reset to default state
    reset: (gridSize = 4) => {
      set(createDefaultHeart(gridSize));
    },

    // Update grid size
    setGridSize: (newSize: number) => {
      update(heart => setGridSizeFn(heart, newSize));
    },

    // Update a control point position
    updateControlPoint: (
      fingerId: string,
      segmentIndex: number,
      pointKey: 'p0' | 'p1' | 'p2' | 'p3',
      newPosition: Point
    ) => {
      update(heart => updateControlPointFn(heart, fingerId, segmentIndex, pointKey, newPosition));
    },

    // Translate a finger by a delta (normalized coords), then re-clamp endpoints
    translateFinger: (fingerId: string, delta: Point) => {
      update(heart => translateFingerFn(heart, fingerId, delta));
    },

    // Add a new finger path
    addFingerPath: (startPoint: Point, endPoint: Point, lobe: 'left' | 'right') => {
      update(heart => addFingerPathFn(heart, startPoint, endPoint, lobe));
    },

    // Remove a finger path
    removeFingerPath: (fingerId: string) => {
      update(heart => removeFingerPathFn(heart, fingerId));
    },

    // Toggle symmetry between lobes
    toggleLobeSynmetry: () => {
      update(heart => ({
        ...heart,
        symmetry: {
          ...heart.symmetry,
          betweenLobes: !heart.symmetry.betweenLobes
        }
      }));
    },

    // Toggle symmetry within lobe
    toggleWithinLobeSymmetry: () => {
      update(heart => ({
        ...heart,
        symmetry: {
          ...heart.symmetry,
          withinLobe: !heart.symmetry.withinLobe
        }
      }));
    }
  };
}

export const heartStore = createHeartStore();
