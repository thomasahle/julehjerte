/** The fonts we ship read from static/generator/fonts/, for the prerendered
 * start screen and the tests; nothing is fetched (a subset or font not in
 * static/ is one the text has to do without). */
import type { FontFiles } from '$lib/generator/fontLibrary';

const files = import.meta.glob<string>('/static/generator/fonts/*.woff', { eager: true, query: '?inline', import: 'default' });

export const STATIC_FONTS = '/static/generator/fonts/';

export const staticFontFiles: FontFiles = {
	shipped: STATIC_FONTS,
	async file(url) {
		const data = files[url];
		return data ? Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0)) : null;
	},
	async subsets() {
		return {};
	}
};
