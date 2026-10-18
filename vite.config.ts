import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { heartIndexJson } from './src/lib/data/heartIndexJson.ts';

export default defineConfig({
	plugins: [heartIndexJson(), sveltekit(), tailwindcss()],
	// Exported benchmark HTML must not reload an in-progress browser solve.
	server: { watch: { ignored: ['**/tmp/**'] } }
});
