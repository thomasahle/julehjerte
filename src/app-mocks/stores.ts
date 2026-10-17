// Stand-in for SvelteKit's `$app/stores` in unit tests — see paths.ts. A test
// that renders a component reading the page mocks this with its own store.
import { readable } from 'svelte/store';

export const page = readable({
	url: new URL('http://localhost/'),
	params: {} as Record<string, string>,
	route: { id: null as string | null },
	status: 200,
	error: null as App.Error | null,
	data: {} as Record<string, unknown>,
	state: {} as App.PageState,
	form: null as unknown
});
