import { describe, expect, it } from 'vitest';
import { slow } from './slow.test-helpers';
import { generate, type GeneratorRequest } from './generate';
import { picture } from './picture';
import { inside, type Ring } from './geometry';
import { rasterizeDesign } from '$lib/paint/rasterize';
import star from '../../../static/generator/motifs/star.json';
import heart from '../../../static/generator/motifs/heart.json';
import tree from '../../../static/generator/motifs/tree.json';

const colors = { left: '#ffffff', right: '#cc0000' };

/** The share of the square where the picture and the finished heart differ. */
function mismatch(request: GeneratorRequest, n = 100): number {
	const result = generate(request), mask = rasterizeDesign(result.design, n).data;
	// The page knows where the default size put the motif once it has made it.
	const place = request.place !== undefined || (request.scale ?? .7) === .7 ? result.place : generate({ ...request, scale: .7 }).place;
	// Where its strips could not all be whole at the size asked for, the
	// generator says which it kept.
	const { rings } = picture({ ...request, scale: result.scale ?? request.scale }, place)!;
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

	it('has none yet for the other frames', () => {
		expect(picture({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'rays' })).toBeUndefined();
	});
});
