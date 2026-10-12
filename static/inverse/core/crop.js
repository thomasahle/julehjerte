/** Adapter for the supplied motif locator. Its coordinates refer to pixel
 * centres; the inverse engine's quadrilateral refers to pixel edges. */
import { createMotifDetector } from '../locator/locator.js';
import { homography, project } from '../locator/math.js';

export const pixelCentresToEdges = quad => quad.map(p => p.map(v => v + 0.5));
export const pixelEdgesToCentres = quad => quad.map(p => p.map(v => v - 0.5));

/** A rotated guess must explain both lobes. Merely returning a quadrilateral
 * is insufficient when one paper colour is absent from the segmentation. */
export function supportedCropOutline(proposal) {
  const e = proposal?.evidence;
  return !!proposal?.quad && !!e && [...e.lowerEdgeSupport, ...e.lobeOutlineSupport].every(v => v >= .65) && e.capColourLoss.every(v => v <= .30);
}

/** A fit can explain both lobes while its tilted lower edges have too few
 * sampled inliers. Its notch-to-tip direction can seed one upright retry;
 * the original support checks still decide whether that retry is usable.
 */
function outlineOrientation(proposal) {
  const e = proposal?.evidence, q = e?.rejectedQuad;
  if (!q || !e.lobeOutlineSupport.every(v => v >= .65) || !e.capColourLoss.every(v => v <= .30) || !e.lowerEdgeSupport.every(v => v >= .4)) return null;
  const dx = q[2][0] - q[0][0], dy = q[2][1] - q[0][1];
  return (90 - Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
}

export function detectHeartCrops(input, { roi = input.roi, onProgress = () => {} } = {}) {
  if (input.imageWidth * input.imageHeight > 24e6) throw new Error('Image exceeds 24 megapixels.');
  if (input.imageWidth < 24 || input.imageHeight < 24) return { status: 'not_found', reason: 'The image is too small for automatic outline fitting.', candidates: [] };
  onProgress({ stage: 'detecting' });
  const image = { width: input.imageWidth, height: input.imageHeight, data: input.rgba };
  const started = performance.now(), detectors = new Map(), attempts = [];
  let orientationSearch = null;
  const detector = palette => {
    if (!detectors.has(palette)) detectors.set(palette, createMotifDetector(image, { roi, maxSize: 650, palette }));
    return detectors.get(palette);
  };
  let proposal = detector(undefined)();
  if (!supportedCropOutline(proposal)) {
    const original = proposal;
    const adaptive = detector('adaptive')();
    if (adaptive.quad || adaptive.status === 'needs_selection') proposal = adaptive;
    if (!supportedCropOutline(proposal)) {
      // Cream paper on white can be lost by the saturated-paper mask. Retry
      // with a lower chroma threshold, retaining the same outline checks.
      const pale = detector('pale')();
      if (pale.quad || pale.status === 'needs_selection') proposal = pale;
    }
    if (!supportedCropOutline(proposal)) {
      // A dim pale sheet can merge with a textured background. Anchor its
      // colour estimate inside the main saturated paper component instead.
      const anchored = detector('anchored')();
      if (anchored.quad) proposal = anchored;
    }
    if (!proposal.quad && original.quad) proposal = original;
  }
  if (!supportedCropOutline(proposal)) {
    // Keep an editable upright/occluded-photo guess unless a complete outline
    // explains another pose. Shape fits finish synchronously, so check the
    // shared deadline between hypotheses rather than starting new ones.
    const deadline = performance.now() + 2000;
    orientationSearch = { timeLimitMs: 2000, timeLimitReached: false, models: [], attempts };
    search: for (const palette of ['adaptive', 'pale', undefined, 'anchored']) {
      if (performance.now() >= deadline) { orientationSearch.timeLimitReached = true; break; }
      const detect = detector(palette), angles = detect.orientations(), pending = angles.map(degrees => ({ degrees }));
      orientationSearch.models.push({ palette: palette || 'red-white', hypotheses: angles.length });
      for (let index = 0; index < pending.length; index++) {
        if (performance.now() >= deadline) { orientationSearch.timeLimitReached = true; break search; }
        const { degrees, refinedFrom } = pending[index];
        const rotated = detect(degrees), supported = supportedCropOutline(rotated);
        attempts.push({ palette: palette || 'red-white', degrees, ...(refinedFrom === undefined ? {} : { refinedFrom }), status: rotated.status, supported, score: rotated.score ?? null });
        if (supported) { proposal = rotated; break search; }
        const refined = refinedFrom === undefined ? outlineOrientation(rotated) : null;
        if (refined !== null && pending.every(p => Math.min(Math.abs(p.degrees - refined), 360 - Math.abs(p.degrees - refined)) > .5)) {
          pending.splice(index + 1, 0, { degrees: refined, refinedFrom: degrees });
        }
      }
    }
    orientationSearch.selectedDegrees = proposal.evidence?.workingRotation?.degrees ?? null;
  }
  proposal.elapsedMs = performance.now() - started;
  return {
    status: proposal.status,
    reason: proposal.reason,
    ...(orientationSearch ? { orientationSearch } : {}),
    candidates: proposal.quad ? [{
      quad: pixelCentresToEdges(proposal.quad),
      outline: proposal.outline.map(pixelCentresToEdges),
      needsReview: proposal.status !== 'candidate',
      status: proposal.status,
      warnings: proposal.warnings,
      locator: proposal,
      provenance: {
        locatorVersion: proposal.version,
        sourceDimensions: [input.imageWidth, input.imageHeight],
        roughRegion: roi || null,
        proposedPixelCentreCorners: proposal.quad,
        proposedPixelEdgeCorners: pixelCentresToEdges(proposal.quad),
        coordinateConvention: 'Pixel-edge coordinates for the inverse engine; locator coordinates + 0.5 pixels',
        ...(orientationSearch ? { orientationSearch } : {}),
      },
    }] : [],
  };
}

/** Recover a rough full-heart ROI from an existing manual overlap selection.
 * The locator receives only the rectangle; it does not optimize those corners. */
export function regionFromQuad(input, quad) {
  const H = homography([[0, 0], [1, 0], [1, 1], [0, 1]], pixelEdgesToCentres(quad));
  const points = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let i = 0; i <= 40; i++) {
    const angle = Math.PI * i / 40;
    points.push([0.5 - 0.5 * Math.cos(angle), -0.5 * Math.sin(angle)], [-0.5 * Math.sin(angle), 0.5 + 0.5 * Math.cos(angle)]);
  }
  const mapped = points.map(p => project(H, p));
  return [Math.max(0, Math.min(...mapped.map(p => p[0]))), Math.max(0, Math.min(...mapped.map(p => p[1]))), Math.min(input.imageWidth, Math.max(...mapped.map(p => p[0]))), Math.min(input.imageHeight, Math.max(...mapped.map(p => p[1])))];
}

export function refineHeartCrop(input, quad) {
  return detectHeartCrops(input, { roi: input.roi || regionFromQuad(input, quad) });
}
