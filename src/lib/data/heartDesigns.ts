import type { HeartDesign } from '$lib/types/heart';
import heartDesigns from './heart-designs.json';

// Gallery designs precomputed by scripts/generate-heart-data.mjs: the HeartDesign that
// parseHeartFromSVG returns for static/hearts/<id>.svg, ready to render at prerender
// time without fetching or parsing SVG. Treat the objects as read-only; they are shared.
const DESIGNS = heartDesigns as unknown as Record<string, HeartDesign>;

export function getGalleryDesign(id: string): HeartDesign | null {
  return Object.prototype.hasOwnProperty.call(DESIGNS, id) ? DESIGNS[id] : null;
}
