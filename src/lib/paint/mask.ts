/**
 * The paint mode's two-colour mask of the woven square.
 *
 * The mask is the engine's own resolution (400 × 400 cells) so nothing is lost
 * on the way in or out: value 0 is the left lobe's paper colour, 1 the right
 * lobe's, the same convention the engine's `prepared.mask` uses.
 */

/** Cells per side. The engine solves at this resolution, so the mask matches it. */
export const MASK_SIZE = 400;

/** Row-major cells, indexed `y * size + x`, each 0 or 1. */
export type Mask = { size: number; data: Uint8Array };

export function createMask(fill: 0 | 1 = 0): Mask {
  const data = new Uint8Array(MASK_SIZE * MASK_SIZE);
  if (fill) data.fill(1);
  return { size: MASK_SIZE, data };
}

export function cloneMask(m: Mask): Mask {
  return { size: m.size, data: new Uint8Array(m.data) };
}

export function isEmpty(m: Mask): boolean {
  return !m.data.some((v) => v !== 0);
}

/**
 * Nearest-neighbour resample of a square mask buffer. The engine may answer at a
 * lower resolution than ours, and a mask has no meaningful in-between value, so
 * interpolation would only invent colours that are not on the paper.
 */
export function resample(data: Uint8Array, from: number, to: number): Uint8Array {
  if (from === to) return new Uint8Array(data);
  const out = new Uint8Array(to * to);
  for (let y = 0; y < to; y++) {
    const sy = Math.min(from - 1, Math.floor(((y + 0.5) * from) / to));
    for (let x = 0; x < to; x++) {
      const sx = Math.min(from - 1, Math.floor(((x + 0.5) * from) / to));
      out[y * to + x] = data[sy * from + sx]!;
    }
  }
  return out;
}
