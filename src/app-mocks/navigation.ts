// Stand-in for SvelteKit's `$app/navigation` in unit tests — see paths.ts.
// No router runs here; a test that cares what was called mocks these.
export function replaceState(_url: string | URL, _state: App.PageState): void {}
export function pushState(_url: string | URL, _state: App.PageState): void {}
export async function goto(_url: string | URL): Promise<void> {}
export function afterNavigate(_callback: () => void): void {}
export function beforeNavigate(_callback: () => void): void {}
