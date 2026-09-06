import type { Handle } from '@sveltejs/kit';
import { langFromPathname } from '$lib/i18n';

// Fill in the `%lang%` placeholder in app.html from the request URL, so prerendered
// /en/ pages get <html lang="en"> instead of the static default.
export const handle: Handle = async ({ event, resolve }) => {
	const lang = langFromPathname(event.url.pathname);
	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', lang)
	});
};
