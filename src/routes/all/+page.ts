import { error } from '@sveltejs/kit';

// Not public: the built site has no file for this address, and the page that answers instead says "not found".
export const prerender = false;

export function load() {
	if (!import.meta.env.DEV) error(404, 'Not found');
}
