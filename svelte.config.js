import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// GitHub Pages deployment settings
			pages: 'build',
			assets: 'build',
			fallback: '404.html',
			precompress: false,
			strict: true
		}),
		paths: {
			// Base path - empty for custom domain deployment
			base: ''
		},
		// Every stylesheet the site has is under 32 KB, so all of them are inlined
		// into the HTML: it removes the render-blocking CSS requests (about 300 ms
		// on a slow connection before the hero text could paint) at the cost of a
		// few KB per page that GitHub Pages serves gzipped anyway.
		inlineStyleThreshold: 32768,
		prerender: {
			handleHttpError: ({ path, referrer, message }) => {
				// Ignore 500 errors during prerender (SSR fetch issues)
				if (message.includes('500')) {
					console.warn(`Prerender warning: ${path} (from ${referrer})`);
					return;
				}
				throw new Error(message);
			}
		}
	}
};

export default config;
