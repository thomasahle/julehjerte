import { SITE_URL } from '$lib/config';
import { ALL_HEART_IDS } from '$lib/data/categories';
import { ROUTES, heartPath, type RouteKey } from '$lib/i18n/routes';
import { FRONT_PAGE_IMAGE, heartImageUrl } from '$lib/seo';
import { readLastModified } from '$lib/server/lastModified';
import { TEMPLATE_PDF_HEARTS, templatePdfPath } from '$lib/templatePdf';
import type { RequestHandler } from './$types';

export const prerender = true;

// The static pages, named by their key in the shared route table: the da and en
// slugs differ for the guide and about pages, so a single language-neutral path
// is not enough. Paths always carry a trailing slash (trailingSlash = 'always',
// so URLs without one 301-redirect on the live site).
// The heart pages list their own heart's picture, and the front page a picture of its own
// ($lib/heartImage): a heart's picture also listed under the front page was shown in image
// search as the front page's, and "Visit" led there.

const staticPages: { key: RouteKey; priority: string }[] = [
	{ key: 'home', priority: '1.0' },
	{ key: 'editor', priority: '0.8' },
	{ key: 'paint', priority: '0.7' },
	{ key: 'howTo', priority: '0.7' },
	{ key: 'history', priority: '0.6' },
	{ key: 'about', priority: '0.5' }
];

export const GET: RequestHandler = async () => {
	// A heart page last changed when its heart did, the front page when the
	// gallery did. The other pages get no date: what changes them is code
	// shared by every page, so no date would say more than the build date,
	// which is the same for every page and tells a search engine nothing.
	const dates = readLastModified();

	// One entry per page, carrying both language variants of that page.
	const pages = [
		...staticPages.map(({ key, priority }) => ({
			da: ROUTES[key].da,
			en: ROUTES[key].en,
			priority,
			lastmod: key === 'home' ? (dates?.gallery ?? null) : null,
			images: key === 'home' ? [FRONT_PAGE_IMAGE] : []
		})),
		...ALL_HEART_IDS.map((heartId) => ({
			da: heartPath(heartId, 'da'),
			en: heartPath(heartId, 'en'),
			priority: '0.6',
			lastmod: dates?.hearts.get(heartId) ?? null,
			// The square picture of the heart ($lib/heartImage), on both language variants.
			images: [heartImageUrl(heartId)]
		}))
	];

	// One <url> per language variant; both variants list the same da/en/x-default alternates.
	const urls = pages.flatMap(({ da, en, priority, lastmod, images }) => {
		const daUrl = `${SITE_URL}${da}`;
		const enUrl = `${SITE_URL}${en}`;
		return [daUrl, enUrl].map(
			(loc) => `  <url>
    <loc>${loc}</loc>
${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}    <priority>${priority}</priority>
    <xhtml:link rel="alternate" hreflang="da" href="${daUrl}" />
    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${daUrl}" />
${images.map((image) => `    <image:image>\n      <image:loc>${image}</image:loc>\n    </image:image>\n`).join('')}  </url>`
		);
	});

	// The templates that are also PDF files ($lib/templatePdf), dated as their heart.
	for (const id of TEMPLATE_PDF_HEARTS) {
		const lastmod = dates?.hearts.get(id) ?? null;
		urls.push(`  <url>
    <loc>${SITE_URL}${templatePdfPath(id)}</loc>
${lastmod ? `    <lastmod>${lastmod}</lastmod>\n` : ''}    <priority>0.4</priority>
  </url>`);
	}

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
