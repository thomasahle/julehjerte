/** The outline the exact search reads from a picture: its mask traced by the
 * engine's own tracer (every checkerboard corner of the pixels a touching),
 * with the border band stabilised first: an import's crop leaves strips of the
 * other colour along the edges, which would otherwise be outline there. */
import {prepareMaskTrace} from '../input.js';

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

/** A raster target's traced outline, as a target with vector curves, or null. */
export function rasterOutline(target, cfg, {tolerance = .35, smoothRadius = 0, borderRadius = 1} = {}) {
  const source = target.sourceImage;
  if (!source?.mask || !source.resolution) return null;
  const mask = withoutSlivers(source.mask, source.resolution);
  const trace = prepareMaskTrace(mask, source.resolution, {...cfg, width: target.width, maxSpan: 40, smoothRadius, snapRadius: 0,
    borderRadius, polygonal: false, mixedBoundaries: true});
  const traced = trace(tolerance).target;
  return traced.curves.length ? {...traced, sourceImage: source, metadata: {...target.metadata, ...traced.metadata}} : null;
}
