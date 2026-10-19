import { describe, expect, it } from 'vitest';
import { slow } from './slow.test-helpers';
import { generate, type GeneratorRequest } from './generate';
import { picture } from './picture';
import { inside, type Ring } from './geometry';
import { rasterizeDesign } from '$lib/paint/rasterize';
import star from '../../../static/generator/motifs/star.json';
import heart from '../../../static/generator/motifs/heart.json';
import tree from '../../../static/generator/motifs/tree.json';
import nunito from '../../../static/generator/fonts/nunito.json';
import oswald from '../../../static/generator/fonts/oswald.json';
import type { Font } from './geometry';

const colors = { left: '#ffffff', right: '#cc0000' };

/** The share of the square where the picture and the finished heart differ. */
function mismatch(request: GeneratorRequest, n = 100): number {
	const result = generate(request), mask = rasterizeDesign(result.design, n).data;
	// The page knows what the default size chose once it has made it: where
	// the figure in the checks lies, which pattern the small motifs repeat.
	const fixed = request.place !== undefined || (request.scale ?? .7) === .7, base = fixed ? result : generate({ ...request, scale: .7 });
	// Where its strips could not all be whole at the size asked for, the
	// generator says which it kept; a board circle's kept size says which
	// circle the motif keeps.
	const board = request.mode === 'figure' && request.style === 'board';
	const circle = board && result.scale !== undefined ? (request.scale ?? .7) > .7 ? 'small' as const : 'large' as const : undefined;
	const { rings } = picture({ ...request, scale: board ? request.scale : result.scale ?? request.scale, layout: base.layout }, { place: base.place, circle })!;
	let differ = 0;
	for (let y = 0; y < n; y++)
		for (let x = 0; x < n; x++) {
			const p: [number, number] = [(x + .5) * 100 / n, (y + .5) * 100 / n];
			const right = rings.reduce((n, ring) => n ^ Number(inside(p, ring as Ring)), 0);
			if (right !== mask[y * n + x]) differ++;
		}
	return differ / n / n;
}

describe('the picture drawn before the cuts are found', () => {
	it('is the figure in the checks the cuts make, at the default size and at full size', () => {
		const request: GeneratorRequest = { mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'strips' };
		// Only where the fitted curves pass between pixel centres.
		expect(mismatch(request)).toBeLessThan(.01);
		expect(mismatch({ ...request, scale: 1 })).toBeLessThan(.01);
	});

	it('follows the strips and the place the visitor chose', () => {
		const request: GeneratorRequest = { mode: 'figure', name: 'Heart', contours: heart.contours as Ring[], colors, style: 'strips', board: 3 };
		expect(mismatch(request)).toBeLessThan(.01);
		expect(mismatch({ ...request, place: -8 })).toBeLessThan(.01);
	});

	slow('is the figure in the checks the cuts make on every board and size', () => {
		for (const [name, contours] of Object.entries({ star: star.contours, tree: tree.contours, heart: heart.contours }) as [string, Ring[]][])
			for (const board of [3, 4, 5, 6])
				for (const scale of [.5, .7, .85, 1])
					expect(mismatch({ mode: 'figure', name, contours, colors, style: 'strips', board, scale }), `${name} ${board} ${scale}`).toBeLessThan(.015);
	}, 120000);

	it('tells a drag how far the figure in the checks keeps its size', () => {
		const request: GeneratorRequest = { mode: 'figure', name: 'Heart', contours: heart.contours as Ring[], colors, style: 'strips', scale: .8 };
		const { range } = picture(request)!, [low, high] = range!;
		const height = (place: number) => {
			const motif = picture({ ...request, place })!.rings.slice(0, heart.contours.length).flat();
			const v = motif.map(([x, y]) => (x + y - 100) / Math.SQRT2);
			return Math.max(...v) - Math.min(...v);
		};
		// The heart's wide lobes stop it sooner going up than its point going down.
		expect(low).toBeLessThan(0);
		expect(high).toBeGreaterThan(-low);
		for (const place of [low, (low + high) / 2, high]) expect(height(place)).toBeCloseTo(height(0), 6);
		expect(height(high + 3)).toBeLessThan(height(0) - 1);
	});

	it('is the small motifs the cuts make', () => {
		const request: GeneratorRequest = { mode: 'figure', name: 'Tree', contours: tree.contours as Ring[], colors, style: 'motifs' };
		expect(mismatch(request)).toBeLessThan(.01);
	});

	slow('is the letters on the checkerboard the cuts make', () => {
		for (const [text, font] of [['JUL', nunito], ['GOD\nJUL', oswald]] as const)
			expect(mismatch({ mode: 'text', name: text, text, font: font as unknown as Font, colors, textFrame: 'checkered' }), text).toBeLessThan(.01);
		expect(mismatch({ mode: 'figure', name: 'Heart', contours: heart.contours as Ring[], colors, style: 'motifs', scale: .85 })).toBeLessThan(.01);
	}, 30000);

	it('is the circle frames the cuts make, on their usual board of three strips', () => {
		for (const style of ['rays', 'check'] as const)
			expect(mismatch({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style, gap: 3 }), style).toBeLessThan(.01);
		// A motif that needed a finer board there gets no picture.
		expect(picture({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'rays' }, { board: 5 })).toBeUndefined();
	});

	it('is the woven and airy letters the cuts make', () => {
		for (const textFrame of ['woven', 'air'] as const)
			for (const text of ['KIM', 'GOD\nJUL'])
				expect(mismatch({ mode: 'text', name: text, text, font: oswald as unknown as Font, colors, textFrame, fittedCells: false }), `${textFrame} ${text}`).toBeLessThan(.01);
	});

	slow('is the woven letters the cuts make, whatever the number of columns', () => {
		// The board's checks turn with the columns' parity: every cell lies on a dark square.
		for (const text of ['JUL', 'ANNA', 'Thomas'])
			expect(mismatch({ mode: 'text', name: text, text, font: nunito as unknown as Font, colors, textFrame: 'woven', fittedCells: false }), text).toBeLessThan(.015);
	}, 30000);

	it('is the open frames the cuts make: wedges, the fitted strips and the large silhouette', () => {
		for (const style of ['wedges', 'fitted', 'silhouette'] as const)
			expect(mismatch({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style }), style).toBeLessThan(.01);
	});

	it('is the motif in the centre square the cuts make', () => {
		expect(mismatch({ mode: 'figure', name: 'Tree', contours: tree.contours as Ring[], colors, style: 'squares' })).toBeLessThan(.01);
	});

	it('is the circle on a board the cuts make, small, large or kept', () => {
		const request: GeneratorRequest = { mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'board', gap: 3 };
		expect(mismatch({ ...request, scale: .6 })).toBeLessThan(.01);
		// Reaching into the outer ring, the checks are woven the other way round.
		expect(mismatch({ ...request, scale: .8 })).toBeLessThan(.01);
		// A solid tree keeps the touching circle, as its heart says.
		expect(mismatch({ ...request, name: 'Tree', contours: tree.contours as Ring[], scale: .8 })).toBeLessThan(.01);
	});

	it('has none yet for the other frames', () => {
		expect(picture({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'corners' })).toBeUndefined();
	});
});
