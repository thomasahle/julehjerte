import type { HeartNames } from '$lib/types/heart';
import type { Language } from '$lib/i18n';

/** Anything that carries a heart's name: a design, its build-time metadata, a card. */
export interface Named {
	name: string;
	names?: HeartNames | null;
}

/**
 * A heart's name in the site language: its `<title xml:lang>` for that language
 * when it has one, otherwise its own name (the plain `<title>`). Everything that
 * shows a heart's name, or puts it in text, goes through this; file names and
 * analytics keep the id.
 */
export function heartName(heart: Named, lang: Language): string {
	return heart.names?.[lang] || heart.name;
}
