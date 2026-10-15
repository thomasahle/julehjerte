import { describe, it, expect } from 'vitest';
import { generate } from './generate';
import {
	compile,
	fourPortMotif,
	ray,
	hasCounterContact,
	ConstructionError,
	generateFigure,
	generateCheckedText,
	FRAMES,
	type Frame,
	type TextFrame,
	inside,
	type Font,
	type Ring,
	type Edge
} from './geometry';
import {
	normalizeHeartDesign,
	serializeHeartDesign,
	serializeHeartToSVG,
	parseHeartFromSVG
} from '$lib/utils/heartDesign';
import { rasterizeDesign } from '$lib/paint/rasterize';
import { serializeTemplateToSVG } from '$lib/utils/templateSvg';
import { renderHeartSvgMarkup } from '$lib/rendering/heartSvg';

import { defaults, readGeneratorState } from './state';
import nunito from '../../../static/generator/fonts/nunito.json';
import bree from '../../../static/generator/fonts/breeserif.json';
import oswald from '../../../static/generator/fonts/oswald.json';
import cinzel from '../../../static/generator/fonts/cinzel.json';
import kalam from '../../../static/generator/fonts/kalam.json';
import righteous from '../../../static/generator/fonts/righteous.json';
import star from '../../../static/generator/motifs/star.json';
import tree from '../../../static/generator/motifs/tree.json';
import heart from '../../../static/generator/motifs/heart.json';
import flower from '../../../static/generator/motifs/flower.json';
import cat from '../../../static/generator/motifs/ph-cat.json';
const colors = { left: '#fffdf5', right: '#b72f2b' };
const fonts = {
	nunito,
	bree,
	oswald,
	cinzel,
	kalam,
	righteous
} as unknown as Record<string, Font>;
const text = (
	value: string,
	font = fonts.nunito,
	textFrame: TextFrame = 'woven'
) =>
	generate({ mode: 'text', name: value, text: value, font, colors, textFrame });
const figure = (
	contours: Ring[],
	frame: Frame = 'circle',
	style: 'rays' | 'check' | 'plain' = 'rays'
) =>
	generate({ mode: 'figure', name: 'Figure', contours, colors, frame, style });
const circle = (radius: number, x = 0, y = 0): Ring =>
	Array.from({ length: 80 }, (_, i) => [
		x + radius * Math.cos((i * 2 * Math.PI) / 80),
		y + radius * Math.sin((i * 2 * Math.PI) / 80)
	]);

