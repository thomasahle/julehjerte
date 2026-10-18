import type { Plugin } from 'vite';

/**
 * `hearts.json?index`: the project root's hearts.json with every heart's
 * `description` left out, so `$lib/data/categories` (which nearly every page
 * imports) can read the gallery's ids and order without shipping the prose.
 * The prose is read through the plain `hearts.json` import in
 * `$lib/data/heartDescriptions`, which the detail page loads lazily.
 *
 * Registered in both vite.config.ts and vitest.config.ts; the import's type is
 * declared in src/lib/data/heartIndex.d.ts.
 */
export function heartIndexJson(): Plugin {
	return {
		name: 'heart-index-json',
		enforce: 'pre',
		transform(code, id) {
			const [file, query = ''] = id.split('?');
			if (!/\/hearts\.json$/.test(file) || file.includes('/node_modules/')) return null;
			if (!new URLSearchParams(query).has('index')) return null;
			const data = JSON.parse(code) as {
				categories: { id: string; hearts: { id: string }[] }[];
			};
			const index = {
				categories: data.categories.map((category) => ({
					id: category.id,
					hearts: category.hearts.map((heart) => ({ id: heart.id }))
				}))
			};
			return { code: `export default ${JSON.stringify(index)};`, map: null };
		}
	};
}
