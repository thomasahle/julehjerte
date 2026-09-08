/**
 * Turning a file the visitor picked into something the engine can read, and the
 * engine's answer into a mask — PAINT.md §2, step 1.
 *
 * The decoding is the old generator page's, kept because it is the only way to
 * get pixels out of a file the browser can show: `createImageBitmap` hands back
 * a decoded picture without a load event, a canvas hands back its bytes, and
 * SVG goes to the engine as text so it can trace the curves rather than a
 * rasterisation of them.
 *
 * The corner helpers are here rather than in the dialog because they are the
 * part with a right answer: the engine maps the unit square's corners
 * `(0,0) (1,0) (1,1) (0,1)` onto the four points in order, so their order *is*
 * the orientation of the heart it reads — one rotation out and the two lobes
 * swap, one reflection out and the picture is transposed.
 */

import type { ArtworkInput, PreparedArtwork, Point } from '$lib/inverse/client';
import { createMask, MASK_SIZE, resample, type Mask } from './mask';

/** Files bigger than this are refused before they are decoded. */
export const MAX_FILE_BYTES = 12 * 1024 * 1024;

/** The engine's own ceiling, checked here so the message is ours and not a worker error. */
const MAX_PIXELS = 24e6;

const PIXEL_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** Why a file could not be used. The dialog turns these into sentences. */
export type ImportErrorKind = 'tooLarge' | 'unsupported' | 'pixelsTooLarge' | 'decode';

export class ImportError extends Error {
	constructor(public kind: ImportErrorKind) {
		super(kind);
		this.name = 'ImportError';
	}
}

export type DecodedImage = {
	/** What goes to the engine: pixels with an optional crop, or SVG source text. */
	input: ArtworkInput;
	name: string;
	/** An object URL for showing the picture. The caller revokes it. */
	url: string;
	/** The decoded size, or null for an SVG, which the engine takes whole. */
	pixels: { width: number; height: number } | null;
};

/**
 * Decode one picked file.
 *
 * Everything that can go wrong with a file goes wrong here, as an `ImportError`
 * with a kind the dialog has words for; the engine is not asked about a file it
 * cannot use.
 */
export async function decodeImageFile(file: File): Promise<DecodedImage> {
	if (file.size > MAX_FILE_BYTES) throw new ImportError('tooLarge');

	const extension = file.name.toLowerCase().split('.').pop() ?? '';
	if (file.type === 'image/svg+xml' || extension === 'svg') {
		const text = await file.text();
		return {
			input: { type: 'svg', text },
			name: file.name,
			url: URL.createObjectURL(file),
			pixels: null
		};
	}

	if (!PIXEL_TYPES.includes(file.type)) throw new ImportError('unsupported');

	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		throw new ImportError('decode');
	}
	try {
		if (bitmap.width * bitmap.height > MAX_PIXELS) throw new ImportError('pixelsTooLarge');
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		// The pixels are read once, but `willReadFrequently` also keeps the canvas
		// on the CPU, which is where a single large readback is cheapest.
		const context = canvas.getContext('2d', { willReadFrequently: true });
		if (!context) throw new ImportError('decode');
		context.drawImage(bitmap, 0, 0);
		return {
			input: {
				type: 'pixels',
				rgba: context.getImageData(0, 0, bitmap.width, bitmap.height).data,
				imageWidth: bitmap.width,
				imageHeight: bitmap.height
			},
			name: file.name,
			url: URL.createObjectURL(file),
			pixels: { width: bitmap.width, height: bitmap.height }
		};
	} finally {
		bitmap.close();
	}
}

/**
 * The engine's prepared picture as a mask we can paint on.
 *
 * `prepared.mask` is already the convention the rest of paint mode uses — 0 the
 * left colour, 1 the right — but the engine may answer at a lower resolution
 * than ours (the automatic route re-prepares at whatever the traced graph wants),
 * so it is resampled to `MASK_SIZE` before anyone else sees it.
 */
export function maskFromPrepared(prepared: PreparedArtwork): Mask {
	const from = prepared.resolution;
	if (!from || prepared.mask.length !== from * from) return createMask(0);
	return { size: MASK_SIZE, data: resample(prepared.mask, from, MASK_SIZE) };
}

/** Twice the signed area of the triangle `a b c`; the sign is the turn's direction. */
function cross(a: Point, b: Point, c: Point): number {
	return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
}

/**
 * True when four corners form a convex quadrilateral in perimeter order — the
 * engine's own test, so a crop it would reject is caught before it is sent.
 *
 * Either winding is allowed: the engine accepts both, and the locator and the
 * visitor's clicks need not agree about which way round a heart is being read.
 */
export function isConvexQuad(quad: readonly Point[]): boolean {
	if (quad.length !== 4 || quad.some((p) => p.length !== 2 || !p.every(Number.isFinite))) {
		return false;
	}
	const turns = quad.map((p, i) => cross(p, quad[(i + 1) % 4]!, quad[(i + 2) % 4]!));
	if (turns.some((t) => Math.abs(t) < 1e-6)) return false;
	return turns.every((t) => t > 0) || turns.every((t) => t < 0);
}

/**
 * Put four clicked corners into perimeter order, keeping the first click first.
 *
 * The engine reads a quadrilateral as the locator writes one: `notch, right,
 * tip, left` — the heart's top cleft, then round the outline the way a clock
 * goes on the screen. The dialog asks for the top corner first, so the first
 * click decides where the round trip starts, and sorting the other three by
 * angle about the centroid decides which way it goes. That is what makes the
 * step forgiving: four corners clicked in a zigzag still describe the same
 * quadrilateral, and refusing them would only teach the visitor to click again
 * until it worked. It is also why the *first* click is honoured rather than the
 * topmost point — a heart photographed at an angle has its cleft below one of
 * its lobes, and the visitor can see that where an arithmetic rule cannot.
 *
 * Returns copies unchanged when there are not four points; whether they enclose
 * anything is `isConvexQuad`'s question, not this one's.
 */
export function orderQuad(points: readonly Point[]): Point[] {
	const copy = points.map((p) => [...p] as Point);
	if (copy.length !== 4) return copy;
	const cx = copy.reduce((s, p) => s + p[0], 0) / 4;
	const cy = copy.reduce((s, p) => s + p[1], 0) / 4;
	// y grows downwards on a screen, so an increasing angle runs right, down,
	// left, up — clockwise as the visitor sees it.
	const round = [0, 1, 2, 3].sort(
		(a, b) =>
			Math.atan2(copy[a]![1] - cy, copy[a]![0] - cx) -
			Math.atan2(copy[b]![1] - cy, copy[b]![0] - cx)
	);
	const start = round.indexOf(0);
	return [0, 1, 2, 3].map((i) => copy[round[(start + i) % 4]!]!);
}
