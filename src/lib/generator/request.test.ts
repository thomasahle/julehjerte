import { describe, expect, it } from 'vitest';
import { DEFAULT_COLORS_HEX } from '$lib/stores/colors';
import { GeometryCache, geometryKey } from './cache';
import type { GeneratorRequest, GeneratorResult } from './generate';
import { FIGURE_STYLES, type Font, type Ring } from './geometry';
import { generatorRequest, variantRequest, type RequestSources } from './request';
import { defaults, type GeneratorState } from './state';
import { TEXT_TEMPLATES } from './templates';

const CONTOURS: Ring[] = [[[0, 0], [10, 0], [10, 10]]];
const RAYS_RECIPES = [{ stands: 'for the rays’ stored hidden cuts' }];
/** The files under /generator/ the requests read: one frame with stored cuts, the board circle with none but where the star is divided from. */
const FILES: Record<string, unknown> = {
	'motifs/star.json': { contours: CONTOURS },
	'recipes/index.json': { files: ['rays', 'board'] },
	'recipes/rays.json': { version: 1, recipes: RAYS_RECIPES },
	'recipes/board.json': { version: 1, recipes: [], whole: { star: { 5: 80 } } }
};
const FONT = { glyphs: {} } as Font;

/** Sources that write down what is asked of them, in order. */
function sources(files = FILES) {
	const asked: string[] = [];
	const made = new GeometryCache();
	const given: RequestSources = {
		asset: async <T,>(path: string) => {
			asked.push(path);
			if (!(path in files)) throw new Error(`no ${path}`);
			return files[path] as T;
		},
		font: async (font, text) => {
			asked.push(`font ${font} ${text}`);
			return FONT;
		},
		made,
		readingFont: () => asked.push('worker')
	};
	return { asked, made, given };
}

const figure = (state: Partial<GeneratorState> = {}): GeneratorState => ({ ...defaults, mode: 'figure', ...state });
const text = (state: Partial<GeneratorState> = {}): GeneratorState => ({ ...defaults, mode: 'text', ...state });

/** What a request sets otherwise than `base`, a key it lacks as absent. */
function otherwise(base: GeneratorRequest, request: GeneratorRequest) {
	const a = base as Record<string, unknown>,
		b = request as Record<string, unknown>;
	return Object.fromEntries(
		[...new Set([...Object.keys(a), ...Object.keys(b)])]
			.filter((key) => !(key in a && key in b && Object.is(a[key], b[key])))
			.map((key) => [key, key in b ? b[key] : '(absent)'])
	);
}

