// Stand-in for SvelteKit's `$app/paths` in unit tests: vitest.config.ts aliases
// `$app` to this directory, since the SvelteKit vite plugin (which normally
// provides these modules) does not run under vitest. The site deploys to a
// custom domain, so `base` is empty.
export const base = '';
export const assets = '';
