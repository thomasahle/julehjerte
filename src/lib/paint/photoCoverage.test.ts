import { describe, expect, it } from 'vitest';
import { prepare } from '$inverse/core/engine.js';
import { maskToArtwork } from '$lib/inverse/engine';
import { resetSession, restore, serialize, session, setMask } from '$lib/editor/session.svelte';
import { maskFromPrepared } from './importImage';
import { cloneMask, createMask, maskMismatch } from './mask';
import { stampCircle, rect, floodFill, applySymmetric, applySymmetricEdit } from './tools';
import { lift, commit, moveBy } from './selection';
import { symmetrize, detectSymmetry, NO_SYMMETRY } from './symmetry';
import { createHistory, record, undo, redo } from './history';

const partial = (size = 6) => ({ ...createMask(0, size), validMask: new Uint8Array(size * size) });

describe('photographic observation through editing and solving', () => {
  it('keeps clipped source coverage through photo preparation, import, and binary solver handoff', () => {
    const n = 64, rgba = new Uint8ClampedArray(n * n * 4);
    for (let i = 0; i < n * n; i++) { rgba.fill(i % n < 32 ? 100 : 120, 4 * i, 4 * i + 3); rgba[4 * i + 3] = 255; }
    const prepared = prepare({ type: 'pixels', rgba, imageWidth: n, imageHeight: n, quad: [[0, 0], [128, 0], [128, 128], [0, 128]] }, { algorithm: 'direct', mode: 'auto' });
    const mask = maskFromPrepared(prepared.preview), input = maskToArtwork(mask);
    expect(mask.validMask?.reduce((s, v) => s + v, 0)).toBe(200 * 200);
    expect(mask.size).toBe(400);
    expect(input.resolution).toBe(n);
    expect(input.validMask).toEqual(prepared.preview.validMask);
    expect(input.validMask).not.toBe(mask.sourceRaster?.validMask);
    const roundTrip = prepare(input, { algorithm: 'direct' });
    expect(roundTrip.target.sourceImage.validMask).toEqual(prepared.preview.validMask);
    expect(roundTrip.preview.mask).toEqual(prepared.preview.mask);
  });

  it('same-colour brush, rectangle and flood fill make only their cells known', () => {
    const mask = partial(), before = cloneMask(mask);
    expect(stampCircle(mask, 2, 2, { radius: 0, value: 0 })).toEqual({ x0: 2, y0: 2, x1: 3, y1: 3 });
    expect(mask.validMask[14]).toBe(1); expect(before.validMask?.[14]).toBe(0);
    rect(mask, { x: 4, y: 0 }, { x: 5, y: 1 }, 0);
    expect(mask.validMask.reduce((s, v) => s + v, 0)).toBe(5);
    const separated = partial();
    for (let y = 0; y < 6; y++) separated.data[y * 6 + 3] = 1;
    expect(floodFill(separated, 0, 0, 0)).toEqual({ x0: 0, y0: 0, x1: 3, y1: 6 });
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) expect(separated.validMask[y * 6 + x]).toBe(Number(x < 3));
    expect(floodFill(separated, 0, 0, 0)).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
  });

  it('moves uncertainty with the selected patch while observing the explicitly cleared source', () => {
    const mask = partial(); mask.validMask.fill(1); mask.data[0] = 1; mask.validMask[1] = 0; mask.validMask[6] = 0;
    const selection = lift(mask, { x0: 0, y0: 0, x1: 2, y1: 2 })!;
    selection.placement = moveBy(selection.placement, 3, 3);
    const edit = commit(mask, selection);
    for (const i of [0, 1, 6, 7]) expect(mask.validMask[i]).toBe(1);
    expect([21, 22, 27, 28].map(i => mask.validMask[i])).toEqual([1, 0, 0, 1]);
    applySymmetricEdit(mask, edit.box, edit.marks, ['transpose']);
    expect([21, 22, 27, 28].map(i => mask.validMask[i])).toEqual([1, 0, 0, 1]);
  });

  it('keeps inferred symmetry separate from observed pixels and explicit mirrored painting', () => {
    const mask = partial(); mask.data[1] = 1; mask.validMask[1] = 1;
    symmetrize(mask, ['transpose']);
    expect(mask.data[6]).toBe(1); expect(mask.validMask[6]).toBe(0);
    expect(detectSymmetry(mask)).toEqual(NO_SYMMETRY);
    const box = stampCircle(mask, 2, 1, { radius: 0, value: 1 });
    applySymmetric(mask, box, ['transpose'], 1);
    expect(mask.validMask[8]).toBe(1); expect(mask.validMask[13]).toBe(1);
  });

  it('undo and redo own both colour and observation state', () => {
    const mask = partial(), history = createHistory();
    record(history, { mask, symmetry: NO_SYMMETRY }); stampCircle(mask, 2, 2, { radius: 0, value: 0 });
    const previous = undo(history, { mask, symmetry: NO_SYMMETRY })!;
    expect(previous.mask.validMask?.[14]).toBe(0);
    const next = redo(history, previous)!; expect(next.mask.validMask?.[14]).toBe(1);
    mask.validMask.fill(0); expect(next.mask.validMask?.[14]).toBe(1);
  });

  it('persists observation independently, accepts old saves, and rejects malformed new saves atomically', () => {
    resetSession(); const mask = partial(); mask.validMask[14] = 1;
    setMask(mask, { symmetry: NO_SYMMETRY }); const saved = serialize();
    expect(saved.mask?.observed).toBeTypeOf('string'); resetSession(); expect(restore(saved)).toBe(true);
    expect(session.mask?.validMask).toEqual(mask.validMask); expect(session.mask?.validMask).not.toBe(mask.validMask);
    expect(restore({ ...saved, mask: { ...saved.mask, observed: '?' } })).toBe(false);
    expect(session.mask?.validMask).toEqual(mask.validMask);
    expect(restore({ ...saved, mask: { size: saved.mask!.size, cells: saved.mask!.cells } })).toBe(true);
    expect(session.mask?.validMask).toBeUndefined(); resetSession();
  });

  it('reports disagreement on observed cells without diluting it with padding', () => {
    const a = Uint8Array.of(1, 0, 0, 0), b = Uint8Array.of(0, 0, 1, 1), valid = Uint8Array.of(1, 1, 0, 0);
    expect(maskMismatch(a, b, valid)).toBe(.5); expect(maskMismatch(a, b)).toBe(.75);
    expect(() => maskMismatch(a, b, new Uint8Array(4))).toThrow(/observed/);
  });
});
