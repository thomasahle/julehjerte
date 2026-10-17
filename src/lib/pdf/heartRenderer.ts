import { getColors, type HeartColors } from '$lib/stores/colors';
import type { HeartDesign } from '$lib/types/heart';
import { renderHeartSvgMarkup } from '$lib/rendering/heartSvg';

const DEFAULT_CANVAS_SIZE = 300;

/**
 * Renders a heart design to a canvas and returns it as a data URL
 */
export async function renderHeartToDataURL(
  design: HeartDesign,
  options: { size?: number; colors?: HeartColors } = {}
): Promise<string> {
  const canvasSize = options.size ?? DEFAULT_CANVAS_SIZE;
  // The heart's own colours when it has them, then whatever the caller asked for,
  // then the site-wide pair — so a printed template matches what is on screen.
  const colors = options.colors ?? design.colors ?? getColors();

  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const svg = renderHeartSvgMarkup(design, colors, {
    size: canvasSize,
    idPrefix: `pdf-${design.id}`,
    outline: { color: '#111' }
  });
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;

    try {
      await img.decode();
    } catch {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load SVG'));
      });
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context');
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.drawImage(img, 0, 0, canvasSize, canvasSize);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * One picture per design among `designs`, as a PNG data URL by design id. A
 * design that fails to render is left out (and logged), so the PDF or the
 * preview goes without its picture rather than without the template.
 *
 * Kept here rather than with jsPDF in ./template.ts: the download dialog's
 * preview shows the same pictures, and must not pull jsPDF in to do it.
 */
export async function prerenderHeartImages(designs: HeartDesign[], size: number): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();
  const uniqueDesigns = [...new Map(designs.map((d) => [d.id, d])).values()];

  for (const design of uniqueDesigns) {
    try {
      const dataURL = await renderHeartToDataURL(design, { size });
      imageMap.set(design.id, dataURL);
    } catch (e) {
      console.error(`Failed to render heart ${design.id}:`, e);
    }
  }

  return imageMap;
}
