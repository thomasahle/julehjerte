import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
    globals: true,
  },
  resolve: {
    // The tests run in jsdom, so a component has to resolve to Svelte's client
    // build: `mount` exists only there, and without this a component test dies
    // with `lifecycle_function_unavailable` before it renders anything.
    conditions: ['browser'],
    alias: {
      $lib: '/src/lib',
      $app: '/src/app-mocks',
      // The inverse engine is shipped unbundled under static/ and loaded by URL
      // at runtime. Tests that check our conversions against the engine's own
      // answers import it through this alias rather than by relative path, so
      // that `svelte-check` (checkJs is on) reads the declarations in
      // src/lib/inverse/engine-modules.d.ts instead of type-checking 4000 lines
      // of somebody else's minified JavaScript.
      $inverse: '/static/inverse',
    },
  },
});
