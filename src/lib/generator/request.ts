import type { Language } from '$lib/i18n';
import { DEFAULT_COLORS_HEX } from '$lib/stores/colors';
import { BOARD_STRIPS } from './boardMotif';
import { geometryKey } from './cache';
import { motifLabel } from './catalog';
import type { BoardLayout, GeneratorRequest } from './generate';
import type { Font, Ring } from './geometry';
import type { RecipeFile } from './recipes';
import { BOARD_STYLES, defaults, fittedCells, frameGap, stripCount, stripPlace, stripSide, textRoom, type GeneratorState } from './state';

/** Where the generator page's request finds what it needs besides the page's state. */
export type RequestSources = {
	/** A JSON file of the site's under /generator/ (`motifs/star.json`, `recipes/index.json`). */
	asset: <T>(path: string) => Promise<T>;
	/** The glyphs of the text's characters in the font. */
	font: (font: string, text: string) => Promise<Font>;
	/** The hearts made so far, by `geometryKey`. */
	made: { get(key: string): { layout?: BoardLayout } | undefined };
	/** The text's font is about to be read: the page starts the generator's worker meanwhile. */
	readingFont?: () => void;
};

/** The hidden cuts found once for a frame's topologies (see `recipes`),
 * where the index lists any. */
async function storedRecipes(style: string, asset: RequestSources['asset']) {
	const index = await asset<{ files: string[] }>('recipes/index.json').catch(() => ({ files: [] as string[] }));
	if (!index.files.includes(style)) return;
	const recipes = (await asset<RecipeFile>(`recipes/${style}.json`).catch(() => undefined))?.recipes;
	return recipes?.length ? recipes : undefined;
}

/** On a board circle, the size from which a featured motif is divided,
 * kept whole below it past the touching circle (see `RecipeFile`). */
async function dividedFrom(style: string, motif: string, board: number, asset: RequestSources['asset']) {
	const index = await asset<{ files: string[] }>('recipes/index.json').catch(() => ({ files: [] as string[] }));
	if (style !== 'board' || !index.files.includes(style)) return;
	return (await asset<RecipeFile>(`recipes/${style}.json`).catch(() => undefined))?.whole?.[motif]?.[board];
}

/** The generator's request for the page's state. */
export async function generatorRequest(
	snapshot: GeneratorState,
	lang: Language,
	{ asset, font, made, readingFont }: RequestSources
): Promise<GeneratorRequest> {
	const request: GeneratorRequest = {
		mode: snapshot.mode as 'figure' | 'text',
		name:
			snapshot.mode === 'text'
				? snapshot.text
				: motifLabel(
						{ id: snapshot.motif, name: snapshot.motif, art: '', box: 24 },
						lang
					),
		// Geometry is colour independent; only the preview reads the header's colour preference.
		colors: DEFAULT_COLORS_HEX,
		text: snapshot.text,
		frame: snapshot.frame,
		frameSize: snapshot.frameSize,
		scale: snapshot.scale / 100,
		style: snapshot.style,
		textFrame: snapshot.textFrame,
		fittedCells: fittedCells(snapshot),
		gap: frameGap(snapshot),
		board: stripCount(snapshot),
		place: stripPlace(snapshot),
		side: stripSide(snapshot),
		room: textRoom(snapshot)
	};
	// A motif on a board keeps the choice its default size made.
	if (snapshot.mode === 'figure' && BOARD_STYLES.includes(snapshot.style))
		request.layout = made.get(geometryKey({ ...snapshot, scale: defaults.scale }))?.layout;
	if (snapshot.mode === 'text') {
		readingFont?.();
		request.font = await font(snapshot.font, snapshot.text);
	} else {
		request.contours = (
			await asset<{ contours: Ring[] }>(`motifs/${snapshot.motif}.json`)
		).contours;
		request.recipes = await storedRecipes(snapshot.style, asset);
		const from = await dividedFrom(snapshot.style, snapshot.motif, stripCount(snapshot) ?? BOARD_STRIPS.board.initial, asset);
		if (from !== undefined && snapshot.scale > 70 && snapshot.scale < from) request.keepWhole = true;
	}
	return request;
}

/** The request for one frame's thumbnail, the page's request in that frame. */
export function variantRequest(request: GeneratorRequest, state: GeneratorState): GeneratorRequest {
	return {
		...request,
		frame: state.frame,
		style: state.style,
		textFrame: state.textFrame,
		fittedCells: fittedCells(state),
		gap: frameGap(state),
		board: stripCount(state),
		place: stripPlace(state),
		side: stripSide(state),
		room: textRoom(state)
	};
}
