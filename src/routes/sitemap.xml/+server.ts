import { SITE_URL } from '$lib/config';
import hearts from '$lib/data/hearts.json';
import type { RequestHandler } from './$types';

export const prerender = true;

// Language-neutral paths, always with a trailing slash (the site uses trailingSlash = 'always',
// so URLs without one 301-redirect on the live site).
const staticPages = [
	{ path: '/', priority: '1.0' },
	{ path: '/editor/', priority: '0.8' }
];

export const GET: RequestHandler = async () => {
	const allHeartIds = hearts.categories.flatMap((cat) => cat.hearts);

	const pages = [
		...staticPages,
		...allHeartIds.map((heartId) => ({ path: `/hjerte/${heartId}/`, priority: '0.6' }))
	];

	// The site is prerendered, so the build date is the last time any page could have changed.
	const lastmod = new Date().toISOString().slice(0, 10);

	// One <url> per language variant; both variants list the same da/en/x-default alternates.
	const urls = pages.flatMap(({ path, priority }) => {
		const daUrl = `${SITE_URL}${path}`;
		const enUrl = `${SITE_URL}/en${path}`;
		return [daUrl, enUrl].map(
			(loc) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${priority}</priority>
    <xhtml:link rel="alternate" hreflang="da" href="${daUrl}" />
    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${daUrl}" />
  </url>`
		);
	});

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>`;

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600'
		}
	});
};
