/**
 * The weaving film's player and its recordings, fetched when a film is first asked for.
 *
 * The player (static/weave/film.js) is the weave simulator's own viewer with its page taken
 * off; it draws with three.js (static/weave/vendor). Neither is part of the site's bundle. A
 * recording (static/weave/<id>.jhb) is made offline, one per heart, by scripts/weave/films.mjs.
 *
 * A heart page fetches all three in the background once it has settled (preloadWeaveFilm), so
 * the film starts at once when "Fletning" is chosen; nothing here delays the page itself.
 */
import { base } from '$app/paths';
import type { SketchFilm } from './sketch';

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
	/** A recording, or a film worked out here ($lib/weave/sketch). Null when the player was destroyed while the recording was unpacked. */
	open(recording: ArrayBuffer | SketchFilm): Promise<WeaveFilmInfo | null>;
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
	/** The two papers' colours, 0xRRGGBB: the simulator's red half and its white one ($lib/weave/papers). */
	papers(red: number, white: number): void;
	/** Show one moment without playing. */
	set(seconds: number): void;
	destroy(): void;
}

export interface WeaveFilmOptions {
	/** The two papers' colours, 0xRRGGBB: the simulator's red half and its white one. */
	red?: number;
	white?: number;
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
const PLAYER_VERSION = '2';

/** Whether this browser can unpack a recording at all. */
export function canPlayWeaveFilm(recorded = true): boolean {
	return (!recorded || typeof DecompressionStream === 'function') && typeof ResizeObserver === 'function';
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

function loadPlayer(): Promise<{ createWeaveFilm: CreateWeaveFilm }> {
	return import(/* @vite-ignore */ `${base}/weave/film.js?v=${PLAYER_VERSION}`);
}

/** A player drawing on `canvas`, sized by `stage`. Throws when the browser has no WebGL. */
export async function createWeaveFilm(
	canvas: HTMLCanvasElement,
	stage: HTMLElement,
	on: WeaveFilmEvents,
	options?: WeaveFilmOptions
): Promise<WeaveFilmPlayer> {
	const [THREE, module] = await Promise.all([loadThree(), loadPlayer()]);
	return module.createWeaveFilm(THREE, canvas, stage, on, options);
}

const recordings = new Map<string, ArrayBuffer>();
/** Recordings on their way, with everyone who wants to hear how far they are. */
const arriving = new Map<
	string,
	{ whole: Promise<ArrayBuffer>; hearers: Set<(fraction: number) => void>; fraction: number }
>();

/**
 * A heart's recording. `progress` hears the fraction fetched, 0 to 1. Kept for the rest of the
 * visit, so going back to the film does not fetch it again; asked for twice while it is on its
 * way, it is fetched once.
 */
export function fetchWeaveRecording(
	id: string,
	entry: WeaveFilmEntry,
	progress?: (fraction: number) => void
): Promise<ArrayBuffer> {
	const key = `${id}@${entry.v}`;
	const kept = recordings.get(key);
	if (kept) return Promise.resolve(kept);
	let coming = arriving.get(key);
	if (!coming) {
		const hearers = new Set<(fraction: number) => void>();
		const made = {
			hearers,
			fraction: 0,
			whole: download(id, entry, (fraction) => {
				made.fraction = fraction;
				for (const hear of hearers) hear(fraction);
			})
				.then((buffer) => {
					recordings.set(key, buffer);
					return buffer;
				})
				.finally(() => arriving.delete(key))
		};
		coming = made;
		arriving.set(key, made);
	}
	if (progress) {
		coming.hearers.add(progress);
		progress(coming.fraction);
	}
	return coming.whole;
}

async function download(
	id: string,
	entry: WeaveFilmEntry,
	progress: (fraction: number) => void
): Promise<ArrayBuffer> {
	const response = await fetch(`${base}/weave/${id}.jhb?v=${entry.v}`);
	if (!response.ok) throw new Error(`recording ${id}: ${response.status}`);
	if (!response.body) return response.arrayBuffer();
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
	return whole.buffer;
}

/**
 * Fetch what a heart's film needs before it is asked for: the player, three.js and the
 * recording (or, for a heart without one, the code that works a film out). Quiet when anything
 * fails: the film asks again, and reports, when it is opened. Left alone for a visitor who has
 * asked the browser to save data or is on a very slow line (a recording is a few megabytes).
 */
export function preloadWeaveFilm(id: string, entry: WeaveFilmEntry | null): void {
	if (typeof window === 'undefined' || !canPlayWeaveFilm(!!entry)) return;
	const line = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
	if (line?.saveData || /(^|-)2g$/.test(line?.effectiveType ?? '')) return;
	const quiet = () => {};
	loadThree().catch(quiet);
	loadPlayer().catch(quiet);
	if (entry) fetchWeaveRecording(id, entry).catch(quiet);
	else import('./sketch').catch(quiet);
}

/** Where a heart's film was left, so that coming back to it goes on from there. */
export interface WeaveFilmPlace {
	seconds: number;
	playing: boolean;
}

const places = new Map<string, WeaveFilmPlace>();

export function keepWeaveFilmPlace(id: string, place: WeaveFilmPlace): void {
	places.set(id, place);
}

export function weaveFilmPlace(id: string): WeaveFilmPlace | null {
	return places.get(id) ?? null;
}
