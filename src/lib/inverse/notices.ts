/**
 * The engine's licences and attribution, and where to link to them.
 *
 * The inverse engine is vendored whole under `static/inverse/`, third-party
 * notices included, and whatever page runs it has to name them. The generator
 * page carried the link at the foot of its form; when that page was retired the
 * link moved into Mal's "Avanceret" disclosure (docs/redesign/PAINT.md §9).
 *
 * It lives here, next to the client that owns the worker, rather than in the
 * page that happens to show it, so the next page to replace that one inherits
 * the obligation instead of quietly dropping it — and so the path and the file
 * on disk can be tested against each other.
 */

import { base } from '$app/paths';
import type { TranslationKey } from '$lib/i18n/translations';

/** The notice file, as it is served from `static/`. */
export const ENGINE_NOTICES_PATH = '/inverse/THIRD_PARTY_NOTICES.txt';

/** The translation key the link is labelled with, in both languages. */
export const ENGINE_NOTICES_KEY: TranslationKey = 'paintEngineLicences';

/** Link target for the notices, with SvelteKit's `base` applied. */
export function engineNoticesHref(basePath: string = base): string {
	return `${basePath}${ENGINE_NOTICES_PATH}`;
}
