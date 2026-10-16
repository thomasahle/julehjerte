import { expect, it } from 'vitest';
import { generateFittedFigure } from './fitted';
import { generate } from './generate';
import { fourPortMotif, uprightToSheet, type Ring } from './geometry';
import { normalizeContours } from './contours';
import { cutTipCounts } from './cutQuality';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { findFingersWithIssues, intersectionMarginPx } from '$lib/editor/curveIssues';
import { normalizeHeartDesign, serializeHeartDesign, serializeHeartToSVG, parseHeartFromSVG } from '$lib/utils/heartDesign';
import { rasterizeDesign } from '$lib/paint/rasterize';
import moonStars from '../../../static/generator/motifs/ph-moon-stars.json';
import rabbit from '../../../static/generator/motifs/ph-rabbit.json';
import butterfly from '../../../static/generator/motifs/tb-butterfly.json';

it('changes fitted attachments without moving the silhouette or adding a surrounding shape', () => {
	const rings = normalizeContours(moonStars.contours as Ring[]);
	const c = generateFittedFigure(rings, 70, .7, fourPortMotif, [.15, -.15, .15, -.15]);
	const expected = rings.map(r => r.map(([x, y]) => uprightToSheet([x * 49, y * 49])));
	for (const [r, ring] of c.artwork.entries()) for (const [i, point] of ring.entries())
		for (const axis of [0, 1]) expect(point[axis]).toBeCloseTo(expected[r][i][axis], 12);
	expect(c.domain.slice(1)).toEqual(c.artwork);
	for (const gate of c.domain[0]) expect(c.artwork.flat()).toContainEqual(gate);
});

for (const [name, motif, tips] of [
	['moon and stars', moonStars, [0, 1]], ['rabbit', rabbit, [0, 3]], ['butterfly', butterfly, [3, 6]]
] as const) it(`fits the grid to ${name} and retains its cuts through both exports`, () => {
	const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], style: 'fitted',
		colors: { left: '#fffdf5', right: '#b72f2b' } });
	expect(design.gridSize).toEqual({ x: 5, y: 5 });
	expect(cutTipCounts(design)).toEqual(tips);
	const original = rasterizeDesign(design, 240).data;
	for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)), parseHeartFromSVG(serializeHeartToSVG(design))]) {
		expect(restored).not.toBeNull();
		expect(restored!.fingers).toHaveLength(design.fingers.length);
		expect(restored).not.toHaveProperty('leftCutouts');
		expect(restored).not.toHaveProperty('rightCutouts');
		const rect = inferOverlapRect(restored!.fingers, restored!.gridSize);
		expect(findFingersWithIssues(restored!.fingers,
			intersectionMarginPx(rect, gridClearanceScale(5, 5))).size).toBe(0);
		expect(rasterizeDesign(restored!, 240).data).toEqual(original);
	}
}, 20000);