describe('constructive figure generator', () => {
	it('keeps the first forward ray hit and reports a missing visible attachment', () => {
		const ring: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
		expect(ray(ring, [-2, 5], 0).point).toEqual([0, 5]);
		expect(ray(ring, [0, 5], 0).point).toEqual([10, 5]);
		expect(() => ray(ring, [0, 5], Math.PI)).toThrow('No visible contour port');
	});
	it('distinguishes a touching counter from separate touching silhouettes', () => {
		const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
		const touching: Ring = [[5, 0], [7, 3], [3, 3]];
		expect(hasCounterContact([square, touching])).toBe(true);
		expect(hasCounterContact([square, touching.map(([x, y]) => [x, y + .1])])).toBe(false);
		expect(hasCounterContact([square, [[10, 10], [12, 10], [12, 12], [10, 12]]])).toBe(false);
	});

	it('checks practical cut candidates with the caller’s retained-path validator', () => {
		const ring: Ring = [[40, 40], [60, 40], [60, 60], [40, 60]];
		const gates: Ring = [[30, 30], [70, 30], [70, 70], [30, 70]];
		expect(() => fourPortMotif([], [ring], gates, [Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4], 1.5, [0, 1, 2, 3], () => false, { practical: true })).toThrow(ConstructionError);
	});
	for (const frame of FRAMES)
		for (const style of ['rays', 'check', 'plain'] as const)
			it(`${frame} / ${style} preserves the star`, () => {
				const { design } = figure(star.contours as Ring[], frame, style);
				expect(design.fingers.length).toBeGreaterThan(4);
				expect(design).not.toHaveProperty('rightCutouts');
				const mask = rasterizeDesign(design, 240);
				// Independent source-art point classification inside the motif's disc.
				for (let y = 85; y < 155; y++)
					for (let x = 85; x < 155; x++) {
						const p: [number, number] = [
							((x + 0.5) * 100) / 240,
							((y + 0.5) * 100) / 240
						];
						const u: [number, number] = [
							((p[0] - p[1]) * Math.SQRT1_2) / (frame === 'oval' ? 36.75 : 49),
							((p[0] + p[1] - 100) * Math.SQRT1_2) /
								(frame === 'oval' ? 36.75 : 49)
						];
						if (inside(u, star.contours[0] as Ring))
							expect(mask.data[y * 240 + x]).toBe(1);
					}
			});
	it('constructs enclosed symbol details using ordinary open cuts', () => {
		expect(figure(tree.contours as Ring[]).design).not.toHaveProperty(
			'rightCutouts'
		);
		expect(figure(heart.contours as Ring[]).design).not.toHaveProperty(
			'rightCutouts'
		);
		expect(figure(cat.contours as Ring[]).design).not.toHaveProperty(
			'rightCutouts'
		);
	});
	it('weaves a hole, nested islands and separate components without cut-outs', () => {
		for (const rings of [
			flower.contours,
			[circle(0.45), circle(0.25)],
			[circle(0.45), circle(0.28), circle(0.12)],
			[circle(0.13, -0.25), circle(0.13, 0.25)]
		]) {
			const result = figure(rings as Ring[]);
			expect(result.design).not.toHaveProperty('rightCutouts');
			expect(result.recipe).toBe('nested');
		}
	});
	it('does not turn an excessively thin ring into a downloadable template', () => {
		expect(() => figure([circle(0.45), circle(0.444)])).toThrow();
	});
	it('uses each visible edge in one sheet and each shared edge in both', () => {
		const r = generateFigure(star.contours as Ring[]);
		for (const [index, edge] of r.edges.entries()) {
			const counts = [
				r.geometry.A_overlap_paths,
				r.geometry.B_overlap_paths
			].map(
				(paths) =>
					paths.flat().filter((ref) => ref.curve === String(index)).length
			);
			expect(counts).toEqual(
				edge.family === 'AB' ? [1, 1] : edge.family === 'A' ? [1, 0] : [0, 1]
			);
		}
		expect(() => compile([...r.edges, r.edges[0]])).toThrow(ConstructionError);
		const cycle: Edge[] = [
			[
				[45, 45],
				[55, 45]
			],
			[
				[55, 45],
				[55, 55]
			],
			[
				[55, 55],
				[45, 55]
			],
			[
				[45, 55],
				[45, 45]
			]
		].map(([from, to]) => ({
			from: from as [number, number],
			to: to as [number, number],
			family: 'A',
			kind: 'outline'
		}));
		expect(() => compile([...r.edges, ...cycle])).toThrow(/Closed/);
	});
});

