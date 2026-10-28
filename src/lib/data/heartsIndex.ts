/**
 * The gallery index, hearts.jsonc in the project root: the categories in
 * gallery order and the heart ids in each, in the order the front page shows
 * them. It is JSONC, so comments can mark groups of hearts within a category
 * (docs/ADDING-A-HEART.md); the site and its tests read it through here, the
 * Node scripts through parseJsonc.
 */
import source from '../../../hearts.jsonc?raw';
import { parseJsonc } from '$lib/utils/jsonc.js';

export interface HeartsIndexCategory {
	id: string;
	hearts: string[];
}

export interface HeartsIndex {
	categories: HeartsIndexCategory[];
}

export const HEARTS_INDEX: HeartsIndex = parseJsonc(source);
