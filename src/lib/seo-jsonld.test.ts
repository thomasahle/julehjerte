/**
 * The structured data the heart pages and the front page write
 * ($lib/seo heartHowToJsonLd, heartWebPageJsonLd, frontPageJsonLd, jsonLdScript): parseable JSON in
 * one script element, the schema.org fields search engines need, absolute
 * URLs, and no way for a string to close the script element.
 */
import { describe, expect, it } from 'vitest';
import heartMeta from '$lib/data/heart-meta.json';
import { ALL_HEART_IDS } from '$lib/data/categories';
import { SITE_URL } from '$lib/config';
import type { Language } from '$lib/i18n';
import { heartName } from '$lib/utils/heartName';
import {
	FRONT_PAGE_SOCIAL_IMAGE,
	frontPageJsonLd,
	heartHowToJsonLd,
	heartPageTitle,
	heartWebPageJsonLd,
	jsonLdScript
} from './seo';

type Meta = { name: string; names?: { da?: string; en?: string }; author: string | null; authorUrl: string | null };
const META = heartMeta as unknown as Record<string, Meta>;
const LANGS: Language[] = ['da', 'en'];

/** The JSON inside a script element written by jsonLdScript. */
function parse(script: string): Record<string, any> {
	const match = /^<script type="application\/ld\+json">([\s\S]*)<\/script>$/.exec(script);
	expect(match).not.toBeNull();
	return JSON.parse(match![1]);
}

function howTo(id: string, lang: Language, description = 'A description.'): Record<string, any> {
	const meta = META[id];
	return heartHowToJsonLd({
		id,
		name: heartName(meta, lang),
		description,
		author: meta.author,
		authorUrl: meta.authorUrl,
		lang
	});
}

/** Every string anywhere in the value that looks like a URL. */
function urls(value: unknown): string[] {
	if (typeof value === 'string') return /^(https?:)?\/\/|^\//.test(value) ? [value] : [];
	if (Array.isArray(value)) return value.flatMap(urls);
	if (value && typeof value === 'object') {
		return Object.entries(value).flatMap(([key, v]) => (key === '@context' ? [] : urls(v)));
	}
	return [];
}

describe('jsonLdScript', () => {
	it('writes one parseable script element', () => {
		const data = { '@context': 'https://schema.org', '@type': 'Thing', name: 'Hjerte' };
		const script = jsonLdScript(data);
		expect(script.match(/<script/g)).toHaveLength(1);
		expect(parse(script)).toEqual(data);
	});

	it('cannot be closed or commented out by a string in it', () => {
		const name = 'Evil </script><script>alert(1)</script> <!-- x';
		const script = jsonLdScript({ name });
		const inner = script.slice('<script type="application/ld+json">'.length, -'</script>'.length);
		expect(inner).not.toContain('</');
		expect(inner).not.toContain('<');
		expect(parse(script).name).toBe(name);
	});
});

