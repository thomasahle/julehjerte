import { describe, expect, it, vi } from 'vitest';
import classicSvg from '../../../static/hearts/classic-3x3.svg?raw';
import morOgBarnSvg from '../../../static/hearts/mor-og-barn.svg?raw';
import sunSvg from '../../../static/hearts/sun.svg?raw';
import tulipanSvg from '../../../static/hearts/tulipan.svg?raw';
import { parseHeartFromSVG } from '$lib/utils/svgImport';
import { designLines, halvesCuts, sketchFilm, SQ, type Point, type SketchFilm } from './sketch';
import { stepWords } from './words';

function load(svg: string, filename: string) {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		return parseHeartFromSVG(svg, filename)!;
	} finally {
		warn.mockRestore();
	}
}

const span = (film: SketchFilm) => (film.nframes - 1) / film.fps;

function poseAt(film: SketchFilm, seconds: number): Float32Array {
	const into = new Float32Array(film.nv * 3);
	film.pose(into, seconds);
	return into;
}

/** Whether the red half is the upper paper at a place of the woven heart, seen from above. */
function redOnTop(film: SketchFilm, pose: Float32Array, x: number, y: number): boolean {
	const top = [0, 0];
	const near = [Infinity, Infinity];
	for (let k = 0; k < film.nv; k++) {
		if (film.sign[k] !== 1) continue;
		const d = (pose[3 * k]! - x) ** 2 + (pose[3 * k + 1]! - y) ** 2;
		if (d < near[film.piece[k]!]!) {
			near[film.piece[k]!] = d;
			top[film.piece[k]!] = pose[3 * k + 2]!;
		}
	}
	return top[1]! > top[0]!;
}

describe('halvesCuts', () => {
	it('gives each half its own cuts, from the fold to the lobe', () => {
		const { a, b } = halvesCuts(designLines(load(classicSvg, 'classic-3x3.svg')));
		expect([a.length, b.length]).toEqual([2, 2]);
		for (const cut of [...a, ...b]) {
			expect(cut[0]![0]).toBeCloseTo(0, 6);
			expect(cut[cut.length - 1]![0]).toBeCloseTo(SQ, 6);
		}
	});

	it('reads a cut drawn as stubs and an arc as one cut ("Sol")', () => {
		const { a, b } = halvesCuts(designLines(load(sunSvg, 'sun.svg')));
		expect([a.length, b.length]).toEqual([3, 3]);
	});

	it('takes the square from where the cuts end when a file draws them past its 0–100 ("Mor og barn")', () => {
		const lines = designLines(load(morOgBarnSvg, 'mor-og-barn.svg'));
		// The file's cuts run from −12.5 to 112.5, and its middle cut leaves the lobe at 55.68.
		expect(lines.map((line) => Math.max(line[0]![0], line[0]![1]))).toEqual(lines.map(() => 100));
		expect(lines.some((line) => Math.abs(Math.min(line[0]![0], line[0]![1]) - (100 * (55.68 + 12.5)) / 125) < 0.01)).toBe(true);
		const { a, b } = halvesCuts(lines);
		expect([a.length, b.length]).toEqual([3, 3]);
		// No cut is carried on to the fold or the lobe: each already ends on both.
		expect([...a, ...b].reduce((n, cut) => n + cut.length, 0)).toBe(lines.reduce((n, line) => n + line.length, 0));
	});

	it('lends a half without cuts the other half’s', () => {
		const { a, b } = halvesCuts([
			[
				[50, 0],
				[50, 100]
			]
		]);
		expect([a.length, b.length]).toEqual([1, 1]);
	});
});

