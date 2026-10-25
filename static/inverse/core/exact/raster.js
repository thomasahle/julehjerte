/** The outline the exact search reads from a picture: its mask traced by the
 * engine's own tracer (every checkerboard corner of the pixels a touching),
 * with the border band stabilised first: an import's crop leaves strips of the
 * other colour along the edges, which would otherwise be outline there. */
import {prepareMaskTrace} from '../input.js';
import {SIZE} from './structure.js';

/** Two corners of a picture's outline this close (mm) are one touching:
 * sampled checker corners open 0.04-0.5 mm; at 0.8-1 mm a design's own gaps
 * (lilje1's petals) began to close. */
const NEAR_TOUCH_MM = .6;

/** The mask without features one pixel thin, of either colour: a pixel stays
 * only inside a 2 x 2 block of its colour (an opening, judged on the original
 * for both colours). No template can cut both sides of such a sliver, while a
 * touching survives: there each colour's corner pixel lies in a block of its
 * own region, wherever the region is two pixels wide. */
export function withoutSlivers(mask, n) {
  const out = mask.slice(), at = (x, y) => mask[y * n + x];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = at(x, y);
    let held = false;
    for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      const x0 = x + dx, y0 = y + dy;
      if (x0 < 0 || y0 < 0 || x0 + 1 >= n || y0 + 1 >= n) continue;
      if (at(x0, y0) === v && at(x0 + 1, y0) === v && at(x0, y0 + 1) === v && at(x0 + 1, y0 + 1) === v) { held = true; break; }
    }
    if (!held) out[y * n + x] = 1 - v;
  }
  return out;
}

/** The mask opened, then closed, by a disc of `radius` pixels: parts of either
 * colour narrower than its diameter go, and sharp tips round off by about its
 * radius. A cut cannot follow a tip narrower than its clearance anyway. */
export function openClose(mask, n, radius) {
  const offsets = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) if (dx * dx + dy * dy <= radius * radius) offsets.push([dx, dy]);
  // Cells whose whole disc is `colour` (outside the square counts as it), then all their discs.
  const core = (m, colour) => {
    const out = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
      out[y * n + x] = offsets.every(([dx, dy]) => { const u = x + dx, v = y + dy; return u < 0 || v < 0 || u >= n || v >= n || m[v * n + u] === colour; }) ? 1 : 0;
    return out;
  };
  const swept = inside => {
    const out = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (inside[y * n + x])
      for (const [dx, dy] of offsets) { const u = x + dx, v = y + dy; if (u >= 0 && v >= 0 && u < n && v < n) out[v * n + u] = 1; }
    return out;
  };
  const opened = swept(core(mask, 1)), zero = swept(core(opened, 0));
  return Uint8Array.from(zero, v => 1 - v);
}

/** The mask opened and closed (openClose) only within `within` pixels of
 * `spots` ([x, y] pixels), as it is elsewhere. */
export function openCloseNear(mask, n, radius, spots, within) {
  const opened = openClose(mask, n, radius), out = mask.slice();
  for (const [sx, sy] of spots) {
    for (let y = Math.max(0, Math.floor(sy - within)); y <= Math.min(n - 1, Math.ceil(sy + within)); y++)
      for (let x = Math.max(0, Math.floor(sx - within)); x <= Math.min(n - 1, Math.ceil(sx + within)); x++)
        if ((x - sx) ** 2 + (y - sy) ** 2 <= within * within) out[y * n + x] = opened[y * n + x];
  }
  return out;
}

/** A raster target's traced outline, as a target with vector curves, or null.
 * With `open`, traced from the mask opened and closed by a disc of that many
 * pixels (openClose), only within `within` pixels of `spots` when given; its
 * source stays the picture's own mask. */
export function rasterOutline(target, cfg, {tolerance = .35, smoothRadius = 0, borderRadius = 1, open = 0, spots = null, within = 0} = {}) {
  const source = target.sourceImage;
  if (!source?.mask || !source.resolution) return null;
  const n = source.resolution;
  const mask = withoutSlivers(!open ? source.mask : spots?.length ? openCloseNear(source.mask, n, open, spots, within) : openClose(source.mask, n, open), n);
  const trace = prepareMaskTrace(mask, source.resolution, {...cfg, width: target.width, maxSpan: 40, smoothRadius, snapRadius: 0,
    borderRadius, polygonal: false, mixedBoundaries: true});
  const traced = trace(tolerance).target;
  // Corners of the picture nearly touching join (exact/target.js).
  const nearTouch = NEAR_TOUCH_MM * SIZE / (cfg.width || 100);
  return traced.curves.length ? {...traced, sourceImage: source, metadata: {...target.metadata, ...traced.metadata, nearTouch}} : null;
}
