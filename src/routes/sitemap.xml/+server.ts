import { SITE_URL } from '$lib/config';
import { ALL_HEART_IDS } from '$lib/data/categories';
import { ROUTES, heartPath, type RouteKey } from '$lib/i18n/routes';
import { heartImageUrl } from '$lib/seo';
import type { RequestHandler } from './$types';

export const prerender = true;

// The static pages, named by their key in the shared route table: the da and en
// slugs differ for the guide and about pages, so a single language-neutral path
// is not enough. Paths always carry a trailing slash (trailingSlash = 'always',
// so URLs without one 301-redirect on the live site).
/**
 * How many of the gallery's hearts, in gallery order, the front page lists as
 * its images in the image sitemap. Each heart page lists its own.
 */
const FRONT_PAGE_SITEMAP_IMAGES = 5;

const staticPages: { key: RouteKey; priority: string }[] = [
	{ key: 'home', priority: '1.0' },
	{ key: 'editor', priority: '0.8' },
	{ key: 'paint', priority: '0.7' },
	{ key: 'howTo', priority: '0.7' },
	{ key: 'noPrinter', priority: '0.7' },
	{ key: 'about', priority: '0.5' }
];

export const GET: RequestHandler = async () => {
	// One entry per page, carrying both language variants of that page.
	const pages = [
		...staticPages.map(({ key, priority }) => ({
			da: ROUTES[key].da,
			en: ROUTES[key].en,
			priority,
			images: key === 'home' ? ALL_HEART_IDS.slice(0, FRONT_PAGE_SITEMAP_IMAGES).map(heartImageUrl) : []
		})),
		...ALL_HEART_IDS.map((heartId) => ({
			da: heartPath(heartId, 'da'),
			en: heartPath(heartId, 'en'),
			priority: '0.6',
			// The square picture of the heart ($lib/heartImage), on both language variants.
			images: [heartImageUrl(heartId)]
		}))
	];

	// The site is prerendered, so the build date is the last time any page could have changed.
	const lastmod = new Date().toISOString().slice(0, 10);

	// One <url> per language variant; both variants list the same da/en/x-default alternates.
	const urls = pages.flatMap(({ da, en, priority, images }) => {
		const daUrl = `${SITE_URL}${da}`;
		const enUrl = `${SITE_URL}${en}`;
		return [daUrl, enUrl].map(
			(loc) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${priority}</priority>
    <xhtml:link rel="alternate" hreflang="da" href="${daUrl}" />
    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${daUrl}" />
${images.map((image) => `    <image:image>\n      <image:loc>${image}</image:loc>\n    </image:image>\n`).join('')}  </url>`
		);
	});

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>`;

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600'
		}
	});
};
