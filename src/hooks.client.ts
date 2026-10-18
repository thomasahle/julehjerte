import type { HandleClientError } from '@sveltejs/kit';

/**
 * SvelteKit's default client hook logs every error with console.error. On this
 * site a 404 is routine, not a fault: GitHub Pages serves 404.html for every
 * unknown path, the client router then renders the not-found page, and the
 * default hook logged "Not found: /…" twice for it. Anything else is still
 * logged as before.
 */
export const handleError: HandleClientError = ({ error, status, message }) => {
	if (status !== 404) console.error(error);
	return { message };
};
