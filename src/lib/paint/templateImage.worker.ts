/**
 * The template reader (templateImage.ts) off the main thread: a large photograph
 * takes it a second, which the import dialog must not freeze for.
 */
import { mirrorLobe, readTemplateImage, type TemplatePixels } from './templateImage';
import type { HeartDesign } from '$lib/types/heart';
import { rasterizeDesign } from './rasterize';
import { maskMismatch } from './mask';

/**
 * The heart with its left half turned over, when that weaves more than 1%
 * differently. A piece turned over is its own mirror image, and only a page
 * drawing both halves as they sit in the heart says which side is up.
 */
function turnedOver(design: HeartDesign): HeartDesign | null {
	const turned = mirrorLobe(design, 'left');
	const size = 200;
	return maskMismatch(rasterizeDesign(turned, size).data, rasterizeDesign(design, size).data) > 0.01 ? turned : null;
}

self.onmessage = ({ data }: MessageEvent<{ id: number; image: TemplatePixels }>) => {
	try {
		const read = readTemplateImage(data.image);
		self.postMessage({
			id: data.id,
			read: read && {
				design: read.design,
				confidence: read.confidence,
				layout: read.layout,
				turned: read.layout === 'in-place' ? null : turnedOver(read.design),
				// As [x, y] pairs, the dialog's points.
				lobes: read.lobes.map((lobe) => ({
					square: lobe.square.map((p) => [p.x, p.y]),
					cuts: lobe.cuts.map((cut) => cut.map((p) => [p.x, p.y]))
				}))
			}
		});
	} catch (error) {
		self.postMessage({ id: data.id, read: null, error: String(error) });
	}
};
