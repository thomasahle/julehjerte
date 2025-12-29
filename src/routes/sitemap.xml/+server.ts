import { SITE_URL } from '$lib/config';
import hearts from '$lib/data/hearts.json';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = async () => {
	const allHeartIds = hearts.categories.flatMap((cat) => cat.hearts);

	const staticPages = ['', '/editor'];
	const languages = ['', '/en'];

	const urls: { loc: string; priority: string }[] = [];

	// Static pages for each language
	for (const lang of languages) {
		for (const page of staticPages) {
			urls.push({
				loc: `${SITE_URL}${lang}${page}`,
				priority: page === '' ? '1.0' : '0.8'
			});
		}
	}

	// Heart detail pages for each language
	for (const lang of languages) {
		for (const heartId of allHeartIds) {
			urls.push({
				loc: `${SITE_URL}${lang}/hjerte/${heartId}`,
				priority: '0.6'
			});
		}
	}

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map(
		(url) => `  <url>
    <loc>${url.loc}</loc>
    <priority>${url.priority}</priority>
  </url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600'
		}
	});
};
