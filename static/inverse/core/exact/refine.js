/** The exact search's cuts on the picture's own edge. The search runs on the
 * outline raster.js traces, whose few curves keep it fast but run along the
 * pixels' staircase, 0.2-0.6% of a picture off its mask; a finer trace only
 * follows the staircase closer. A solution is instead redrawn on the same
 * outline with each edge moved onto the mask's sub-pixel edge: its polyline
 * cut into pixel steps and each point moved along its normal to where the
 * slightly blurred mask crosses one half. The structure stays as it was. */
import {cumlen, pointAt, project, subPolyline} from './polyline.js';
import {SIZE} from './structure.js';

/** Each edge of `outline` (exactOutline's) as a polyline on the edge of `mask`
 * (n x n, row 0 at the top): cut into steps of at most `step` pixels, each
 * point moved along its normal to where the mask blurred by `sigma` pixels
 * crosses one half, within `reach` pixels. The moves are averaged over
 * `smooth` neighbours either side, at most `most` pixels, and fade in over
 * `taper` pixels from an open edge's ends, which stay: a junction is the
 * structure's, and a sudden move beside it would bend the cut there. */
export function edgesOnMask(outline, mask, n, {sigma = .8, step = 1, reach = 1.5, most = .75, smooth = 2, taper = 4} = {}) {
  const field = blurred(mask, n, sigma), scale = n / SIZE;
  // Bilinear, cell centres at (i + .5, j + .5) in pixels; clamped at the square's sides.
  const value = (u, v) => {
    const x = Math.min(n - 1, Math.max(0, u - .5)), y = Math.min(n - 1, Math.max(0, v - .5));
    const i = Math.min(n - 2, Math.floor(x)), j = Math.min(n - 2, Math.floor(y)), fx = x - i, fy = y - j;
    return (field[j * n + i] * (1 - fx) + field[j * n + i + 1] * fx) * (1 - fy) + (field[(j + 1) * n + i] * (1 - fx) + field[(j + 1) * n + i + 1] * fx) * fy;
  };
  const toPixel = p => [p[0] * scale, (SIZE - p[1]) * scale], fromPixel = q => [q[0] / scale, SIZE - q[1] / scale];
  return outline.E.map((ed, e) => {
    const geo = outline.geo[e], L = outline.L[e], count = Math.max(1, Math.ceil(L * scale / step)), loop = Boolean(ed.loop);
    const pts = Array.from({length: count + 1}, (_, k) => toPixel(pointAt(ed.pts, geo, L * k / count)));
    const at = k => loop ? pts[((k % count) + count) % count] : pts[Math.min(count, Math.max(0, k))];
    // Each point's normal, and how far along it the mask's edge lies.
    const normals = pts.map((q, k) => {
      const prev = at(k - 1), next = at(k + 1), tx = next[0] - prev[0], ty = next[1] - prev[1], len = Math.hypot(tx, ty);
      return len ? [-ty / len, tx / len] : [0, 0];
    });
    const moves = pts.map((q, k) => {
      const [nx, ny] = normals[k];
      if (!nx && !ny) return 0;
      let best = null, last = value(q[0] - reach * nx, q[1] - reach * ny) - .5;
      const steps = Math.ceil(2 * reach / .1);
      for (let s = 1; s <= steps; s++) {
        const t = -reach + 2 * reach * s / steps, here = value(q[0] + t * nx, q[1] + t * ny) - .5;
        if ((last < 0) !== (here < 0)) {
          const t0 = t - 2 * reach / steps, cross = t0 + (t - t0) * last / (last - here);
          if (best === null || Math.abs(cross) < Math.abs(best)) best = cross;
        }
        last = here;
      }
      return best ?? 0;
    });
    const out = pts.map((q, k) => {
      let sum = 0, weight = 0;
      for (let d = -smooth; d <= smooth; d++) {
        const j = loop ? ((k + d) % count + count) % count : k + d;
        if (j < 0 || j > count) continue;
        sum += moves[j]; weight++;
      }
      const fromEnd = loop ? Infinity : Math.min(k, count - k) * L * scale / count, fade = Math.min(1, fromEnd / taper);
      const move = Math.max(-most, Math.min(most, sum / weight)) * fade * fade * (3 - 2 * fade);
      return fromPixel([q[0] + move * normals[k][0], q[1] + move * normals[k][1]]);
    });
    if (loop) out[count] = out[0];
    else { out[0] = ed.pts[0]; out[count] = ed.pts.at(-1); }
    return out;
  });
}

/** {line(e, s0, s1), point(e, s)}: arcs of `outline`'s edges drawn on `edges`
 * (one polyline per edge, edgesOnMask's), each point taken to the nearest of
 * its edge's new polyline; an open edge's ends to its ends. */
export function geometryOn(outline, edges) {
  const geo = edges.map(pts => cumlen(pts)), length = e => geo[e].at(-1);
  const arc = (e, s) => {
    if (!outline.E[e].loop && s <= 1e-12) return 0;
    if (!outline.E[e].loop && s >= outline.L[e] - 1e-12) return length(e);
    return project(edges[e], geo[e], pointAt(outline.E[e].pts, outline.geo[e], s)).arc;
  };
  const along = (e, a, b) => subPolyline(edges[e], geo[e], a, b);
  return {
    point: (e, s) => pointAt(edges[e], geo[e], arc(e, s)),
    line(e, s0, s1) {
      const a = arc(e, s0), b = arc(e, s1), L = length(e);
      if (!outline.E[e].loop) return along(e, Math.min(a, b), Math.max(a, b));
      if (s1 - s0 >= outline.L[e] - 1e-9) return [...along(e, a, L), ...along(e, 0, a).slice(1)];
      return a <= b ? along(e, a, b) : [...along(e, a, L), ...along(e, 0, b).slice(1)];
    }
  };
}

/** The mask blurred by a Gaussian of `sigma` pixels, as floats 0-1. */
function blurred(mask, n, sigma) {
  const r = Math.max(1, Math.ceil(3 * sigma)), kernel = [];
  for (let d = -r; d <= r; d++) kernel.push(Math.exp(-d * d / (2 * sigma * sigma)));
  const total = kernel.reduce((s, v) => s + v, 0), k = kernel.map(v => v / total);
  const pass = (src, dx, dy) => {
    const out = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let s = 0;
      for (let d = -r; d <= r; d++) {
        const u = Math.min(n - 1, Math.max(0, x + d * dx)), v = Math.min(n - 1, Math.max(0, y + d * dy));
        s += k[d + r] * src[v * n + u];
      }
      out[y * n + x] = s;
    }
    return out;
  };
  return pass(pass(mask, 1, 0), 0, 1);
}