describe('sketchFilm', () => {
	it('has the steps of a recording, in words the page knows', () => {
		const design = load(classicSvg, 'classic-3x3.svg');
		const film = sketchFilm(designLines(design), design.weaveParity ?? 0);
		const tags = film.chapters.map((chapter) => chapter[3]);
		expect(tags.length).toBe(1 + 3 + 9 + 1);
		expect(tags.slice(0, 4)).toEqual(['start', 'row,0', '0,0,R', '0,1,W']);
		expect(tags[tags.length - 1]).toBe('woven');
		expect(film.chapters[film.chapters.length - 1]![0]).toBeCloseTo(span(film), 6);
		const words = stepWords(
			{ id: 'w2', tag: tags[2]!, n: null, straight: false, title: '', text: '', start: 0 },
			'da',
			{ red: 'røde', white: 'hvide' }
		);
		expect(words.title).toBe('Første røde strimmel gennem den første hvide');
	});

	it.each([0, 1])('ends as the woven heart, parity %i', (parity) => {
		const lines = designLines(load(classicSvg, 'classic-3x3.svg'));
		const film = sketchFilm(lines, parity);
		const end = poseAt(film, span(film));
		// From the notch's side, as the strips are counted.
		const { a, b } = halvesCuts(lines);
		const edges = (cuts: Point[][]) => [SQ, ...cuts.map((cut) => cut[0]![1]), 0];
		const red = edges(a);
		const white = edges(b);
		for (let n = 0; n + 1 < red.length; n++)
			for (let m = 0; m + 1 < white.length; m++) {
				// Red's along is x and its across y; white's the other way round.
				const top = redOnTop(film, end, (white[m]! + white[m + 1]!) / 2, (red[n]! + red[n + 1]!) / 2);
				expect(top, `red ${n}, white ${m}`).toBe(((n + m + parity) & 1) === 1);
			}
	});

	it('lays a strip one crossing at a time', () => {
		const film = sketchFilm(designLines(load(classicSvg, 'classic-3x3.svg')), 0);
		// How far from the lobe the first red strip lies flat, on the grid row through its middle.
		const laidTo = (pose: Float32Array) => {
			let to = SQ;
			for (let k = 0; k < film.nv; k++) {
				if (film.piece[k] !== 1 || film.sign[k] !== 1 || Math.abs(film.rest[2 * k + 1]! - 2.475) > 0.01) continue;
				if (film.rest[2 * k]! <= SQ && pose[3 * k + 2]! < 0.05) to = Math.min(to, film.rest[2 * k]!);
			}
			return to;
		};
		const starts = film.chapters.map((chapter) => chapter[0]);
		const tags = film.chapters.map((chapter) => chapter[3]);
		// Its three crossings end at the cuts at 2 and 1 and at the fold.
		[2, 1, 0].forEach((cut, m) => {
			const next = starts[tags.findIndex((tag) => tag.startsWith(`0,${m},`)) + 1]!;
			expect(laidTo(poseAt(film, next - 1e-3))).toBeGreaterThan(cut - 0.2);
			expect(laidTo(poseAt(film, next - 1e-3))).toBeLessThan(cut + 0.2);
		});
		// The second strip waits folded back over its lobe while the first is woven.
		const second = poseAt(film, starts[tags.indexOf('0,2,R')]!);
		for (let k = 0; k < film.nv; k++)
			if (film.piece[k] === 1 && film.rest[2 * k]! < SQ - 0.5 && Math.abs(film.rest[2 * k + 1]! - 1.5) < 0.2) expect(second[3 * k]!).toBeGreaterThan(SQ);
	});

	it('feeds a strip through the other as a loop, tip first, without stretching it', () => {
		const film = sketchFilm(designLines(load(classicSvg, 'classic-3x3.svg')), 0);
		const starts = film.chapters.map((chapter) => chapter[0]);
		const tags = film.chapters.map((chapter) => chapter[3]);
		const during = (tag: string, u: number) => {
			const at = tags.indexOf(tag);
			return poseAt(film, starts[at]! + (starts[at + 1]! - starts[at]!) * u);
		};
		// The fold-side points of a strip's middle row, from its tip to its root.
		const row = (red: number, across: number) => {
			const points: number[] = [];
			for (let k = 0; k < film.nv; k++)
				if (film.piece[k] === red && film.sign[k] !== -1 && film.rest[2 * k]! < SQ && Math.abs(film.rest[2 * k + 1]! - across) < 0.01) points.push(k);
			return points.sort((p, q) => film.rest[2 * p]! - film.rest[2 * q]!);
		};
		const height = (pose: Float32Array, points: number[]) => Math.max(...points.map((k) => pose[3 * k + 2]!));
		const firstRed = row(1, 2.475);
		const secondWhite = row(0, 1.5);
		expect(firstRed.length).toBeGreaterThan(30);
		expect(secondWhite.length).toBeGreaterThan(30);

		// The first red strip stands as a loop when its tip goes into the first white strip, and is flat after.
		const fed = during('0,0,R', 0.4);
		expect(height(fed, firstRed)).toBeGreaterThan(0.5);
		expect(height(during('0,0,R', 0.95), firstRed)).toBeLessThan(0.08);
		// Its tip is by the white strip's edge then, not out at the fold where it ends up.
		expect(fed[3 * firstRed[0]!]!).toBeGreaterThan(1.9);
		// The white strip opens over it.
		let opened = 0;
		for (let k = 0; k < film.nv; k++)
			if (film.piece[k] === 0 && film.sign[k] === 1 && film.rest[2 * k]! < SQ) opened = Math.max(opened, fed[3 * k + 2]!);
		expect(opened).toBeGreaterThan(0.1);
		// The second white strip, which goes through the red one next, waits lifted off the table.
		expect(height(fed, secondWhite)).toBeGreaterThan(0.5);
		expect(height(during('0,1,W', 0.95), secondWhite)).toBeLessThan(0.05);

		// Paper bends but keeps its length, in every pose.
		for (const [tag, u] of [['start', 0.3], ['row,0', 0.7], ['0,0,R', 0.15], ['0,0,R', 0.5], ['0,1,W', 0.2], ['0,1,W', 0.6], ['row,1', 0.3]] as const) {
			const pose = during(tag, u);
			for (const points of [firstRed, secondWhite])
				for (let i = 1; i < points.length; i++) {
					const [p, q] = [points[i - 1]!, points[i]!];
					const length = Math.hypot(pose[3 * q]! - pose[3 * p]!, pose[3 * q + 1]! - pose[3 * p + 1]!, pose[3 * q + 2]! - pose[3 * p + 2]!);
					const flat = film.rest[2 * q]! - film.rest[2 * p]!;
					expect(length, `${tag} ${u}`).toBeGreaterThan(flat * 0.55);
					expect(length, `${tag} ${u}`).toBeLessThan(flat * 1.25 + 0.01);
				}
		}
	});

	it('lays a curved heart flat inside the heart’s outline ("Tulipan")', () => {
		const design = load(tulipanSvg, 'tulipan.svg');
		const film = sketchFilm(designLines(design), design.weaveParity ?? 0);
		const end = poseAt(film, span(film));
		for (let k = 0; k < film.nv; k++) {
			expect(end[3 * k]!).toBeGreaterThan(-1e-3);
			expect(end[3 * k + 1]!).toBeGreaterThan(-1e-3);
			expect(Math.abs(end[3 * k + 2]!)).toBeLessThan(0.05);
		}
	});

	it('starts with the halves apart and keeps every point somewhere', () => {
		const design = load(sunSvg, 'sun.svg');
		const film = sketchFilm(designLines(design), design.weaveParity ?? 0, 2.5);
		const start = poseAt(film, 0);
		for (let k = 0; k < film.nv; k++) if (film.piece[k] === 1) expect(start[3 * k]!).toBeGreaterThan(SQ);
		for (let step = 0; step <= 40; step++)
			expect(poseAt(film, (span(film) * step) / 40).every(Number.isFinite)).toBe(true);
	});

	it('makes a film of any lines at all', () => {
		const odd: Point[][][] = [
			[],
			[[[10, 20], [90, 70]]],
			[[[30, 30], [70, 30], [70, 70], [30, 70], [30, 30]]],
			[[[50, 50], [50, 50]]],
			[[[0, 40], [100, 40]], [[0, 40], [100, 40]]],
			[[[-40, 150], [220, -30]]]
		];
		for (const lines of odd) {
			const film = sketchFilm(lines, 0);
			expect(film.nv).toBeGreaterThan(0);
			expect(film.chapters[0]![3]).toBe('start');
			expect(poseAt(film, span(film) / 2).every(Number.isFinite)).toBe(true);
			expect(poseAt(film, span(film)).every(Number.isFinite)).toBe(true);
		}
	});
});
