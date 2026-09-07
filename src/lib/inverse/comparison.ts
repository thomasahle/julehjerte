export const DIFFERENCE_COLOURS = {
  originalOnly: [192, 38, 145],
  weaveOnly: [0, 122, 143],
  unobserved: [218, 223, 225],
} as const;

/** Compare aligned sample grids, preserving the report's observed-pixel rule. */
export function comparisonPixels(
  original: Uint8Array,
  woven: Uint8Array,
  resolution: number,
  colours: [string, string],
  mode: 'difference' | 'overlay',
  blend = 0.5,
  valid?: Uint8Array,
) {
  if (!Number.isInteger(resolution) || resolution < 1 || original.length !== resolution ** 2 || woven.length !== original.length || (valid && valid.length !== original.length)) {
    throw new Error('Comparison images must use the same square pixel grid.');
  }
  const palette = colours.map(c => {
    if (!/^#[0-9a-f]{6}$/i.test(c)) throw new Error('Expected a six-digit paper colour.');
    return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  });
  const mix = Number.isFinite(blend) ? Math.max(0, Math.min(1, blend)) : 0.5;
  const pixels = new Uint8ClampedArray(original.length * 4);
  let mismatches = 0, observed = 0;
  for (let i = 0; i < original.length; i++) {
    const a = Number(Boolean(original[i])), b = Number(Boolean(woven[i]));
    const visible = !valid || Boolean(valid[i]);
    if (visible) { observed++; mismatches += Number(a !== b); }
    let rgb: readonly number[];
    if (!visible) rgb = DIFFERENCE_COLOURS.unobserved;
    else if (mode === 'overlay') rgb = palette[a].map((v, k) => v * (1 - mix) + palette[b][k] * mix);
    else if (a !== b) rgb = a ? DIFFERENCE_COLOURS.originalOnly : DIFFERENCE_COLOURS.weaveOnly;
    else rgb = a ? [89, 105, 111] : [248, 250, 250];
    pixels.set(rgb, i * 4);
    pixels[i * 4 + 3] = 255;
  }
  return { pixels, mismatches, observed, fraction: observed ? mismatches / observed : null };
}
