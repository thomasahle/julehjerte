import { clamp01 } from '$lib/utils/math';
import { vecDist, vecLerp } from './vec';

// Re-export clamp01 for backward compatibility
export { clamp01 };


/**
 * Calculate the distance between two points
 */
export const distance = vecDist;

/**
 * Linear interpolation between two points
 */
export const lerp = vecLerp;

/**
 * Move a point towards a target by a maximum distance
 */
