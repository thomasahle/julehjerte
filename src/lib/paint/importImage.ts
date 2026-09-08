/**
 * A picture on its way to becoming a mask.
 *
 * Two steps, and they are deliberately apart: a file is turned into pixels here
 * (no engine, no worker, no settings), and the engine's answer is turned back
 * into a mask here (no DOM). What happens in between — corners, colour
 * interpretation, a preview — belongs to the import dialog, and "Prøv stjernen"
 * skips all of it. Both callers use these two ends, so the two ends live here
 * rather than inside the dialog.
 */

import type { PixelsInput, PreparedArtwork } from '$lib/inverse/client';
import { createMask, MASK_SIZE, resample, type Mask } from './mask';

/** The largest file we will read, matching what the old generate page accepted. */
export const MAX_FILE_BYTES = 12 * 1024 * 1024;

/**
 * The largest decoded image. Twenty-four megapixels is 96 MB of RGBA, and the
 * whole array is copied into the worker; beyond that a phone simply runs out.
 */
export const MAX_PIXELS = 24e6;

/** What the picture types map to; the same three the browser can decode for us. */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Message keys the paint UI can translate; the `message` is for the console. */
export type ImportErrorKey =
	| 'paintImportTooLarge'
	| 'paintImportUnsupported'
	| 'paintImportPixelsTooLarge';

export class ImportImageError extends Error {
	constructor(
		readonly key: ImportErrorKey,
		message: string
	) {
		super(message);
		this.name = 'ImportImageError';
	}
}

/**
 * A picture file as the RGBA the engine's `prepare` takes.
 *
 * `createImageBitmap` does the decoding, so every format the browser knows is
 * handled by the browser rather than by us, and a canvas hands back the bytes.
 * The bitmap is closed either way: it holds the decoded image, which is the
 * large thing here.
 *
 * SVG is not decoded: the engine takes it as text and keeps the vector
 * boundaries, which is strictly better than rasterising it first. That path
 * belongs to the import dialog, which is where a file type is chosen.
 */
export async function decodeImageFile(file: File): Promise<PixelsInput> {
	if (file.size > MAX_FILE_BYTES) {
		throw new ImportImageError('paintImportTooLarge', `${file.name} is ${file.size} bytes.`);
	}
	if (!IMAGE_TYPES.includes(file.type)) {
		throw new ImportImageError('paintImportUnsupported', `${file.name} is ${file.type || 'untyped'}.`);
	}

	const bitmap = await createImageBitmap(file);
	try {
		if (bitmap.width * bitmap.height > MAX_PIXELS) {
			throw new ImportImageError(
				'paintImportPixelsTooLarge',
				`${bitmap.width} × ${bitmap.height} pixels.`
			);
		}
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		// willReadFrequently: the one thing we do with this canvas is read it back.
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) {
			throw new ImportImageError('paintImportUnsupported', 'No 2D canvas context.');
		}
		context.drawImage(bitmap, 0, 0);
		return {
			type: 'pixels',
			rgba: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
			imageWidth: bitmap.width,
			imageHeight: bitmap.height
		};
	} finally {
		bitmap.close();
	}
}

/**
 * The engine's classified picture as our mask.
 *
 * `prepared.mask` is the engine's own two-colour reading of the woven square —
 * 0 the left paper, 1 the right — at whatever resolution it settled on, which
 * is at most the smaller side of the image. Nearest-neighbour is the only honest
 * resize for it: the values name colours, and an average of two of them is not a
 * third colour, it is a number nothing downstream can draw.
 */
export function maskFromPrepared(prepared: PreparedArtwork): Mask {
	const size = prepared.resolution;
	if (!Number.isInteger(size) || size <= 0 || prepared.mask.length !== size * size) {
		throw new ImportImageError(
			'paintImportUnsupported',
			`The engine returned ${prepared.mask.length} cells for resolution ${size}.`
		);
	}
	const mask = createMask(0);
	mask.data.set(resample(prepared.mask, size, MASK_SIZE));
	return mask;
}
