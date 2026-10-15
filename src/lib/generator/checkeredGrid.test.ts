import { describe, it, expect } from 'vitest';
import { generate } from './generate';
import { generateCheckeredGrid, checkeredGridCache } from './checkeredGrid';
import { defaults, readGeneratorState } from './state';
import { geometryKey } from './cache';
import { templateVariants } from './templates';
import { usableMotif, type Font } from './geometry';
import nunito from '../../../static/generator/fonts/nunito.json';
import { rasterizeDesign } from '$lib/paint/rasterize';
import { normalizeHeartDesign, serializeHeartDesign, serializeHeartToSVG, parseHeartFromSVG } from '$lib/utils/heartDesign';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { gridClearance, gridClearanceScale } from '$lib/geometry/clearance';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { convertValidatedCutGeometry } from '$lib/inverse/toHeartDesign';

const font = nunito as unknown as Font;
const colors = { left: '#fffdf5', right: '#b72f2b' };
const make = (text: string) => generate({ mode: 'text', name: text, text, font, colors, textFrame: 'repeat-check' }).design;
const cutTurns = (design: ReturnType<typeof make>) => design.fingers.flatMap(finger => finger.segments.slice(1).map((next, i) => {
	const previous = finger.segments[i];
	const ux = previous.p3.x - previous.p2.x, uy = previous.p3.y - previous.p2.y;
	const vx = next.p1.x - next.p0.x, vy = next.p1.y - next.p0.y;
	return Math.atan2(Math.abs(ux * vy - uy * vx), ux * vx + uy * vy) * 180 / Math.PI;
}));

describe('repeated letters with alternating backgrounds', () => {
	it('reuses clear letters while moving only the connections that need repair', () => {
		const cache = checkeredGridCache();
		generateCheckeredGrid('jul', font, .82, .35, { cache });
		const completed = new Map([...cache].filter(([, piece]) => usableMotif(piece.edges, piece.gates, gridClearance(6))));
		expect(completed.size).toBeGreaterThan(0);
		let changed = false;
		const repaired = generateCheckeredGrid('jul', font, .82, .35, { cache, repair: true, onRepair: () => { changed = true; } });
		expect(changed).toBe(true);
		for (const [key, piece] of completed) expect(cache.get(key)).toBe(piece);
		const cells = [...cache].filter(([key]) => key.endsWith(':repair')).map(([, piece]) => piece);
		expect(cells.some(piece => piece.insets[0] !== .35 || piece.insets[1] !== .65)).toBe(true);
		for (const piece of cells) {
			expect(piece.usable).toBe(true);
			expect(piece.insets[0]).toBeLessThan(.5);
			expect(piece.insets[1]).toBeGreaterThan(.5);
		}
		const { design } = convertValidatedCutGeometry(repaired.geometry, { name: 'jul', tolerance: .025, clearanceScale: gridClearanceScale(6), overlapAspectRatio: 1 });
		expect(design.gridSize).toEqual({ x: 6, y: 6 });
	}, 20000);
	it('weaves the exact ANNA matrix with opposite letter and background colours', () => {
		const design = make('ANNA');
		expect(design.gridSize).toEqual({ x: 4, y: 4 });
		const mask = rasterizeDesign(design, 400).data;
		const sample = (x: number, y: number) => mask[Math.floor(y * 4) * 400 + Math.floor(x * 4)];
		for (const [row, line] of ['ANNA', 'NNAA', 'NAAN', 'AANN'].entries())
			for (const [col, char] of [...line].entries()) {
				const x = (col + .5) * 25, y = (row + .5) * 25, background = (row + col) % 2;
				expect(sample(col * 25 + 1, row * 25 + 1)).toBe(background);
				// N's diagonal crosses the centre; A's counter stays background paper.
				expect(sample(x, y)).toBe(Number(char === 'N') ^ background);
				if (char === 'A') expect(sample(x + 2.5, y + 2.5)).toBe(1 ^ background);
			}
	}, 20000);
	it('avoids needle points and reduces sharp tongues in the exported ANNA cuts', () => {
		const design = make('ANNA');
		const turns = cutTurns(design);
		// Before route optimization there were 34 tips narrower than 45°, eight
		// narrower than 30°. Comparing connection layouts improves 16 to 10.
		// Measure actual cut tangents, not the routing score.
		expect(turns.filter(turn => turn > 135).length).toBeLessThanOrEqual(10);
		expect(Math.max(...turns)).toBeLessThan(150);
	}, 20000);
	it('keeps JUL’s broad connections when the alternate layout creates sharp tips', () => {
		expect(Math.max(...cutTurns(make('JUL')))).toBeLessThan(135);
	}, 20000);
	for (const [text, n] of [['ANNA', 4], ['JUL', 6], ['O', 2], ['anna', 4], ['SØREN', 10], ['M&M', 6], ['A\u030A', 2]] as const)
		it(`preserves ${text} and its checkerboard through JSON and SVG`, () => {
			const design = make(text), original = rasterizeDesign(design, 160).data;
			expect(design.gridSize).toEqual({ x: n, y: n });
			for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)), parseHeartFromSVG(serializeHeartToSVG(design))]) {
				expect(restored?.fingers.length).toBe(design.fingers.length);
				expect(restored).not.toHaveProperty('rightCutouts');
				expect(restored).not.toHaveProperty('leftCutouts');
				const rect = inferOverlapRect(restored!.fingers, restored!.gridSize);
				expect(rect.width).toBeCloseTo(rect.height);
				const margin = intersectionMarginPx(rect, gridClearanceScale(n));
				expect(findFingersWithIssues(restored!.fingers, margin).size).toBe(0);
				const actual = rasterizeDesign(restored!, 160).data;
				expect(actual.reduce((sum, v, i) => sum + Number(v !== original[i]), 0) / actual.length).toBeLessThan(.002);
			}
		}, 20000);
	it('is a distinct shareable frame with actual template previews', () => {
		const state = { ...defaults, mode: 'text' as const, textFrame: 'repeat-check' as const };
		expect(readGeneratorState('#make=' + encodeURIComponent(JSON.stringify(state)))).toEqual(state);
		expect(templateVariants(state).find(v => v.id === 'repeat-check')?.state).toEqual(state);
		expect(geometryKey(state)).not.toBe(geometryKey({ ...state, textFrame: 'repeat' }));
	});
	it('refuses missing characters and excessive grids before building cuts', () => {
		expect(() => make(' ')).toThrow(/Empty text/);
		expect(() => make('♥')).toThrow();
		expect(() => make('GLÆDELIG\nJUL')).toThrow(/Too many letters/);
	});
});
