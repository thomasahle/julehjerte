/** Polyline helpers for the exact-outline search (reference frame, as structure.js). */

export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Cumulative arc lengths at a polyline's vertices. */
export function cumlen(pts) {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + dist(pts[i - 1], pts[i]));
  return out;
}

/** The segment index i with cl[i] <= s <= cl[i + 1] (clamped). */
export function segmentAt(cl, s) {
  let lo = 0, hi = cl.length - 2;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cl[mid] <= s) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** The point at arc length s along a polyline. */
export function pointAt(pts, cl, s) {
  s = Math.min(Math.max(s, 0), cl.at(-1));
  if (pts.length < 2) return [...pts[0]];
  const i = segmentAt(cl, s), seg = cl[i + 1] - cl[i], f = seg > 0 ? (s - cl[i]) / seg : 0;
  return [pts[i][0] + f * (pts[i + 1][0] - pts[i][0]), pts[i][1] + f * (pts[i + 1][1] - pts[i][1])];
}

/** The polyline from arc length s0 to s1 (s0 <= s1), its vertices kept. */
export function subPolyline(pts, cl, s0, s1) {
  const mid = [];
  for (let i = 0; i < pts.length; i++) if (s0 + 1e-12 < cl[i] && cl[i] < s1 - 1e-12) mid.push(pts[i]);
  return [pointAt(pts, cl, s0), ...mid, pointAt(pts, cl, s1)];
}

/** Nearest point of segment ab to p: [distance, fraction along ab]. */
export function segmentNearest(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
  const f = len2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return [Math.hypot(p[0] - a[0] - f * dx, p[1] - a[1] - f * dy), f];
}

/** Arc length of the polyline's point nearest to p, and its distance. */
export function project(pts, cl, p) {
  let best = [Infinity, 0];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [d, f] = segmentNearest(p, pts[i], pts[i + 1]);
    if (d < best[0]) best = [d, cl[i] + f * (cl[i + 1] - cl[i])];
  }
  return {distance: best[0], arc: best[1]};
}

/** Angle in degrees between two directions (180 for a degenerate one). */
export function angle(u, v) {
  const nu = Math.hypot(u[0], u[1]), nv = Math.hypot(v[0], v[1]);
  if (nu < 1e-12 || nv < 1e-12) return 180;
  return Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (nu * nv)))) * 180 / Math.PI;
}

/** A uniform grid over points, for nearest and within-radius queries. */
export class PointGrid {
  constructor(points, cell) {
    this.points = points;
    this.cell = cell;
    this.cells = new Map();
    points.forEach((p, i) => {
      const k = this.key(Math.floor(p[0] / cell), Math.floor(p[1] / cell));
      if (!this.cells.has(k)) this.cells.set(k, []);
      this.cells.get(k).push(i);
    });
  }
  key(i, j) { return i * 100003 + j; }
  /** Indices of the points within r of p. */
  within(p, r) {
    const out = [], c = this.cell, i0 = Math.floor((p[0] - r) / c), i1 = Math.floor((p[0] + r) / c);
    const j0 = Math.floor((p[1] - r) / c), j1 = Math.floor((p[1] + r) / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const list = this.cells.get(this.key(i, j));
      if (list) for (const k of list) if (dist(this.points[k], p) <= r) out.push(k);
    }
    return out;
  }
  /** [distance, index] of the nearest point within `bound` (Infinity, -1 if none). */
  nearest(p, bound = Infinity) {
    let best = [Infinity, -1];
    const c = this.cell, ci = Math.floor(p[0] / c), cj = Math.floor(p[1] / c);
    const rings = Number.isFinite(bound) ? Math.ceil(bound / c) + 1 : 1 << 12;
    for (let ring = 0; ring <= rings; ring++) {
      if (best[1] >= 0 && (ring - 1) * c > best[0]) break;
      for (let i = ci - ring; i <= ci + ring; i++) for (let j = cj - ring; j <= cj + ring; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue;
        const list = this.cells.get(this.key(i, j));
        if (list) for (const k of list) {
          const d = dist(this.points[k], p);
          if (d < best[0] && d <= bound) best = [d, k];
        }
      }
      if (!this.cells.size) break;
    }
    return best;
  }
}
