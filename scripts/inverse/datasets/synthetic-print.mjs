/** Decorative ink changes appearance, never the identity or outline of a sheet.
 * Coordinates are on the planar paper before the camera homography. The second
 * sheet uses the transposed frame; cuts do not reset the repeating print.
 */
const KINDS = new Set(['stripes', 'dots', 'flowers']);
const KEYS = new Set(['kind', 'period', 'angle', 'phase', 'width', 'opacity', 'ink']);

export function checkedPaperPrints(value) {
  if (!Array.isArray(value) || value.length !== 2) throw new Error('paperPrints requires two sheet definitions or nulls.');
  return [0, 1].map(index => {
    const v = value[index];
    if (v === null) return null;
    if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v)) || Reflect.ownKeys(v).some(k => !KEYS.has(k))) throw new Error('Invalid paper print definition.');
    if (!KINDS.has(v.kind)) throw new Error('Unknown paper print kind.');
    for (const [key, lo, hi] of [['period', 4, 40], ['angle', -Math.PI, Math.PI], ['width', .1, .5], ['opacity', 0, 1]]) {
      if (!Number.isFinite(v[key]) || v[key] < lo || v[key] > hi) throw new Error(`Invalid paper print ${key}.`);
    }
    if (!Array.isArray(v.phase) || v.phase.length !== 2 || [0, 1].some(i => !Number.isFinite(v.phase[i]) || v.phase[i] < 0 || v.phase[i] >= 1)) throw new Error('Invalid paper print phase.');
    if (!Array.isArray(v.ink) || v.ink.length !== 3 || [0, 1, 2].some(i => !Number.isFinite(v.ink[i]) || v.ink[i] < 0 || v.ink[i] > 255)) throw new Error('Invalid paper print ink.');
    return { kind: v.kind, period: v.period, angle: v.angle, phase: v.phase.slice(), width: v.width, opacity: v.opacity, ink: v.ink.slice() };
  });
}

// One smooth transition prevents a print pixel from being an arbitrary hard
// sampling decision; the whole photograph still receives its normal blur/JPEG.
const coverage = (distance, boundary) => Math.max(0, Math.min(1, (boundary - distance) / .035 + .5));
export function printAlpha([x, y], spec) {
  if (!spec || spec.opacity === 0) return 0;
  const c = Math.cos(spec.angle), s = Math.sin(spec.angle);
  const u = (c * x + s * y) / spec.period + spec.phase[0], v = (-s * x + c * y) / spec.period + spec.phase[1];
  const a = u - Math.round(u), b = v - Math.round(v);
  if (spec.kind === 'stripes') return spec.opacity * coverage(Math.abs(a), spec.width / 2);
  const radius = Math.hypot(a, b);
  if (spec.kind === 'dots') return spec.opacity * coverage(radius, spec.width / 2);
  const petalRadius = spec.width * (.65 + .35 * Math.cos(5 * Math.atan2(b, a)));
  return spec.opacity * coverage(radius, petalRadius);
}

export function printedPaperColors(point, palette, prints) {
  if (!prints) return palette;
  return palette.map((base, index) => {
    const spec = prints[index], alpha = printAlpha(index ? [point[1], point[0]] : point, spec);
    return alpha === 0 ? base : base.map((channel, k) => (1 - alpha) * channel + alpha * spec.ink[k]);
  });
}