describe('letter construction and export', () => {
	for (const value of ['ANNA', 'JUL', 'ÅSE', 'BØ', 'Anna', 'A+M', 'AOBØ'])
		it(`constructs ${value}`, () => {
			const result = text(value);
			expect(result.design.name).toBe(value);
			expect(result.design.gridSize.x).toBeGreaterThan(1);
		});
	for (const [name, font] of Object.entries(fonts))
		it(`constructs JUL in ${name}`, () => {
			expect(text('JUL', font).design.fingers.length).toBeGreaterThan(4);
		});
	it('keeps both frames functional and visibly different', () => {
		const dense = text('ANNA'),
			air = text('ANNA', fonts.nunito, 'air');
		expect(dense.design).not.toHaveProperty('rightCutouts');
		expect(air.design).not.toHaveProperty('rightCutouts');
		expect(rasterizeDesign(dense.design, 100).data).not.toEqual(
			rasterizeDesign(air.design, 100).data
		);
	});
	it('preserves counters, colours and print size through save, sharing and SVG import', () => {
		const { design } = text('ANNA');
		design.templateWidthMm = 120;
		const roundtrips = [
			normalizeHeartDesign(serializeHeartDesign(design)),
			parseHeartFromSVG(serializeHeartToSVG(design))
		];
		for (const restored of roundtrips) {
			expect(restored).not.toHaveProperty('rightCutouts');
			expect(restored?.colors).toEqual(colors);
			expect(restored?.templateWidthMm).toBe(120);
			const a = rasterizeDesign(design, 200).data,
				b = rasterizeDesign(restored!, 200).data;
			expect(
				a.reduce((n, v, i) => n + Number(v !== b[i]), 0) / a.length
			).toBeLessThan(0.002);
		}
		expect(serializeTemplateToSVG(design, ['left', 'right'])).not.toContain(
			'fill="#ddd"'
		);
		const preview = new DOMParser().parseFromString(
			renderHeartSvgMarkup(design, colors),
			'image/svg+xml'
		);
		expect(preview.querySelector('parsererror')).toBeNull();
	});
	it('rejects empty text and unavailable glyphs without dropping characters', () => {
		expect(() => text('   ')).toThrow(ConstructionError);
		expect(() => text('A♥B')).toThrow(ConstructionError);
	});
});

describe('saved generator inputs', () => {
	it('round-trips a Danish name and clamps untrusted link inputs', () => {
		const value = {
			...defaults,
			mode: 'text',
			text: 'ÆØÅ',
			font: 'kalam'
		};
		expect(
			readGeneratorState('#make=' + encodeURIComponent(JSON.stringify(value)))
		).toEqual(value);
		const bad = readGeneratorState(
			'#make=' +
				encodeURIComponent(
					JSON.stringify({
						motif: '../../secret',
						font: '<script>',
						scale: 999,
						paperWidth: 0,
						palette: -1,
						text: 'ABCDEFGHIJKLM'
					})
				)
		);
		expect(bad.motif).toBe('star');
		expect(bad.font).toBe('nunito');
		expect(bad.scale).toBe(85);
		expect(bad).not.toHaveProperty('paperWidth');
		expect(bad.text).toBe('ABCDEFGHIJ');
		expect(readGeneratorState('#make=broken')).toEqual(defaults);
	});
});

describe('framed words', () => {
	for (const frame of FRAMES)
		it(frame, () => {
			const { design } = text('ANNA', fonts.nunito, frame);
			expect(design.gridSize.x).toBeGreaterThanOrEqual(6);
			expect(design.gridSize.y).toBeGreaterThanOrEqual(6);
		});
	it('routes counters through exactly coincident edges in both sheets', () => {
		const r = generateCheckedText('AOBØ', fonts.nunito);
		const shared = r.edges.flatMap((e, i) =>
			e.family === 'AB' ? [String(i)] : []
		);
		expect(shared.length).toBeGreaterThan(12);
		for (const id of shared)
			for (const paths of [
				r.geometry.A_overlap_paths,
				r.geometry.B_overlap_paths
			]) {
				expect(paths.flat().filter((ref) => ref.curve === id)).toHaveLength(1);
			}
	});
});

it('preserves the font baseline across accents and lowercase letters', () => {
	for (const word of ['ÅSE', 'Anna']) {
		const r = generateCheckedText(word, fonts.nunito);
		const source = [...word].flatMap((c) =>
			fonts.nunito.glyphs[c].contours.flat()
		);
		const actual = r.artwork
			.flat()
			.map(([x, y]) => (x + y - 100) * Math.SQRT1_2);
		const lo = Math.min(...source.map((p) => p[1])),
			hi = Math.max(...source.map((p) => p[1]));
		const scale = (Math.max(...actual) - Math.min(...actual)) / (hi - lo);
		const offset = actual[0] - source[0][1] * scale;
		for (let i = 0; i < source.length; i++)
			expect(actual[i]).toBeCloseTo(source[i][1] * scale + offset, 5);
	}
});
