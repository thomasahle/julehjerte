// Stand-in for SvelteKit's `$app/state` in unit tests — see paths.ts.
export const page = { url: new URL('http://localhost/'), params: {}, state: {} as App.PageState };