describe('heartHowToJsonLd', () => {
	it.each(LANGS)('gives every gallery heart a complete HowTo (%s)', (lang) => {
		for (const id of ALL_HEART_IDS) {
			const data = parse(jsonLdScript(howTo(id, lang)));
			expect(data['@context']).toBe('https://schema.org');
			expect(data['@type']).toBe('HowTo');
			expect(data.name).toBe(heartName(META[id], lang));
			expect(data.description).toBe('A description.');
			expect(data.inLanguage).toBe(lang);
			expect(data.url).toBe(`${SITE_URL}${lang === 'en' ? '/en' : ''}/hjerte/${id}/`);
			expect(data.image.map((i: { url: string }) => i.url)).toEqual([
				`${SITE_URL}/og/hearts/${id}.png`,
				`${SITE_URL}/og/social/${lang}/${id}.png`
			]);
			expect(data.image[0]).toMatchObject({ '@type': 'ImageObject', width: 800, height: 800 });
			expect(data.supply[0]['@type']).toBe('HowToSupply');
			expect(data.tool[0]['@type']).toBe('HowToTool');
			expect(data.step).toHaveLength(3);
			for (const step of data.step) {
				expect(step['@type']).toBe('HowToStep');
				expect(step.name.length).toBeGreaterThan(3);
				expect(step.text.length).toBeGreaterThan(20);
			}
			expect(data).not.toHaveProperty('totalTime');
			// Every URL absolute; all but the author's own site on juleflet.dk.
			const { author, ...own } = data;
			for (const url of urls(own)) expect(url, `${id}: ${url}`).toMatch(/^https:\/\/juleflet\.dk\//);
			for (const url of urls(author)) expect(url, `${id}: ${url}`).toMatch(/^https?:\/\/[^/]+/);
		}
	});

	it('links the steps to the guide in the page language', () => {
		expect(howTo('jul', 'da').step.map((s: { url: string }) => s.url)).toEqual([
			'https://juleflet.dk/saadan-goer-du/#prepare-heading',
			'https://juleflet.dk/saadan-goer-du/#weave-heading',
			'https://juleflet.dk/saadan-goer-du/#finish-heading'
		]);
		expect(howTo('jul', 'en').step[0].url).toBe('https://juleflet.dk/en/how-to/#prepare-heading');
		expect(howTo('jul', 'en').step[0].name).toBe('Print, fold and cut');
	});

	it('credits a known author as a Person, with the link when there is one', () => {
		expect(howTo('nihon', 'da').author ?? null).toEqual(
			META.nihon.author && !['Traditional', 'Klassisk', 'Ukendt'].includes(META.nihon.author)
				? expect.objectContaining({ '@type': 'Person', name: META.nihon.author })
				: null
		);
		const withUrl = ALL_HEART_IDS.find((id) => META[id].authorUrl)!;
		expect(howTo(withUrl, 'da').author).toEqual({
			'@type': 'Person',
			name: META[withUrl].author,
			url: META[withUrl].authorUrl
		});
		const traditional = ALL_HEART_IDS.find((id) => META[id].author === 'Traditional')!;
		expect(howTo(traditional, 'da')).not.toHaveProperty('author');
	});

	it('names each person of a shared credit', () => {
		const data = heartHowToJsonLd({
			id: 'jul',
			name: 'Jul',
			description: 'x',
			author: 'Thomas Ahle & Claude',
			authorUrl: null,
			lang: 'da'
		});
		expect(data.author).toEqual([
			{ '@type': 'Person', name: 'Thomas Ahle' },
			{ '@type': 'Person', name: 'Claude' }
		]);
	});
});

describe('heartWebPageJsonLd', () => {
	it.each(LANGS)('names the square picture as the primary image and the HowTo as the main entity (%s)', (lang) => {
		for (const id of ALL_HEART_IDS) {
			const name = heartName(META[id], lang);
			const page = parse(jsonLdScript(heartWebPageJsonLd({ id, name, lang })));
			const recipe = howTo(id, lang);
			expect(page['@context']).toBe('https://schema.org');
			expect(page['@type']).toBe('WebPage');
			expect(page.url).toBe(recipe.url);
			expect(page.inLanguage).toBe(lang);
			expect(page.name).toBe(heartPageTitle(id, name, lang));
			expect(page.primaryImageOfPage).toEqual({
				'@type': 'ImageObject',
				url: `${SITE_URL}/og/hearts/${id}.png`,
				width: 800,
				height: 800
			});
			expect(page.mainEntity).toEqual({ '@id': recipe['@id'] });
			expect(recipe['@id']).toMatch(/^https:\/\/juleflet\.dk\//);
			expect(recipe['@id']).not.toBe(page['@id']);
		}
	});
});

describe('frontPageJsonLd', () => {
	it.each(LANGS)('lists the gallery as an ItemList (%s)', (lang) => {
		const hearts = ALL_HEART_IDS.map((id) => ({ id, name: heartName(META[id], lang) }));
		const data = parse(jsonLdScript(frontPageJsonLd(hearts, lang)));
		expect(data['@type']).toBe('CollectionPage');
		expect(data.url).toBe(lang === 'en' ? 'https://juleflet.dk/en/' : 'https://juleflet.dk/');
		expect(data.inLanguage).toBe(lang);
		expect(data.image).toBe(FRONT_PAGE_SOCIAL_IMAGE);
		const list = data.mainEntity;
		expect(list['@type']).toBe('ItemList');
		expect(list.numberOfItems).toBe(ALL_HEART_IDS.length);
		expect(list.itemListElement).toHaveLength(ALL_HEART_IDS.length);
		list.itemListElement.forEach((item: Record<string, unknown>, i: number) => {
			const id = ALL_HEART_IDS[i];
			expect(item).toEqual({
				'@type': 'ListItem',
				position: i + 1,
				url: `${SITE_URL}${lang === 'en' ? '/en' : ''}/hjerte/${id}/`,
				name: heartName(META[id], lang),
				image: `${SITE_URL}/og/hearts/${id}.png`
			});
		});
		for (const url of urls(data)) expect(url).toMatch(/^https:\/\/juleflet\.dk\//);
	});
});
