import { describe, it, expect } from 'vitest';
import { MASK_SIZE, cloneMask, createMask, isEmpty, resample } from '$lib/paint/mask';

/** A `size × size` mask whose cells are their own index, for tracing a resample. */
function counting(size: number): Uint8Array {
  return Uint8Array.from({ length: size * size }, (_, i) => i);
}

describe('createMask', () => {
  it('is a full-resolution square of the left colour by default', () => {
    const m = createMask();
    expect(m.size).toBe(MASK_SIZE);
    expect(m.data.length).toBe(MASK_SIZE * MASK_SIZE);
    expect(isEmpty(m)).toBe(true);
  });

  it('can start out all right-colour, and that is not empty', () => {
    const m = createMask(1);
    expect(isEmpty(m)).toBe(false);
    expect(m.data.every((v) => v === 1)).toBe(true);
  });

  it('calls a mask with a single painted cell not empty', () => {
    const m = createMask();
    m.data[MASK_SIZE * MASK_SIZE - 1] = 1;
    expect(isEmpty(m)).toBe(false);
  });
});

describe('cloneMask', () => {
  it('copies the cells instead of sharing them, so undo can hold a snapshot', () => {
    const m = createMask();
    const copy = cloneMask(m);
    copy.data[0] = 1;
    expect(m.data[0]).toBe(0);
    expect(copy.size).toBe(m.size);
  });
});

describe('resample', () => {
  it('hands back a copy when nothing changes size', () => {
    const data = counting(3);
    const out = resample(data, 3, 3);
    expect(Array.from(out)).toEqual(Array.from(data));
    // A copy, not the same buffer: the engine's mask must not alias ours.
    expect(out).not.toBe(data);
    out[0] = 9;
    expect(data[0]).toBe(0);
  });

  it('doubles every cell going up', () => {
    // 2 → 4: rows 0,0,1,1 and the same across, so each cell becomes a 2 × 2 block.
    const out = resample(Uint8Array.from([0, 1, 2, 3]), 2, 4);
    expect(Array.from(out)).toEqual([0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3]);
  });

  it('takes the nearest cell going down', () => {
    // 4 → 2 samples at cell centres 0.5 and 1.5 of the target, which land on
    // source rows 1 and 3 — the second and fourth, not the first and third.
    const out = resample(counting(4), 4, 2);
    expect(Array.from(out)).toEqual([5, 7, 13, 15]);
  });

  it('stays inside the source at the far edge for any ratio', () => {
    // The engine may answer at any resolution, and a rounding slip in the last
    // row would read undefined, which a Uint8Array silently stores as 0.
    for (const [from, to] of [
      [3, 7],
      [7, 3],
      [400, 200],
      [200, 400],
      [5, 5]
    ]) {
      const source = new Uint8Array(from! * from!).fill(1);
      const out = resample(source, from!, to!);
      expect(out.length).toBe(to! * to!);
      expect(out.every((v) => v === 1)).toBe(true);
    }
  });
});