describe('generatorRequest', () => {
	it('asks for the motif in the default frame, with the frame’s stored hidden cuts', async () => {
		const { asked, given } = sources();
		const request = await generatorRequest(figure(), 'da', given);
		expect(request).toStrictEqual({
			mode: 'figure',
			name: 'Stjerne',
			colors: DEFAULT_COLORS_HEX,
			text: 'JUL',
			frame: 'circle',
			frameSize: 70,
			scale: 0.7,
			style: 'rays',
			textFrame: 'woven',
			fittedCells: undefined,
			gap: 3,
			board: undefined,
			place: undefined,
			side: undefined,
			room: undefined,
			contours: CONTOURS,
			recipes: RAYS_RECIPES
		});
		expect(Object.keys(request)).toEqual(['mode', 'name', 'colors', 'text', 'frame', 'frameSize', 'scale', 'style', 'textFrame', 'fittedCells', 'gap', 'board', 'place', 'side', 'room', 'contours', 'recipes']);
		expect(asked).toEqual(['motifs/star.json', 'recipes/index.json', 'recipes/rays.json', 'recipes/index.json']);
		expect((await generatorRequest(figure(), 'en', given)).name).toBe('star');
	});

	it('asks for the motif in every frame as it does today', async () => {
		const { given } = sources();
		const base = await generatorRequest(figure(), 'da', given);
		const frames: Record<string, unknown> = {};
		for (const style of FIGURE_STYLES) frames[style] = otherwise(base, await generatorRequest(figure({ style }), 'da', given));
		expect(frames).toMatchInlineSnapshot(`
			{
			  "board": {
			    "recipes": undefined,
			    "style": "board",
			  },
			  "check": {
			    "recipes": undefined,
			    "style": "check",
			  },
			  "corners": {
			    "recipes": undefined,
			    "style": "corners",
			  },
			  "fitted": {
			    "recipes": undefined,
			    "style": "fitted",
			  },
			  "layers": {
			    "recipes": undefined,
			    "style": "layers",
			  },
			  "motifs": {
			    "gap": undefined,
			    "layout": undefined,
			    "recipes": undefined,
			    "style": "motifs",
			  },
			  "rays": {},
			  "silhouette": {
			    "recipes": undefined,
			    "style": "silhouette",
			  },
			  "squares": {
			    "gap": undefined,
			    "layout": undefined,
			    "recipes": undefined,
			    "style": "squares",
			  },
			  "strips": {
			    "board": 4,
			    "gap": undefined,
			    "layout": undefined,
			    "recipes": undefined,
			    "style": "strips",
			  },
			  "sunburst": {
			    "recipes": undefined,
			    "style": "sunburst",
			  },
			  "wedges": {
			    "recipes": undefined,
			    "style": "wedges",
			  },
			}
		`);
	});

	it('asks for the strips, place and size the visitor chose', async () => {
		const { given } = sources();
		const base = await generatorRequest(figure(), 'da', given);
		expect({
			strips: otherwise(base, await generatorRequest(figure({ style: 'strips', strips: 5, place: 7.5, side: -2, scale: 90 }), 'da', given)),
			motifs: otherwise(base, await generatorRequest(figure({ style: 'motifs', board: 6, scale: 50 }), 'da', given)),
			spaced: otherwise(base, await generatorRequest(figure({ style: 'wedges', spacing: 9, frameSize: 60 }), 'da', given))
		}).toMatchInlineSnapshot(`
			{
			  "motifs": {
			    "board": 6,
			    "gap": undefined,
			    "layout": undefined,
			    "recipes": undefined,
			    "scale": 0.5,
			    "style": "motifs",
			  },
			  "spaced": {
			    "frameSize": 60,
			    "gap": 9,
			    "recipes": undefined,
			    "style": "wedges",
			  },
			  "strips": {
			    "board": 5,
			    "gap": undefined,
			    "layout": undefined,
			    "place": 7.5,
			    "recipes": undefined,
			    "scale": 0.9,
			    "side": -2,
			    "style": "strips",
			  },
			}
		`);
	});

	it('keeps a motif on a board in the layout its default size chose', async () => {
		const { asked, made, given } = sources();
		const state = figure({ style: 'motifs', scale: 55 });
		made.set(geometryKey({ ...state, scale: defaults.scale }), { layout: { alternative: 2, board: 4 } } as GeneratorResult);
		expect((await generatorRequest(state, 'da', given)).layout).toEqual({ alternative: 2, board: 4 });
		expect(asked).toEqual(['motifs/star.json', 'recipes/index.json', 'recipes/index.json']);
	});

	it('keeps a featured motif on the board circle whole below the size it is divided from', async () => {
		const { asked, given } = sources();
		const at = async (scale: number) => (await generatorRequest(figure({ style: 'board', scale }), 'da', given)).keepWhole;
		expect(await at(70)).toBeUndefined();
		expect(await at(71)).toBe(true);
		expect(await at(79)).toBe(true);
		expect(await at(80)).toBeUndefined();
		expect(asked.slice(0, 5)).toEqual(['motifs/star.json', 'recipes/index.json', 'recipes/board.json', 'recipes/index.json', 'recipes/board.json']);
		// On another board the star has no size of its own.
		expect((await generatorRequest(figure({ style: 'board', scale: 75, board: 7 }), 'da', given)).keepWhole).toBeUndefined();
	});

	it('does without stored cuts it cannot read, but not without the motif', async () => {
		const { given } = sources({ 'motifs/star.json': { contours: CONTOURS } });
		const request = await generatorRequest(figure({ style: 'board', scale: 75 }), 'da', given);
		expect('recipes' in request).toBe(true);
		expect(request.recipes).toBeUndefined();
		expect(request.keepWhole).toBeUndefined();
		await expect(generatorRequest(figure({ motif: 'nope' }), 'da', given)).rejects.toThrow('no motifs/nope.json');
	});

	it('asks for the text in its font, starting the worker first', async () => {
		const { asked, given } = sources();
		const request = await generatorRequest(text(), 'da', given);
		expect(request).toStrictEqual({
			mode: 'text',
			name: 'JUL',
			colors: DEFAULT_COLORS_HEX,
			text: 'JUL',
			frame: 'circle',
			frameSize: 70,
			scale: 0.7,
			style: 'rays',
			textFrame: 'woven',
			fittedCells: false,
			gap: undefined,
			board: undefined,
			place: undefined,
			side: undefined,
			room: 0.22,
			font: FONT
		});
		expect(asked).toEqual(['worker', 'font nunito JUL']);
	});

	it('asks for the text in every text frame as it does today', async () => {
		const { given } = sources();
		const base = await generatorRequest(text(), 'da', given);
		const frames: Record<string, unknown> = {};
		for (const { id, textFrame, cells } of TEXT_TEMPLATES)
			frames[id] = otherwise(base, await generatorRequest(text({ textFrame, cells: cells ?? defaults.cells, board: 5, room: 20 }), 'da', given));
		expect(frames).toMatchInlineSnapshot(`
			{
			  "checkered": {
			    "fittedCells": undefined,
			    "room": undefined,
			    "textFrame": "checkered",
			  },
			  "circle": {
			    "fittedCells": undefined,
			    "room": undefined,
			    "textFrame": "circle",
			  },
			  "layers": {
			    "fittedCells": undefined,
			    "room": undefined,
			    "textFrame": "layers",
			  },
			  "strips": {
			    "board": 5,
			    "fittedCells": undefined,
			    "room": undefined,
			    "textFrame": "strips",
			  },
			  "woven-letters": {
			    "fittedCells": true,
			    "room": 0.4,
			  },
			  "woven-square": {
			    "room": 0.4,
			  },
			}
		`);
	});
});

describe('variantRequest', () => {
	it('puts the page’s request in another frame', async () => {
		const { given } = sources();
		const request = await generatorRequest(figure({ style: 'strips', place: 4, side: 1 }), 'da', given);
		const variant = variantRequest(request, figure({ style: 'wedges', spacing: 5 }));
		expect(otherwise(request, variant)).toMatchInlineSnapshot(`
			{
			  "board": undefined,
			  "gap": 5,
			  "place": undefined,
			  "side": undefined,
			  "style": "wedges",
			}
		`);
		// What the page's request read stays the page's.
		expect(variant.contours).toBe(request.contours);
		const words = await generatorRequest(text({ text: 'GOD JUL' }), 'da', given);
		expect(otherwise(words, variantRequest(words, text({ text: 'GOD JUL', textFrame: 'strips', board: 4 })))).toMatchInlineSnapshot(`
			{
			  "board": 4,
			  "fittedCells": undefined,
			  "room": undefined,
			  "textFrame": "strips",
			}
		`);
	});
});
