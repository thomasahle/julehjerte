/** The font files as the browser reaches them: ours from the site, the rest
 * from Fontsource, its API telling which subset holds a character. */
import type { FontFiles } from './fontLibrary';
import { fontsourceApiUrl } from './fontFaces';

/** `shipped`: the absolute URL of static/generator/fonts/. */
export function fetchedFiles(shipped: string): FontFiles {
	return {
		shipped,
		async file(url) {
			const response = await fetch(url);
			if (response.status === 404) return null;
			if (!response.ok) throw new Error(`Font request failed: ${response.status}`);
			return new Uint8Array(await response.arrayBuffer());
		},
		async subsets(id) {
			const response = await fetch(fontsourceApiUrl(id));
			// A font Fontsource does not describe has only the subsets already read.
			if (!response.ok) return {};
			return ((await response.json()) as { unicodeRange?: Record<string, string> }).unicodeRange ?? {};
		}
	};
}
