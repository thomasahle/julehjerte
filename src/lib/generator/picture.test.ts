import { describe, expect, it } from 'vitest';
import { slow } from './slow.test-helpers';
import { generate, type GeneratorRequest } from './generate';
import { picture } from './picture';
import { clampPlace } from './stripFigure';
import { checkedTips } from './cornerChecks';
import { inside, uprightToSheet, type Ring } from './geometry';
import { rasterizeDesign } from '$lib/paint/rasterize';
import star from '../../../static/generator/motifs/star.json';
import heart from '../../../static/generator/motifs/heart.json';
import tree from '../../../static/generator/motifs/tree.json';
import house from '../../../static/generator/motifs/house.json';
import bell from '../../../static/generator/motifs/bell.json';
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
	const { rings } = picture({ ...request, scale: board ? request.scale : result.scale ?? request.scale, layout: base.layout },
		{ place: base.place, circle, enclosed: !!result.enclosed })!;
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
		expect(mismatch({ ...request, place: -4, side: 6 })).toBeLessThan(.01);
	});

	slow('is the figure in the checks the cuts make on every board and size', () => {
		for (const [name, contours] of Object.entries({ star: star.contours, tree: tree.contours, heart: heart.contours }) as [string, Ring[]][])
			for (const board of [3, 4, 5, 6])
				for (const scale of [.5, .7, .85, 1])
					expect(mismatch({ mode: 'figure', name, contours, colors, style: 'strips', board, scale }), `${name} ${board} ${scale}`).toBeLessThan(.015);
	}, 120000);

	it('tells a drag how far the figure in the checks keeps its size, along the middle and across it', () => {
		const request: GeneratorRequest = { mode: 'figure', name: 'Heart', contours: heart.contours as Ring[], colors, style: 'strips', scale: .8 };
		const bounds = picture(request)!.bounds!, { sum, difference } = bounds;
		// The motif's height, and its middle across the heart.
		const box = (place: number, side = 0) => {
			const motif = picture({ ...request, place, side })!.rings.slice(0, heart.contours.length).flat();
			const u = motif.map(([x, y]) => (x - y) / Math.SQRT2), v = motif.map(([x, y]) => (x + y - 100) / Math.SQRT2);
			return { height: Math.max(...v) - Math.min(...v), middle: (Math.max(...u) + Math.min(...u)) / 2 };
		};
		const { height } = box(0);
		// On the middle the heart's wide lobes stop it sooner going up than its point going down.
		const low = Math.max(sum[0], difference[0]), high = Math.min(sum[1], difference[1]);
		expect(low).toBeLessThan(0);
		expect(high).toBeGreaterThan(-low);
		for (const place of [low, (low + high) / 2, high]) expect(box(place).height).toBeCloseTo(height, 6);
		expect(box(high + 3).height).toBeLessThan(height - 1);
		// Across, as far as the paper's sides let it, which a drag further keeps it at.
		const [place, side] = clampPlace(bounds, 0, 40);
		expect(side).toBeGreaterThan(5);
		expect(box(place, side).height).toBeCloseTo(height, 6);
		expect(box(place, side).middle).toBeCloseTo(box(place).middle + side, 6);
		expect(box(place, side + 3).height).toBeLessThan(height - 1);
		expect(clampPlace(bounds, place, side + 3)).toEqual([place, side].map(n => expect.closeTo(n, 9)));
		// A drag's steps keep it within them, so it keeps its size there too.
		const [stepped, across] = clampPlace(bounds, 0, 40, .25);
		expect(box(stepped, across).height).toBeCloseTo(height, 6);
		expect(across).toBeGreaterThan(side - .25);
	});

	it('is the small motifs the cuts make, on the strips they choose or the visitor chooses', () => {
		const request: GeneratorRequest = { mode: 'figure', name: 'Tree', contours: tree.contours as Ring[], colors, style: 'motifs' };
		expect(mismatch(request)).toBeLessThan(.01);
		expect(mismatch({ ...request, board: 6 })).toBeLessThan(.01);
		// The bell on the other colour of four strips, as its heart says.
		expect(mismatch({ ...request, name: 'Bell', contours: bell.contours as Ring[] })).toBeLessThan(.01);
	});

	slow('is the letters on the checkerboard the cuts make', () => {
		for (const [text, font] of [['JUL', nunito], ['GOD\nJUL', oswald]] as const)
			expect(mismatch({ mode: 'text', name: text, text, font: font as unknown as Font, colors, textFrame: 'checkered' }), text).toBeLessThan(.01);
		expect(mismatch({ mode: 'figure', name: 'Heart', contours: heart.contours as Ring[], colors, style: 'motifs', scale: .85 })).toBeLessThan(.01);
	}, 30000);

	it('is the circle frames the cuts make, rays, checks, sunburst and double border, on their usual boards', () => {
		for (const style of ['rays', 'check', 'sunburst', 'layers'] as const)
			expect(mismatch({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style, gap: 3 }), style).toBeLessThan(.01);
		// A motif that needed a finer board there gets no picture.
		expect(picture({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'rays' }, { board: 5 })).toBeUndefined();
	});

	it('is the woven letters the cuts make, with the space around them the visitor sets', () => {
		for (const room of [undefined, .35, .5])
			for (const text of ['KIM', 'GOD\nJUL'])
				expect(mismatch({ mode: 'text', name: text, text, font: oswald as unknown as Font, colors, textFrame: 'woven', fittedCells: false, room }), `${room} ${text}`).toBeLessThan(.01);
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

	it('is the motif in the centre square the cuts make, on the strips it chooses or the visitor chooses', () => {
		const request: GeneratorRequest = { mode: 'figure', name: 'Tree', contours: tree.contours as Ring[], colors, style: 'squares' };
		expect(mismatch(request)).toBeLessThan(.01);
		expect(mismatch({ ...request, board: 5 })).toBeLessThan(.01);
		expect(mismatch({ ...request, name: 'Star', contours: star.contours as Ring[], board: 9, scale: .8 })).toBeLessThan(.01);
	});

	it('is the circle on a board the cuts make, small, large or kept', () => {
		const request: GeneratorRequest = { mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'board', gap: 3 };
		expect(mismatch({ ...request, scale: .6 })).toBeLessThan(.01);
		// Reaching into the outer ring, the checks are woven the other way round.
		expect(mismatch({ ...request, scale: .8 })).toBeLessThan(.01);
		// A solid tree keeps the touching circle, as its heart says.
		expect(mismatch({ ...request, name: 'Tree', contours: tree.contours as Ring[], scale: .8 })).toBeLessThan(.01);
		// Past 85% the circle overlaps the corner squares, of its own colour,
		// a house on its smallest enclosing circle.
		expect(mismatch({ ...request, name: 'House', contours: house.contours as Ring[], scale: 1 })).toBeLessThan(.01);
	});

	it('is the checks in the tips the cuts make, at any space around the motif', () => {
		for (const gap of [0, 3, 15])
			expect(mismatch({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'corners', gap }), `${gap}`).toBeLessThan(.01);
		// The tips come as near as cutting allows at no space: the star's top
		// point stands just clear of the middle lane's corner (s, s).
		const placed = star.contours.map(r => r.map(([x, y]) => uprightToSheet([x * 49, y * 49]))) as Ring[];
		const tips = checkedTips(placed), nearest = Math.min(...placed.flat().map(([x, y]) => Math.max(x, y)));
		expect(nearest - tips.s).toBeGreaterThan(1);
		expect(nearest - tips.s).toBeLessThan(1.2);
	});

	it('has none yet for letters in a circle', () => {
		expect(picture({ mode: 'text', name: 'JUL', text: 'JUL', font: oswald as unknown as Font, colors, textFrame: 'circle' })).toBeUndefined();
	});
});
