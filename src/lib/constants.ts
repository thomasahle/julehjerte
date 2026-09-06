/**
 * Core layout constants for the heart canvas and rendering system.
 * These values are used throughout the application for consistent sizing.
 */

/** Width of each strip in the woven heart pattern (in pixels) */
export const STRIP_WIDTH = 75;

/** Base canvas size for heart rendering (in pixels) */
export const BASE_CANVAS_SIZE = 600;

/** Center coordinate of the base canvas */
export const BASE_CENTER = BASE_CANVAS_SIZE / 2;

/** Default center point as a Vec-like object */
export const CENTER = { x: BASE_CENTER, y: BASE_CENTER } as const;

/** Minimum allowed grid size for heart designs */
export const MIN_GRID_SIZE = 2;

/**
 * Maximum allowed grid size (strips per lobe) for heart designs.
 * Single source of truth for every grid clamp; the editor hints that more than
 * PRECISION_GRID_SIZE strips are hard to cut and weave accurately.
 */
export const MAX_GRID_SIZE = 12;

/** Strip counts above this are still allowed but need very precise cutting. */
export const PRECISION_GRID_SIZE = 8;
