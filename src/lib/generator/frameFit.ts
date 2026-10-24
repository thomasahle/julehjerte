/**
 * How a frame sizes its motif and its circle from the visitor's size and
 * space settings, before anything is built: shared by the generator and the
 * pictures drawn before the cuts (see `picture`).
 */
import type { GeneratorRequest } from './generate';
import type { FigureStyle } from './geometry';
import { normalizeContours } from './contours';
import { BASE_CLEARANCE } from '$lib/geometry/clearance';

/** The largest motif keeps this distance (in the 100-unit square) from the
 * paper edges, room for its corner checks and for cutting along its outline. */
const SILHOUETTE_MARGIN = 6;
/** A silhouette frame scales the motif to fill the square. The size setting,
 * up to its 85% maximum, is the fraction of that largest size. */
export function fillSquare(request: GeneratorRequest): GeneratorRequest {
	if (request.mode !== 'figure' || request.style !== 'silhouette') return request;
	const points = normalizeContours(request.contours ?? []).flat();
	if (!points.length) return request;
	// The square is |x| + |y| ≤ 50√2 in the upright coordinates of the heart.
	const reach = Math.max(...points.map(([x, y]) => Math.abs(x) + Math.abs(y)));
	const largest = (50 * Math.SQRT2 - SILHOUETTE_MARGIN) / reach;
	return { ...request, frameSize: 100, scale: largest / 100 * Math.min(1, (request.scale ?? .7) / .85) };
}
/** The circle frames, whose circle can follow the motif's outline. */
export const CIRCLE_STYLES: readonly FigureStyle[] = ['rays', 'check', 'sunburst', 'layers'];
/** The largest circle frame the outer strips have room for. */
const LARGEST_CIRCLE = 80;
/** Whether the sunburst's crown may narrow, its circle more than four fifths
 * of the frame, where the frame has reached the largest the outer strips have
 * room for: only for a heart refused, hard to cut or kept smaller with the
 * crown as it is (see `generate`), so every heart cut cleanly keeps its
 * frame. */
let narrowCrown = false;
export function withNarrowCrown<T>(build: () => T): T {
	const before = narrowCrown;
	narrowCrown = true;
	try {
		return build();
	} finally {
		narrowCrown = before;
	}
}
/** Whether the sunburst's crown would narrow for the request (see
 * `withNarrowCrown`). */
export const crowdsCrown = (request: GeneratorRequest) => request.style === 'sunburst' && withNarrowCrown(() => (fitCircle(request).crown ?? .8) > .8);
/** A circle frame given space around the motif draws its circle that far
 * outside the motif's outline. The motif keeps its size (frame size × scale);
 * the circle's diameter follows, within the frame sizes the outer strips have
 * room for. The sunburst's circle is four fifths of its frame, up to nine tenths
 * where its crown narrows (see `withNarrowCrown`). The double
 * border's medallion holds the whole motif: one that would reach past its
 * largest circle at 100% grows over the sizes above the default to the
 * largest it holds, the cutting clearance inside it, rather than stopping
 * short of 100%. */
export function fitCircle(request: GeneratorRequest): GeneratorRequest {
	if (request.mode !== 'figure' || request.gap === undefined || !CIRCLE_STYLES.includes(request.style ?? 'rays')) return request;
	const points = normalizeContours(request.contours ?? []).flat();
	if (!points.length) return request;
	const frame = request.frameSize ?? 70, setting = request.scale ?? .7, inner = request.style === 'sunburst' ? .8 : 1;
	const reach = Math.max(...points.map(([x, y]) => Math.hypot(x, y)));
	let size = frame * setting;
	const largest = (LARGEST_CIRCLE / 2 - BASE_CLEARANCE) / reach, base = frame * .7;
	if (request.style === 'layers' && setting > .7 && largest < frame && largest > base)
		size = base + (setting - .7) / .3 * (largest - base);
	const need = 2 * (size * reach + request.gap), frameSize = Math.max(50, Math.min(LARGEST_CIRCLE, need / inner));
	// The sunburst's crown may narrow, its circle up to nine tenths of the
	// frame, where the frame has reached the largest the outer strips have
	// room for (see `withNarrowCrown`).
	const crown = request.style === 'sunburst' && narrowCrown ? Math.min(.9, Math.max(.8, need / frameSize)) : undefined;
	return { ...request, frameSize, scale: size / (frameSize * (crown ?? inner)), ...crown !== undefined && crown > .8 ? { crown } : {} };
}
