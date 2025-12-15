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
			// Base path for GitHub Pages (repo name)
			// Set to '' for custom domain or root deployment
			base: process.env.NODE_ENV === 'production' ? '/julehjerte' : ''
		},
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
