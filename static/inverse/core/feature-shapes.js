/** Raster shape measurements for search and QA, not a geometry certificate.
 * Matching source pixels alone cannot distinguish a small opening from an
 * enlarged region or a channel to the background. Measure its whole component.
 */
import {connectedComponent, components} from './input.js';
import {distanceTransform} from './material.js';
import {imageFeatures, auditImageFeatures, auditFeatureChange} from './image-features.js';
import {sourceWeights} from './image-reference.js';
import {stableInteriorFeatures} from './feature-enclosures.js';

export function smallInteriorFeatures(source, features, cfg) {
  if (!source) return [];
  const n = source.resolution, scale = cfg.width / n, weights = sourceWeights(source);
  return features.filter(
    f =>
      f.areaMm2 <= 4 * cfg.nominalWidth ** 2 &&
      f.pixels.every(pixel => {
        const x = (pixel % n) + 0.5, y = Math.floor(pixel / n) + 0.5;
        return (
          Math.min(x, y, n - x, n - y) * scale > cfg.nominalWidth &&
          (!weights || [pixel, pixel - 1, pixel + 1, pixel - n, pixel + n].every(i => weights[i] > 0))
        );
      })
  );
}

/** What the weave adds: the same check the other way round. A substantial region of the weave (as
 * imageFeatures reads one) needs most of its pixels that colour in the picture; pixel counts alone let
 * specks through (hjerte-i-hjerte-i-hjerte's fitted template: 0.4% off its mask, passing, with three
 * islands of 10 mm² its picture does not have). */
export function strayRegions(source, woven, width) {
  if (!source?.mask || woven?.length !== source.mask.length) return [];
  const seen = {
    mask: woven,
    resolution: source.resolution,
    ...(source.weights ? {weights: source.weights} : {}),
    ...(source.validMask ? {validMask: source.validMask} : {})
  };
  return auditImageFeatures(seen, source.mask, width, imageFeatures(seen, width)).missing;
}
/** Regions of the picture its weave joins: two regions of one colour (at least MERGE_AREA_MM2, border
 * ones too) more than MERGE_GAP_MM apart and not linked through nearer ones, mostly inside one region
 * of the weave once that is narrowed by MERGE_NECK_MM (a sampled cut's one-pixel seams join nothing).
 * Two hidden cuts drawn apart leave a strip of the other paper between them: a small heart joined to
 * the check beside it by 3 mm of paper (3.75 mm apart in the picture), 0.3% off its picture, passing
 * every other check. Nearer ones a weave may join on purpose: the tracer's near touchings
 * (joinNearTouchings), and a photographed checkerboard's diagonal checks, which the blur leaves up to
 * 2 mm apart where they meet. [{a, b, gapMm}], the regions' centres in mm. */
const MERGE_AREA_MM2 = 3, MERGE_NECK_MM = 0.5, MERGE_GAP_MM = 2.5;
export function mergedRegions(source, woven, width, gap = MERGE_GAP_MM) {
  if (!source?.mask || woven?.length !== source.mask.length) return [];
  const n = source.resolution,
    mm = width / n,
    mask = Uint8Array.from(source.mask, v => (v ? 1 : 0)),
    weave = Uint8Array.from(woven, v => (v ? 1 : 0)),
    out = [];
  const neck = (MERGE_NECK_MM / mm) ** 2,
    centre = pixels =>
      [0, 1].map(
        axis => (pixels.reduce((t, i) => t + (axis ? Math.floor(i / n) : i % n) + 0.5, 0) / pixels.length) * mm
      );
  for (const value of [0, 1]) {
    const mine = components(mask, n, value).filter(part => part.pixels.length * mm * mm >= MERGE_AREA_MM2);
    if (mine.length < 2) continue;
    // The weave's regions of this colour, narrowed: a pixel deeper than MERGE_NECK_MM inside one.
    const depth = distanceTransform(
        Uint8Array.from(weave, v => Number(v !== value)),
        n,
        n
      ),
      core = Uint8Array.from(depth, (d, i) => Number(weave[i] === value && d > neck));
    const comp = new Int32Array(n * n).fill(-1);
    components(core, n, 1).forEach((part, k) => {
      for (const i of part.pixels) comp[i] = k;
    });
    const home = mine.map(part => {
      const count = new Map();
      for (const i of part.pixels) if (comp[i] >= 0) count.set(comp[i], (count.get(comp[i]) || 0) + 1);
      let best = -1, most = 0;
      for (const [k, c] of count)
        if (c > most) {
          best = k;
          most = c;
        }
      return most >= 0.3 * part.pixels.length ? best : -1;
    });
    // Regions sharing a home, grouped through near ones: a checkerboard's checks meeting at corners join
    // their diagonal neighbours (0.3 mm), and through them regions far apart, all of it on purpose.
    // Only the nearest pair of two such groups is reported.
    const pairs = [], group = mine.map((_, i) => i), root = i => (group[i] === i ? i : (group[i] = root(group[i])));
    for (let i = 0; i < mine.length; i++) {
      let far = null;
      for (let j = i + 1; j < mine.length; j++) {
        if (home[i] < 0 || home[i] !== home[j]) continue;
        if (!far) {
          const seeds = new Uint8Array(n * n);
          for (const p of mine[i].pixels) seeds[p] = 1;
          far = distanceTransform(seeds, n, n);
        }
        let d = Infinity;
        for (const p of mine[j].pixels) d = Math.min(d, far[p]);
        const gapMm = Math.sqrt(d) * mm;
        if (gapMm > gap) pairs.push([i, j, gapMm]);
        else group[root(i)] = root(j);
      }
    }
    const nearest = new Map();
    for (const [i, j, gapMm] of pairs) {
      const a = root(i), b = root(j), key = Math.min(a, b) + ' ' + Math.max(a, b);
      if (a !== b && !(nearest.get(key)?.[2] <= gapMm)) nearest.set(key, [i, j, gapMm]);
    }
    for (const [i, j, gapMm] of nearest.values())
      out.push({a: centre(mine[i].pixels), b: centre(mine[j].pixels), gapMm: +gapMm.toFixed(2)});
  }
  return out;
}

