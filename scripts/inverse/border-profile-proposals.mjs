/** Experimental routing proposals, not production preprocessing or labels.
 * Fit opposite boundary profiles jointly without modifying the image reference.
 * Balanced endpoints are only a necessary condition: every resulting trace
 * still needs image, feature, routing, geometry and paper validation.
 */

import { alternatingRuns } from '../../static/inverse/core/direct/initialize.js';

const compareCost = (a, b) => Math.round(a * 1e10) - Math.round(b * 1e10);

/** Minimum expected pixel disagreement for alternating binary runs, for both
 * phases and each positive transition count. Prefix costs plus a running
 * minimum give O(n * maximumCount), including minimum outer-edge spacing.
 * Equal-cost segmentations retain the earliest preceding transition.
 */
export function fitBoundaryProfile(profile, minimumPixels, maximumCount = 16) {
  const n = profile.length;
  if (!Number.isInteger(n) || n < 2 || n > 2048 ||
      !Array.from(profile).every(p => Number.isFinite(p) && p >= 0 && p <= 1)) {
    throw new Error('Expected 2–2048 finite boundary probabilities between zero and one.');
  }
  if (!Number.isInteger(minimumPixels) || minimumPixels < 1 ||
      !Number.isInteger(maximumCount) || maximumCount < 1 || maximumCount > 16) {
    throw new Error('Expected positive integer strip spacing and 1–16 transitions.');
  }
  const limit = Math.min(maximumCount, Math.floor(n / minimumPixels) - 1);
  if (limit < 1) return [];
  const prefix = [new Float64Array(n + 1), new Float64Array(n + 1)];
  for (let i = 0; i < n; i++) {
    prefix[0][i + 1] = prefix[0][i] + profile[i];
    prefix[1][i + 1] = prefix[1][i] + 1 - profile[i];
  }
  const results = [];
  for (let phase = 0; phase < 2; phase++) {
    let previous = new Float64Array(n + 1).fill(Infinity);
    previous[0] = 0;
    const backs = [];
    for (let runs = 1; runs <= limit + 1; runs++) {
      const cost = prefix[phase ^ ((runs - 1) % 2)];
      const next = new Float64Array(n + 1).fill(Infinity);
      const back = new Int32Array(n + 1).fill(-1);
      let best = Infinity, at = -1;
      for (let end = minimumPixels; end <= n; end++) {
        const start = end - minimumPixels, candidate = previous[start] - cost[start];
        if (Number.isFinite(candidate) && (!Number.isFinite(best) || compareCost(candidate, best) < 0)) {
          best = candidate; at = start;
        }
        next[end] = cost[end] + best; back[end] = at;
      }
      backs.push(back); previous = next;
      if (runs === 1 || !Number.isFinite(next[n])) continue;
      const mask = new Uint8Array(n), transitions = [];
      let end = n;
      for (let k = runs - 1; k >= 0; k--) {
        const start = backs[k][end];
        mask.fill(phase ^ (k % 2), start, end);
        if (start) transitions.push(start);
        end = start;
      }
      results.push({ count: runs - 1, phase, cost: next[n], transitions: transitions.reverse(), mask });
    }
  }
  return results;
}

/** Enumerate a small portfolio of border-only initialization masks. Opposite
 * sides share transition counts; their starting colors must agree at all four
 * corners. Count and corner phase are chosen jointly, rather than repairing
 * a single edge while freezing an already-inconsistent perpendicular pair.
 * The original interior and the caller's mask are untouched.
 */
export function proposeBoundaryProfiles(mask, n, width, minimumWidth, {
  maximumCount = 16, editRadius = Math.min(3, .08 * width),
  profileStart = Math.min(1, .04 * width), profileEnd = Math.min(4, .16 * width), limit = 8,
} = {}) {
  if (!Number.isInteger(n) || n < 4 || n > 2048 || mask.length !== n * n ||
      !mask.every(p => p === 0 || p === 1)) throw new Error('Expected a square binary mask, 4–2048 pixels per side.');
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(minimumWidth) || minimumWidth <= 0 ||
      !Number.isFinite(editRadius) || editRadius <= 0 || editRadius > Math.min(3, .08 * width) ||
      !Number.isFinite(profileStart) || !Number.isFinite(profileEnd) || profileStart < 0 ||
      profileEnd < profileStart || profileEnd > .16 * width) throw new Error('Invalid physical strip spacing or bounded border/profile radii.');
  if (!Number.isInteger(maximumCount) || maximumCount < 1 || maximumCount > 16 ||
      !Number.isInteger(limit) || limit < 1 || limit > 8) throw new Error('Use 1–16 transitions and at most eight proposals.');
  const minimum = Math.ceil(minimumWidth * n / width), depth = Math.floor(editRadius * n / width);
  if (!depth || minimum * 2 > n) return [];
  const start = Math.floor(profileStart * n / width), end = Math.floor(profileEnd * n / width), fits = [];
  for (let side = 0; side < 4; side++) {
    const profile = new Float64Array(n);
    for (let t = 0; t < n; t++) {
      let sum = 0;
      for (let k = start; k <= end; k++) {
        const x = side % 2 ? (side === 1 ? n - 1 - k : k) : t;
        const y = side % 2 ? t : side === 0 ? k : n - 1 - k;
        sum += mask[y * n + x];
      }
      profile[t] = sum / (end - start + 1);
    }
    fits.push(new Map(fitBoundaryProfile(profile, minimum, maximumCount).map(f => [f.count + ':' + f.phase, f])));
  }
  const ranked = [];
  for (let a = 1; a <= maximumCount; a++) for (let b = 1; b <= maximumCount; b++) for (let phase = 0; phase < 2; phase++) {
    const counts = [a, b, a, b], phases = [phase, phase ^ (a % 2), phase ^ (b % 2), phase];
    const profiles = counts.map((count, side) => fits[side].get(count + ':' + phases[side]));
    if (profiles.some(p => !p)) continue;
    ranked.push({ cost: profiles.reduce((sum, p) => sum + p.cost, 0), counts: [a, b], phase, profiles });
  }
  // Refer ties to an observed color so swapping the two papers commutes.
  const anchor = mask[0];
  ranked.sort((a, b) => compareCost(a.cost, b.cost) ||
    a.counts[0] + a.counts[1] - b.counts[0] - b.counts[1] ||
    a.counts[0] - b.counts[0] || (a.phase ^ anchor) - (b.phase ^ anchor));
  return ranked.slice(0, limit).map(item => {
    const out = Uint8Array.from(mask);
    let changed = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const distances = [y, n - 1 - x, n - 1 - y, x], distance = Math.min(...distances);
      if (distance >= depth) continue;
      const side = distances.indexOf(distance), i = y * n + x;
      out[i] = item.profiles[side].mask[side % 2 ? y : x];
      changed += out[i] !== mask[i];
    }
    return { mask: out, metadata: {
      method: 'joint-minimum-run-boundary-profiles', initializationOnly: true,
      counts: item.counts, phase: item.phase, expectedProfileMismatch: item.cost,
      transitions: item.profiles.map(p => p.transitions), minimumPixels: minimum,
      changedPixels: changed, changeFraction: changed / mask.length,
      editRadiusMm: editRadius, editedBandWidthMm: depth * width / n, depthPixels: depth,
      profileStartMm: profileStart, profileEndMm: profileEnd,
    } };
  });
}

