/**
 * The weaving film's player and its recordings, fetched when a film is first asked for.
 *
 * The player (static/weave/film.js) is the weave simulator's own viewer with its page taken
 * off; it draws with three.js (static/weave/vendor). Neither is part of the site's bundle: a
 * heart page costs nothing for them until "Fletning" is chosen. A recording
 * (static/weave/<id>.jhb) is made offline, one per heart, by scripts/weave/films.mjs.
 */
import { base } from '$app/paths';

/** One step of a film, as the player reports it. `id` or `tag` says which step it is ($lib/weave/words). */
export interface WeaveStep {
	/** A step outside the weaving: 'strips', 'fold', 'round', 'cut', 'lay', 'handle' or 'hang'. */
	id: string;
	/** A weaving step: 'start', 'row,K', 'N,M,R' or 'N,M,W' (strips counted from 0). */
	tag: string;
	/** For 'cut': how many strips the red and the white half have. */
	n: [number, number] | null;
	/** For 'cut': every cut is a straight line. */
	straight: boolean;
	/** The recording's own English words, used when it names no step. */
	title: string;
	text: string;
	/** Seconds into the film. */
	start: number;
}

export interface WeaveFilmInfo {
	steps: WeaveStep[];
	/** The film's length in seconds. */
	total: number;
}

export interface WeaveFilmEvents {
	step(index: number): void;
	time(seconds: number, total: number): void;
	playing(playing: boolean): void;
}

export interface WeaveFilmPlayer {
	/** Null when the player was destroyed while the recording was unpacked. */
	open(recording: ArrayBuffer): Promise<WeaveFilmInfo | null>;
	toggle(): void;
	play(playing: boolean): void;
	seek(seconds: number): void;
	/** -1: to the start of this step, or the one before; 1: to the next. */
	step(direction: -1 | 1): void;
	speed(factor: number): void;
	zoom(factor: number): void;
	reset(): void;
	/** How much of the stage's top and bottom the page covers, in px; the heart is kept between them. */
	insets(top: number, bottom: number): void;
	/** Show one moment without playing. */
	set(seconds: number): void;
	destroy(): void;
}

export interface WeaveFilmOptions {
	/** The red paper's colour, 0xRRGGBB. */
	red?: number;
	/** How many times faster than it was recorded the weaving itself is shown (1 when left out). */
	weave?: number;
}

type CreateWeaveFilm = (
	three: unknown,
	canvas: HTMLCanvasElement,
	stage: HTMLElement,
	on: WeaveFilmEvents,
	options?: WeaveFilmOptions
) => WeaveFilmPlayer;

/** A film a gallery heart has: $lib/data/weave-films.json. */
export interface WeaveFilmEntry {
	/** The recording's version, part of its address so that a new recording is fetched anew. */
	v: string;
	bytes: number;
}

// Bumped when film.js or three.js changes, so a browser never pairs an old player with a new page.
const PLAYER_VERSION = '1';

/** Whether this browser can unpack a recording at all. */
export function canPlayWeaveFilm(): boolean {
	return typeof DecompressionStream === 'function' && typeof ResizeObserver === 'function';
}

let three: Promise<unknown> | null = null;

function loadThree(): Promise<unknown> {
	three ??= new Promise((resolve, reject) => {
		const present = (window as unknown as { THREE?: unknown }).THREE;
		if (present) return resolve(present);
		const script = document.createElement('script');
		script.src = `${base}/weave/vendor/three.min.js?v=${PLAYER_VERSION}`;
		script.onload = () => resolve((window as unknown as { THREE?: unknown }).THREE);
		script.onerror = () => {
			three = null;
			reject(new Error('three.js did not load'));
		};
		document.head.append(script);
	});
	return three;
}

/** A player drawing on `canvas`, sized by `stage`. Throws when the browser has no WebGL. */
export async function createWeaveFilm(
	canvas: HTMLCanvasElement,
	stage: HTMLElement,
	on: WeaveFilmEvents,
	options?: WeaveFilmOptions
): Promise<WeaveFilmPlayer> {
	const [THREE, module] = await Promise.all([
		loadThree(),
		import(/* @vite-ignore */ `${base}/weave/film.js?v=${PLAYER_VERSION}`) as Promise<{
			createWeaveFilm: CreateWeaveFilm;
		}>
	]);
	return module.createWeaveFilm(THREE, canvas, stage, on, options);
}

const recordings = new Map<string, ArrayBuffer>();

/**
 * A heart's recording. `progress` hears the fraction fetched, 0 to 1. Kept for the rest of the
 * visit, so going back to the film does not fetch it again.
 */
export async function fetchWeaveRecording(
	id: string,
	entry: WeaveFilmEntry,
	progress?: (fraction: number) => void
): Promise<ArrayBuffer> {
	const key = `${id}@${entry.v}`;
	const kept = recordings.get(key);
	if (kept) return kept;
	const response = await fetch(`${base}/weave/${id}.jhb?v=${entry.v}`);
	if (!response.ok) throw new Error(`recording ${id}: ${response.status}`);
	let buffer: ArrayBuffer;
	if (response.body && progress) {
		const reader = response.body.getReader();
		const whole = new Uint8Array(entry.bytes);
		let got = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (got + value.length > whole.length) throw new Error(`recording ${id}: longer than listed`);
			whole.set(value, got);
			got += value.length;
			progress(got / entry.bytes);
		}
		if (got !== entry.bytes) throw new Error(`recording ${id}: ${got} of ${entry.bytes} bytes`);
		buffer = whole.buffer;
	} else {
		buffer = await response.arrayBuffer();
	}
	recordings.set(key, buffer);
	return buffer;
}