/** The features check for a finished template (the export's report): regions of the picture its weave
 * joins (`merged`) fail it; what the weave adds is listed as `stray`, for the page to name, reported but
 * not failed, as a photograph's edge noise gives regions there too (a bauble's template, 2.7% off its
 * picture, adds 10 and 28 mm² beside the paper's edge). */
export function finalFeatureAudit(source, woven, cfg, features) {
  let audit = auditFeatureFidelity(source, woven, cfg, features);
  const merged = mergedRegions(source, woven, cfg.width), stray = strayRegions(source, woven, cfg.width);
  if (merged.length) audit = {...audit, passed: false, merged};
  return stray.length ? {...audit, stray} : audit;
}

/** Pixel retention is useful while proposing a routing, but cannot certify an
 * opening that has become a channel to the background. Keep that extra final
 * check separate from coarse seed acceptance. This is a raster enclosure
 * check for small, substantial interior regions, not an exact topology proof.
 */
export function auditFeatureFidelity(source, woven, cfg, features = imageFeatures(source, cfg.width)) {
  const retention = auditImageFeatures(source, woven, cfg.width, features);
  const selected = smallInteriorFeatures(source, features, cfg);
  if (!selected.length) return retention;
  const components = featureComponentMetrics(source, woven, cfg.width, selected);
  const opened = new Set(selected.filter((_, i) => components[i].touchesBorder === true));
  const regions = retention.regions.map((r, i) => (opened.has(features[i]) ? {...r, enclosureLost: true} : r));
  const missing = regions.filter(r => r.retainedFraction < retention.minimumRetention || r.enclosureLost);
  return {
    ...retention,
    passed: !missing.length,
    regions,
    missing,
    enclosures: {components, opened: opened.size},
    method: retention.method + ' Small interior regions must also remain separate from the square boundary.'
  };
}

/** Cleanup may improve an imperfect candidate, but cannot open a region that
 * its incoming checkpoint kept enclosed. Existing colour-retention rules and
 * their treatment of already missing regions remain unchanged.
 */
export function auditFeatureFidelityChange(source, before, after, cfg, features = imageFeatures(source, cfg.width)) {
  const retention = auditFeatureChange(source, before, after, cfg.width, features);
  const selected = [...smallInteriorFeatures(source, features, cfg), ...stableInteriorFeatures(source, features, cfg)];
  if (!selected.length) return retention;
  const a = featureComponentMetrics(source, before, cfg.width, selected),
    b = featureComponentMetrics(source, after, cfg.width, selected);
  const opened = b.filter((part, i) => a[i].touchesBorder === false && part.touchesBorder === true);
  return opened.length ? {...retention, passed: false, enclosuresOpened: opened} : retention;
}

export function featureComponentMetrics(source, woven, width = 100, features = imageFeatures(source, width)) {
  if (!features.length) return [];
  const n = source.resolution, parts = [null], labels = new Int32Array(woven.length);
  return features.map(feature => {
    const intersections = new Map();
    // Usually the protected opening occupies a few hundred cells. Flood only
    // components touched by its source pixels; the large surrounding regions
    // cannot affect its measurements unless the opening actually joins them.
    for (const pixel of feature.pixels) {
      if (woven[pixel] !== feature.value) continue;
      let id = labels[pixel];
      if (!id) {
        id = parts.length;
        parts.push(connectedComponent(woven, n, pixel, labels, id));
      }
      intersections.set(id, (intersections.get(id) || 0) + 1);
    }
    const best = [...intersections].sort((a, b) => b[1] - a[1])[0],
      part = best && parts[best[0]],
      intersection = best?.[1] || 0;
    return {
      centerMm: feature.centerMm,
      sourceAreaMm2: feature.areaMm2,
      intersectionPixels: intersection,
      retention: intersection / feature.pixels.length,
      predictedComponentAreaMm2: (part?.pixels.length || 0) * (width / n) ** 2,
      touchesBorder: part?.border ?? null,
      componentIoU: intersection / (feature.pixels.length + (part?.pixels.length || 0) - intersection)
    };
  });
}
