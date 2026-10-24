/**
 * Whether a picture is a cut template, and the heart it is the template of
 * (templateImage.ts), asked of a worker.
 *
 * A picture that is not a template — every photograph and drawing of a woven
 * heart we have tried — reads as null, so the import goes on as before; so does
 * one the reader is unsure of, below `MIN_TEMPLATE_CONFIDENCE`.
 */
import type { HeartDesign } from '$lib/types/heart';

/** The reader's own threshold: every template it read right scored above it. */
export const MIN_TEMPLATE_CONFIDENCE = 0.5;

/** How long the import waits for the reader before treating the picture as a photograph. */
const TIMEOUT_MS = 8000;

type Point = [number, number];

export type ReadTemplate = {
	design: HeartDesign;
	confidence: number;
	layout: 'in-place' | 'side-by-side' | 'single';
	/**
	 * The same heart with one half turned over, when the template cannot tell
	 * the two apart (one template for both halves, or two drawn side by side)
	 * and they weave differently; otherwise null.
	 */
	turned: HeartDesign | null;
	/** Each lobe's square and cuts in the picture's pixels, for drawing over it. */
	lobes: { square: Point[]; cuts: Point[][] }[];
};

let worker: Worker | null = null;
let nextId = 1;

/** The template in `image`, or null when it is none (or the reader is unsure, slow or unavailable). */
export function readTemplate(image: { width: number; height: number; data: Uint8ClampedArray }): Promise<ReadTemplate | null> {
	if (typeof Worker === 'undefined') return Promise.resolve(null);
	try {
		worker ??= new Worker(new URL('./templateImage.worker.ts', import.meta.url), { type: 'module' });
	} catch {
		return Promise.resolve(null);
	}
	const id = nextId++, own = worker;
	return new Promise((resolve) => {
		const done = (read: ReadTemplate | null) => {
			clearTimeout(timer);
			own.removeEventListener('message', listen);
			resolve(read && read.confidence >= MIN_TEMPLATE_CONFIDENCE ? read : null);
		};
		const listen = ({ data }: MessageEvent<{ id: number; read: ReadTemplate | null }>) => {
			if (data.id === id) done(data.read);
		};
		// A reader still busy at the timeout is stopped, and the next picture
		// gets a fresh worker rather than a queue behind it.
		const timer = setTimeout(() => {
			if (worker === own) worker = null;
			own.terminate();
			done(null);
		}, TIMEOUT_MS);
		own.addEventListener('message', listen);
		own.postMessage({ id, image: { width: image.width, height: image.height, data: image.data } });
	});
}
