/**
 * The glyphs a text is written with, from the page: asked of the font worker
 * ($lib/generator/fontWorker), which keeps every file it has read for the
 * visit, or, where the browser has no workers, of a library on the page.
 */
import type { Font } from './geometry';
import type { FontLibrary } from './fontLibrary';

let worker: Worker | null = null, asked = 0, local: Promise<FontLibrary> | null = null;
const waiting = new Map<number, { resolve: (font: Font) => void; reject: (error: Error) => void }>();
const known = new Map<string, Promise<Font>>();

function ask(shipped: string, choice: string, text: string): Promise<Font> {
	if (typeof Worker === 'undefined') {
		local ??= Promise.all([import('./fontLibrary'), import('./fontFiles')])
			.then(([{ FontLibrary }, { fetchedFiles }]) => new FontLibrary(fetchedFiles(shipped)));
		return local.then(library => library.font(choice, text));
	}
	if (!worker) {
		worker = new Worker(new URL('./fontWorker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (event: MessageEvent<{ id: number; font?: Font; error?: string }>) => {
			const { id, font, error } = event.data, done = waiting.get(id);
			waiting.delete(id);
			if (font) done?.resolve(font);
			else done?.reject(new Error(error));
		};
		worker.onerror = event => {
			for (const done of waiting.values()) done.reject(new Error(event.message));
			waiting.clear();
			worker?.terminate();
			worker = null;
		};
	}
	const id = ++asked;
	return new Promise((resolve, reject) => {
		waiting.set(id, { resolve, reject });
		worker!.postMessage({ id, shipped, choice, text });
	});
}

/**
 * The glyphs of `text`'s characters in the chosen font (one of ours by name,
 * a Google font's `gf:` choice), each from the font, else from the symbol or
 * emoji font; a character none has is left out. `shipped` is the URL of
 * static/generator/fonts/. A failed request is tried again the next time.
 */
export function textFont(shipped: string, choice: string, text: string): Promise<Font> {
	const key = `${choice}\u0000${text}`;
	let font = known.get(key);
	if (!font) {
		font = ask(shipped, choice, text);
		font.catch(() => known.delete(key));
		if (known.size > 100) known.clear();
		known.set(key, font);
	}
	return font;
}
