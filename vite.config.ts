import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	// Exported benchmark HTML must not reload an in-progress browser solve.
	server: { watch: { ignored: ['**/tmp/**'] } }
});
