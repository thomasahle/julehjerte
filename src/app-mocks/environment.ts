// Stand-in for SvelteKit's `$app/environment` in unit tests — see paths.ts.
// Tests run outside the browser, so `browser` is false and code guarded by it
// (localStorage, matchMedia, …) takes its server path.
export const browser = false;
export const dev = false;
export const building = false;
export const version = 'test';
