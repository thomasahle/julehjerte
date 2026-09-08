import { describe, it, expect } from 'vitest';
import type { HeartDesign } from '$lib/types/heart';
import { getGalleryDesign } from '$lib/data/heartDesigns';
import { rasterizeDesign, maskMismatch } from '$lib/paint/rasterize';
import { MASK_SIZE } from '$lib/paint/mask';
import { cutGeometryToDesign, type CutGeometry } from '$lib/inverse/toHeartDesign';
import julSolution from '../../../static/inverse/examples/jul.saved.json';

function rows(mask: { size: number; data: Uint8Array }): string[] {
  const out: string[] = [];
  for (let y = 0; y < mask.size; y++) {
    out.push(Array.from(mask.data.slice(y * mask.size, (y + 1) * mask.size)).join(''));
  }
  return out;
}

function galleryDesign(id: string): HeartDesign {
  const design = getGalleryDesign(id);
  if (!design) throw new Error(`Missing gallery design ${id}`);
  return design;
}

describe('rasterizeDesign', () => {
  it('draws the classic 3×3 as a checkerboard with the left lobe on top', () => {
    const design = galleryDesign('classic-3x3');
    expect(design.gridSize).toEqual({ x: 3, y: 3 });
    // weaveParity 0 means the top-left cell shows the left lobe, which is the
    // mask's 0. Cells alternate from there.
    expect(rows(rasterizeDesign(design, 3))).toEqual(['010', '101', '010']);
  });

  it('flips the whole checkerboard with the weave parity', () => {
    const design = { ...galleryDesign('classic-3x3'), weaveParity: 1 as const };
    expect(rows(rasterizeDesign(design, 3))).toEqual(['101', '010', '101']);
  });

  it('scales the same weave to any grid', () => {
    const design = galleryDesign('classic-3x3');
    const fine = rasterizeDesign(design, 60);
    // Twenty mask cells per woven cell, so each block is uniform and the blocks
    // repeat the 3 × 3 pattern.
    for (let by = 0; by < 3; by++) {
      for (let bx = 0; bx < 3; bx++) {
        const expected = (bx + by) % 2 === 0 ? 0 : 1;
        for (const [dy, dx] of [
          [2, 2],
          [10, 10],
          [17, 17]
        ]) {
          expect(fine.data[(by * 20 + dy) * 60 + bx * 20 + dx]).toBe(expected);
        }
      }
    }
  });

  it('defaults to the mask resolution and leaves a heart with no fingers blank', () => {
    const empty: HeartDesign = { id: '', name: '', author: '', gridSize: { x: 3, y: 3 }, fingers: [] };
    const mask = rasterizeDesign(empty);
    expect(mask.size).toBe(MASK_SIZE);
    expect(mask.data.some((v) => v !== 0)).toBe(false);
  });

  it('draws the gallery jul and the engine`s jul as the same picture', () => {
    // The gallery heart was drawn by hand and the engine solved for the same
    // lettering, so the two are not identical — but if the rasteriser or the
    // converter had the frame wrong they would not be close either.
    const gallery = rasterizeDesign(galleryDesign('jul'), 200);
    const converted = rasterizeDesign(
      cutGeometryToDesign(julSolution as unknown as CutGeometry, { name: 'jul' }),
      200
    );
    expect(maskMismatch(gallery.data, converted.data)).toBeLessThan(0.03);
  });

  it('follows the curves, not their chords', () => {
    // `ramme` has deeply curved fingers. Flattening them as straight chords
    // would move the weave far more than the quarter-cell the rasteriser allows.
    const design = galleryDesign('ramme');
    const chords: HeartDesign = {
      ...design,
      fingers: design.fingers.map((f) => ({
        ...f,
        segments: f.segments.map((s) => ({
          p0: s.p0,
          p1: { x: s.p0.x + (s.p3.x - s.p0.x) / 3, y: s.p0.y + (s.p3.y - s.p0.y) / 3 },
          p2: { x: s.p0.x + ((s.p3.x - s.p0.x) * 2) / 3, y: s.p0.y + ((s.p3.y - s.p0.y) * 2) / 3 },
          p3: s.p3
        }))
      }))
    };
    expect(maskMismatch(rasterizeDesign(design, 200).data, rasterizeDesign(chords, 200).data)).toBeGreaterThan(
      0.01
    );
  });
});

describe('maskMismatch', () => {
  it('counts the differing cells', () => {
    expect(maskMismatch(new Uint8Array([0, 1, 0, 1]), new Uint8Array([0, 1, 1, 1]))).toBe(0.25);
    expect(() => maskMismatch(new Uint8Array(4), new Uint8Array(9))).toThrow();
  });
});
