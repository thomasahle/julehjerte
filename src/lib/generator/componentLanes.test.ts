import { it, expect } from 'vitest';
import { slow } from './slow.test-helpers';
import { generateComponentLanes } from './componentLanes';
import { generate } from './generate';
import { normalizeContours } from './contours';
import { cutTipCounts } from './cutQuality';
import { frameRing, uprightToSheet, SILHOUETTE, type Edge, type Ring } from './geometry';
import { gridClearanceScale } from '$lib/geometry/clearance';
import { inferOverlapRect } from '$lib/utils/overlapRect';
import { intersectionMarginPx } from '$lib/editor/curveIssues';
import { findSearchIssues } from './searchClearance';
import { normalizeHeartDesign, serializeHeartDesign, serializeHeartToSVG, parseHeartFromSVG } from '$lib/utils/heartDesign';
import { rasterizeDesign } from '$lib/paint/rasterize';
import coffee from '../../../static/generator/motifs/ph-coffee.json';
import santaHat from '../../../static/generator/motifs/gi-santa-hat.json';
import candyCane from '../../../static/generator/motifs/mdi-candy-cane.json';

it('keeps the cup, its handle and separate steam contours in the original frame', () => {
	const contours = normalizeContours(coffee.contours as Ring[]);
	for (const aligned of [false, true]) {
		const construction = generateComponentLanes(contours, 'circle', 70, .7, 'check', aligned);
		expect(construction.artwork).toEqual(contours.map(r => r.map(([x, y]) => uprightToSheet([x * 49, y * 49]))));
		expect(construction.domain).toEqual([frameRing('circle', 70)]);
		expect(construction.geometry.A_overlap_paths).toHaveLength(3);
		expect(construction.geometry.B_overlap_paths).toHaveLength(3);
	}
});

/** Shared cuts crossing an outline, other than where they meet it. */
const crossingOutlines = (edges: Edge[]) => {
	const side = (p: number[], q: number[], r: number[]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
	const outlines = edges.filter(e => e.kind === 'outline');
	return edges.filter(e => e.kind === 'shared').filter(e => outlines.some(o =>
		side(e.from, e.to, o.from) * side(e.from, e.to, o.to) < 0 && side(o.from, o.to, e.from) * side(o.from, o.to, e.to) < 0)).length;
};

it('moves a lane holding no part of the motif past the parts reaching across it, as a last resort', () => {
	// The santa hat as large as the silhouette has it: the hat reaches across
	// the middle of a lane that holds none of the motif's parts.
	const contours = normalizeContours(santaHat.contours as Ring[]), open = { ...SILHOUETTE, gap: 3 };
	const through = generateComponentLanes(contours, open, 100, .6, 'check', true);
	expect(through.passes).toBe(true);
	expect(crossingOutlines(through.edges)).toBeGreaterThan(0);
	expect(crossingOutlines(generateComponentLanes(contours, open, 100, .6, 'check', true, 0, true).edges)).toBe(0);
});

slow('builds the santa hat in the large silhouette rather than refuse it', () => {
	expect(() => generate({ mode: 'figure', name: 'hat', contours: santaHat.contours as Ring[], style: 'silhouette', scale: .7, gap: 3,
		colors: { left: '#fff', right: '#b91313' } })).not.toThrow();
}, 60000);

slow('builds the candy cane in the sunburst at half size, its lanes inside the border, rather than refuse it', () => {
	expect(() => generate({ mode: 'figure', name: 'cane', contours: candyCane.contours as Ring[], style: 'sunburst', scale: .5, gap: 3,
		colors: { left: '#fff', right: '#b91313' } })).not.toThrow();
}, 30000);

for (const [name, motif, frame, style, tips] of [
	['coffee', coffee, 'circle', 'check', [0, 2]]
] as const) slow(`keeps a clearance reserve for ${name} in ${frame}-${style}, including both exports`, () => {
	const { design } = generate({ mode: 'figure', name, contours: motif.contours as Ring[], frame, style,
		colors: { left: '#fff', right: '#b91313' } });
	expect(design.gridSize).toEqual({ x: 4, y: 4 });
	expect(cutTipCounts(design)).toEqual(tips);
	const before = rasterizeDesign(design, 240).data;
	for (const restored of [normalizeHeartDesign(serializeHeartDesign(design)), parseHeartFromSVG(serializeHeartToSVG(design))]) {
		expect(restored).not.toBeNull();
		expect(restored!.fingers).toHaveLength(design.fingers.length);
		expect(restored).not.toHaveProperty('leftCutouts');
		expect(restored).not.toHaveProperty('rightCutouts');
		const rect = inferOverlapRect(restored!.fingers, restored!.gridSize),
			margin = intersectionMarginPx(rect, gridClearanceScale(4, 4));
		expect(findSearchIssues(restored!.fingers, margin * 1.1).size).toBe(0);
		expect(rasterizeDesign(restored!, 240).data).toEqual(before);
	}
}, 20000);
