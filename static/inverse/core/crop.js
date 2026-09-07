/** Adapter for the supplied motif locator. Its coordinates refer to pixel
 * centres; the inverse engine's quadrilateral refers to pixel edges. */
import { detectMotif } from '../locator/locator.js';
import { homography, project } from '../locator/math.js';

export const pixelCentresToEdges = quad => quad.map(p => p.map(v => v + 0.5));
export const pixelEdgesToCentres = quad => quad.map(p => p.map(v => v - 0.5));

export function detectHeartCrops(input, { roi = input.roi, onProgress = () => {} } = {}) {
  if (input.imageWidth * input.imageHeight > 24e6) throw new Error('Image exceeds 24 megapixels.');
  if (input.imageWidth < 24 || input.imageHeight < 24) return { status: 'not_found', reason: 'The image is too small for automatic outline fitting.', candidates: [] };
  onProgress({ stage: 'detecting' });
  const image = { width: input.imageWidth, height: input.imageHeight, data: input.rgba };
  let proposal = detectMotif(image, { roi, maxSize: 650 });
  if (!proposal.quad) {
    const adaptive = detectMotif(image, { roi, maxSize: 650, palette: 'adaptive' });
    if (adaptive.quad || adaptive.status === 'needs_selection') proposal = adaptive;
    if (!proposal.quad) {
      // Cream paper on white can be lost by the saturated-paper mask. Retry
      // with a lower chroma threshold, retaining the same outline checks.
      const pale = detectMotif(image, { roi, maxSize: 650, palette: 'pale' });
      if (pale.quad || pale.status === 'needs_selection') proposal = pale;
    }
  }
  return {
    status: proposal.status,
    reason: proposal.reason,
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
