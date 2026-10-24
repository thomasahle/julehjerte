/**
 * The template reader (templateImage.ts) off the main thread: a large photograph
 * takes it a second, which the import dialog must not freeze for.
 */
import { readTemplateImage, type TemplatePixels } from './templateImage';

self.onmessage = ({ data }: MessageEvent<{ id: number; image: TemplatePixels }>) => {
	try {
		const read = readTemplateImage(data.image);
		self.postMessage({
			id: data.id,
			read: read && {
				design: read.design,
				confidence: read.confidence,
				layout: read.layout,
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
