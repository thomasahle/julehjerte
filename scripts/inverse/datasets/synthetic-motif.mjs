/** Construct one closed radial motif with four exactly shared approach cuts.
 * This is a source of offline witness geometry, never an inverse-fit hint. */
import { Cubic } from '../../../static/inverse/core/bezier.js';

const reverse = path => path.toReversed().map(c => c.toReversed());
export function radialMotif(rng) {
  const between = (a, b) => a + (b - a) * rng();
  const lobes = 3 + Math.floor(rng() * 6), angular = rng() < .5;
  const radius = between(21, 27), amplitude = between(.06, angular ? .3 : .2);
  const rotation = between(0, 2 * Math.PI), center = [between(48, 52), between(48, 52)];
  const scale = [between(.88, 1.08), between(.88, 1.08)];
  const start = -3 * Math.PI / 4, quarter = Math.PI / 2;
  const at = angle => {
    const r = radius * (1 + amplitude * Math.cos(lobes * angle + rotation));
    const dr = -radius * amplitude * lobes * Math.sin(lobes * angle + rotation);
    const c = Math.cos(angle), s = Math.sin(angle);
    return {
      point: [center[0] + scale[0] * r * c, center[1] + scale[1] * r * s],
      tangent: [scale[0] * (dr * c - r * s), scale[1] * (dr * s + r * c)]
    };
  };
  let arcs;
  if (angular) {
    // Polygon vertices alternate radial maxima/minima. Split the actual line
    // at quadrant rays; sampling the polar function there would change it.
    const step = Math.PI / lobes, first = -rotation / lobes;
    const vertex = i => at(first + i * step).point;
    const ray = angle => {
      const index = Math.floor((angle - first) / step), a = vertex(index), b = vertex(index + 1);
      const direction = [Math.cos(angle) * scale[0], Math.sin(angle) * scale[1]];
      const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
      const t = cross([center[0] - a[0], center[1] - a[1]], direction) /
        cross([b[0] - a[0], b[1] - a[1]], direction);
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    };
    const joins = Array.from({ length: 4 }, (_, i) => ray(start + i * quarter));
    arcs = joins.map((join, q) => {
      const lo = start + q * quarter, hi = lo + quarter, anchors = [join];
      for (let i = Math.floor((lo - first) / step) + 1; first + i * step < hi - 1e-10; i++) {
        if (first + i * step > lo + 1e-10) anchors.push(vertex(i));
      }
      anchors.push(joins[(q + 1) % 4]);
      return anchors.slice(1).map((p, i) => Cubic.line(anchors[i], p).p);
    });
  } else {
    // Hermite cubics define the actual label. The analytic radial function is
    // used only to construct it, not claimed as the exact rendered boundary.
    const count = 2 * lobes, step = quarter / count;
    const joins = Array.from({ length: 4 }, (_, i) => at(start + i * quarter));
    arcs = joins.map((join, q) => Array.from({ length: count }, (_, i) => {
      const a = i === 0 ? join : at(start + q * quarter + i * step);
      const b = i === count - 1 ? joins[(q + 1) % 4] : at(start + q * quarter + (i + 1) * step);
      return [a.point, a.point.map((v, k) => v + a.tangent[k] * step / 3),
        b.point.map((v, k) => v - b.tangent[k] * step / 3), b.point];
    }));
  }
  const half = radius * (1 + amplitude) * Math.max(...scale) + between(3, 5);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(p => p.map((v, k) => center[k] + v * half));
  const approaches = corners.map((p, q) => Cubic.line(p, arcs[q][0][0]).p);
  const path = (a, b, arc, family) => {
    const first = corners[a].slice(), last = corners[b].slice();
    first[1 - family] = 0; last[1 - family] = 100;
    return [Cubic.line(first, corners[a]).p, approaches[a], ...arc,
      approaches[b].toReversed(), Cubic.line(corners[b], last).p];
  };
  return {
    paths: [[path(0, 3, reverse(arcs[3]), 0), path(1, 2, arcs[1], 0)],
      [path(0, 1, arcs[0], 1), path(3, 2, reverse(arcs[2]), 1)]],
    parameters: { counts: [2, 2], style: angular ? 'polygonal-radial-motif' : 'smooth-radial-motif',
      lobes, radius, amplitude, rotation, center, scale, gridHalfExtent: half }
  };
}