/** Experimental alternative to extruding one edge profile. Start inside the
 * bounded band and fit each row outward, penalizing transition jumps from the
 * preceding row. This can remove a narrow fringe all the way to its inward end
 * instead of turning it into an enclosed notch. Counts/phase still come only
 * from image evidence. Neither this mask nor its inferred counts are labels.
 *
 * The prior is deliberately soft: steep real cuts may move, and every candidate
 * still requires independent checks against the unmodified source. This is not
 * production preprocessing. The wider band follows the existing experimental
 * border-seed bound of eight percent, capped here at eight millimeters.
 */
export function proposeSmoothBoundaryProfiles(mask, n, width, minimumWidth, {
  limit = 3, depthMm = Math.min(8, .08 * width), rowPriorWeight = 100,
} = {}) {
  if (!Number.isFinite(depthMm) || depthMm <= 0 || depthMm > Math.min(8, .08 * width) ||
      !Number.isFinite(rowPriorWeight) || rowPriorWeight < 0 || rowPriorWeight > 1000) {
    throw new Error('Use a bounded positive border depth and a finite row prior between zero and 1000.');
  }
  const seeds = proposeBoundaryProfiles(mask, n, width, minimumWidth, { limit });
  const depth = Math.floor(depthMm * n / width), minimum = Math.ceil(minimumWidth * n / width);
  if (!depth || !seeds.length) return [];
  const read = (side, k) => Float64Array.from({ length: n }, (_, t) =>
    mask[side === 0 ? k * n + t : side === 1 ? t * n + n - 1 - k :
      side === 2 ? (n - 1 - k) * n + t : t * n + k]);
  const inner = Array.from({ length: 4 }, (_, side) => new Map(
    fitBoundaryProfile(read(side, depth), minimum).map(f => [f.count + ':' + f.phase, f])));
  return seeds.map(seed => {
    const [a, b] = seed.metadata.counts, p = seed.metadata.phase;
    const counts = [a, b, a, b], phases = [p, p ^ (a % 2), p ^ (b % 2), p];
    const profiles = Array.from({ length: 4 }, () => []);
    for (let side = 0; side < 4; side++) {
      let prior = inner[side].get(counts[side] + ':' + phases[side]).transitions.map(t => t / n);
      for (let k = depth - 1; k >= 0; k--) {
        const cuts = alternatingRuns(read(side, k), counts[side], phases[side], prior,
          { minimum, weight: rowPriorWeight });
        prior = cuts;
        const row = new Uint8Array(n);
        let color = phases[side], start = 0;
        for (const end of [...cuts.map(t => Math.round(t * n)), n]) {
          row.fill(color, start, end); color ^= 1; start = end;
        }
        profiles[side][k] = row;
      }
    }
    const out = mask.slice();
    let changed = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const distances = [y, n - 1 - x, n - 1 - y, x], k = Math.min(...distances);
      if (k >= depth) continue;
      const side = distances.indexOf(k), i = y * n + x;
      out[i] = profiles[side][k][side % 2 ? y : x];
      changed += out[i] !== mask[i];
    }
    return { mask: out, metadata: { ...seed.metadata,
      method: 'smooth-row-wise-minimum-run-border', rowPriorWeight,
      profileTransitions: seed.metadata.transitions,
      transitions: profiles.map(rows => Array.from({ length: n - 1 }, (_, i) => i + 1)
        .filter(i => rows[0][i] !== rows[0][i - 1])),
      editRadiusMm: depthMm, editedBandWidthMm: depth * width / n, depthPixels: depth,
      changedPixels: changed, changeFraction: changed / mask.length,
    } };
  });
}
