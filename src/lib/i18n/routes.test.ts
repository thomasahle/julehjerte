import { describe, it, expect } from 'vitest';
import {
	ROUTES,
	ROUTE_KEYS,
	alternatePaths,
	categoryHref,
	heartPath,
	href,
	otherLanguage,
	otherLanguageUrl,
	path,
	pathInLanguage,
	routeKeyFromPathname
} from './routes';

describe('route table', () => {
	it('lists every page in both languages with a trailing slash', () => {
		for (const key of ROUTE_KEYS) {
			for (const lang of ['da', 'en'] as const) {
				const p = ROUTES[key][lang];
				expect(p.startsWith('/')).toBe(true);
				expect(p.endsWith('/')).toBe(true);
			}
		}
	});

	it('puts every English page under /en/', () => {
		for (const key of ROUTE_KEYS) {
			expect(ROUTES[key].en.startsWith('/en/')).toBe(true);
			expect(ROUTES[key].da.startsWith('/en/')).toBe(false);
		}
	});

	it('has no duplicate paths', () => {
		const all = ROUTE_KEYS.flatMap((key) => [ROUTES[key].da, ROUTES[key].en]);
		expect(new Set(all).size).toBe(all.length);
	});

	it('resolves paths and hrefs', () => {
		expect(path('howTo', 'da')).toBe('/saadan-goer-du/');
		expect(path('howTo', 'en')).toBe('/en/how-to/');
		expect(href('about', 'da')).toBe('/om/');
		expect(heartPath('stjerne', 'da')).toBe('/hjerte/stjerne/');
		expect(heartPath('stjerne', 'en')).toBe('/en/hjerte/stjerne/');
		expect(categoryHref('stjerner', 'en')).toBe('/en/#stjerner');
	});
});

describe('language mirroring', () => {
	it('maps the differently slugged pages to each other', () => {
		expect(pathInLanguage('/saadan-goer-du/', 'en')).toBe('/en/how-to/');
		expect(pathInLanguage('/en/how-to/', 'da')).toBe('/saadan-goer-du/');
		expect(pathInLanguage('/om/', 'en')).toBe('/en/about/');
		expect(pathInLanguage('/en/about/', 'da')).toBe('/om/');
	});

	it('maps the prefixed pages by adding or removing /en', () => {
		expect(pathInLanguage('/', 'en')).toBe('/en/');
		expect(pathInLanguage('/en/', 'da')).toBe('/');
		expect(pathInLanguage('/editor/', 'en')).toBe('/en/editor/');
		expect(pathInLanguage('/en/editor/', 'da')).toBe('/editor/');
		expect(pathInLanguage('/hjerte/stjerne/', 'en')).toBe('/en/hjerte/stjerne/');
		expect(pathInLanguage('/en/hjerte/stjerne/', 'da')).toBe('/hjerte/stjerne/');
	});

	it('is idempotent when the page is already in that language', () => {
		expect(pathInLanguage('/en/how-to/', 'en')).toBe('/en/how-to/');
		expect(pathInLanguage('/om/', 'da')).toBe('/om/');
	});

	it('recognises which page a path belongs to', () => {
		expect(routeKeyFromPathname('/saadan-goer-du/')).toBe('howTo');
		expect(routeKeyFromPathname('/en/about/')).toBe('about');
		expect(routeKeyFromPathname('/hjerte/stjerne/')).toBe(null);
	});

	it('gives both alternates for hreflang tags', () => {
		expect(alternatePaths('/en/how-to/')).toEqual({ da: '/saadan-goer-du/', en: '/en/how-to/' });
		expect(alternatePaths('/hjerte/jul/')).toEqual({
			da: '/hjerte/jul/',
			en: '/en/hjerte/jul/'
		});
	});

	it('builds the language toggle target, keeping query and hash', () => {
		expect(otherLanguageUrl('/', '?selected=jul', '#stjerner')).toBe('/en/?selected=jul#stjerner');
		expect(otherLanguageUrl('/en/how-to/')).toBe('/saadan-goer-du/');
		expect(otherLanguage('da')).toBe('en');
	});
});
