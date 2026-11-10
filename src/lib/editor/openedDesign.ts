/**
 * What Tegn opens on, for each way a heart comes to it: the heart it draws, the name, author and
 * description its details panel shows, and the design whose id, links and written texts ride along
 * into what is saved. Each way names and credits the heart by its own rules; the page puts any of
 * them on screen the same way (EditorPage's `openDesign`).
 */
import type { Finger, GridSize, HeartDesign, HeartPattern } from '$lib/types/heart';
import { t, type Language } from '$lib/i18n';
import { heartName } from '$lib/utils/heartName';

export type OpenedDesign = {
	/** The heart Tegn draws: its cuts, its grid, which strips weave on top, and the Escher tab's tile. */
	heart: { fingers: Finger[]; gridSize: GridSize; weaveParity: 0 | 1; pattern: HeartPattern | undefined };
	name: string;
	author: string;
	description: string;
	/** The design that rides along (see above); null for a blank heart. */
	initial: HeartDesign | null;
	/** One of "Mine hjerter" opened to be edited where it is, with its own id, rather than a new heart. */
	editMode: boolean;
};

function heartOf(design: HeartDesign): OpenedDesign['heart'] {
	return { fingers: design.fingers, gridSize: design.gridSize, weaveParity: (design.weaveParity ?? 0) as 0 | 1, pattern: design.pattern };
}

/** A copy is named after the heart's name in this language ("Flet 1 (Kopi)"). */
function copyName(design: HeartDesign, lang: Language): string {
	return `${heartName(design, lang)} ${t('copy', lang)}`;
}

/** No heart asked for: Tegn's own plain one, PaperHeart draws it. */
export function blankOpened(lang: Language): OpenedDesign {
	return {
		heart: { fingers: [], gridSize: { x: 3, y: 3 }, weaveParity: 0, pattern: undefined },
		name: t('myHeart', lang),
		author: '',
		description: '',
		initial: null,
		editMode: false
	};
}

/**
 * A heart in a shared link (`#design=`): edited where it is with `editMode` (one of "Mine hjerter",
 * `?edit=true`), keeping its name; otherwise a copy of it.
 */
export function linkOpened(design: HeartDesign, editMode: boolean, lang: Language): OpenedDesign {
	return {
		heart: heartOf(design),
		name: editMode ? design.name : copyName(design, lang),
		author: design.author ?? '',
		description: design.description ?? '',
		initial: design,
		editMode
	};
}

/**
 * The heart Mal found (`?from=session`): not a copy of anything, but the visitor's own. The name is
 * Mal's to set, on the design it hands over: it is the side that knows whether the mask came from
 * star.png, a photo or the visitor's own brush, and `cutGeometryToDesign` takes `name` from its caller
 * for exactly that (PAINT.md §3: "Stjerne fra billede" / "Heart from image"). Never
 * `session.sourceName`: that is the file the mask came from, so reading it here would make a
 * Tegn → Mal → Tegn round trip rename the heart after itself. The fallback is only for a design that
 * reaches us unnamed; then it is a new heart like any other.
 */
export function sessionOpened(design: HeartDesign, lang: Language): OpenedDesign {
	return {
		heart: heartOf(design),
		name: design.name || t('myHeart', lang),
		author: design.author ?? '',
		description: design.description ?? '',
		initial: design,
		editMode: false
	};
}

/**
 * A copy of a gallery heart (`?from=<id>`). The copy is the visitor's own heart: it is not by the
 * gallery heart's author, nor described, published or dated as that one is (user test, 2026-10-22: a
 * copy saved as "af Thomas").
 */
export function galleryOpened(design: HeartDesign, lang: Language): OpenedDesign {
	return {
		heart: heartOf(design),
		name: copyName(design, lang),
		author: '',
		description: '',
		initial: {
			...design,
			author: '',
			authorUrl: undefined,
			publisher: undefined,
			publisherUrl: undefined,
			source: undefined,
			date: undefined,
			description: undefined,
			descriptions: undefined
		},
		editMode: false
	};
}

/** A draft taken up where it was left ("Fortsæt"), as it was. */
export function draftOpened(design: HeartDesign): OpenedDesign {
	return {
		heart: heartOf(design),
		name: design.name,
		author: design.author ?? '',
		description: design.description ?? '',
		initial: design,
		editMode: false
	};
}

/** An imported SVG: a new heart, named by the file or, failing that, as imported. */
export function importOpened(design: HeartDesign, lang: Language): OpenedDesign {
	return {
		heart: heartOf(design),
		name: design.name || t('importedHeart', lang),
		author: design.author || '',
		description: design.description || '',
		initial: design,
		editMode: false
	};
}
