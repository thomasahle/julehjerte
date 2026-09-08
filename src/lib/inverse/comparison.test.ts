import { describe, expect, it } from 'vitest';
import { comparisonPixels, DIFFERENCE_COLOURS } from './comparison';

describe('artwork comparison', () => {
  const original = Uint8Array.of(0, 1, 1, 0), woven = Uint8Array.of(0, 1, 0, 1);
  const colours: [string, string] = ['#ffffff', '#bd1111'];
  it('highlights only differing pixels and distinguishes missing from added colour', () => {
    const r = comparisonPixels(original, woven, 2, colours, 'difference');
    expect(r.mismatches).toBe(2);
    expect(r.fraction).toBe(0.5);
    expect([...r.pixels.slice(8, 12)]).toEqual([...DIFFERENCE_COLOURS.originalOnly, 255]);
    expect([...r.pixels.slice(12, 16)]).toEqual([...DIFFERENCE_COLOURS.weaveOnly, 255]);
    expect(original).toEqual(Uint8Array.of(0, 1, 1, 0));
  });
  it('overlay endpoints reproduce each image exactly, including the selected paper colours', () => {
    for (const [blend, mask] of [[0, original], [1, woven]] as const) {
      const r = comparisonPixels(original, woven, 2, colours, 'overlay', blend);
      mask.forEach((v, i) => expect([...r.pixels.slice(i * 4, i * 4 + 4)]).toEqual(v ? [189, 17, 17, 255] : [255, 255, 255, 255]));
    }
    const mid = comparisonPixels(original, woven, 2, colours, 'overlay', 0.5);
    expect([...mid.pixels.slice(8, 12)]).toEqual([222, 136, 136, 255]);
  });
  it('excludes unobserved pixels from the error and does not claim zero error without observations', () => {
    const r = comparisonPixels(original, woven, 2, colours, 'difference', 0.5, Uint8Array.of(1, 1, 0, 1));
    expect(r.observed).toBe(3);
    expect(r.mismatches).toBe(1);
    expect(r.fraction).toBe(1 / 3);
    expect([...r.pixels.slice(8, 12)]).toEqual([...DIFFERENCE_COLOURS.unobserved, 255]);
    expect(comparisonPixels(original, woven, 2, colours, 'difference', 0.5, new Uint8Array(4)).fraction).toBeNull();
  });
  it('rejects misaligned grids instead of drawing a misleading overlay', () => {
    expect(() => comparisonPixels(original, new Uint8Array(9), 2, colours, 'difference')).toThrow('same square');
    expect(() => comparisonPixels(original, woven, 2, colours, 'difference', 0.5, new Uint8Array(3))).toThrow('same square');
  });
});
