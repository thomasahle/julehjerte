import { describe, expect, it } from 'vitest';
import { ALL_HEART_IDS } from '$lib/data/categories';
import { archiveRecords, filterArchive, hasArchiveTemplate, safeArchiveUrl } from './index';

describe('the complete heart archive', () => {
	it('publishes only the public schema, web sources and explicitly permitted saved originals', () => {
		const records = archiveRecords('en');
		const allowed = new Set(['id', 'title', 'kind', 'source', 'sourceUrls', 'imageUrls', 'credits',
			'templateUrls', 'relatedTemplateUrls', 'heartId', 'thumbnail', 'date', 'history', 'historyUrl',
			'license', 'licenseUrl', 'preservedTemplates', 'creditRole']);
		const publicWeb = (value: unknown) => {
			expect(typeof value).toBe('string');
			const url = new URL(value as string);
			expect(['https:', 'http:']).toContain(url.protocol);
			expect(url.username).toBe('');
			expect(url.password).toBe('');
			expect(url.hostname).not.toMatch(/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])|\.(localhost|local|internal)$/);
			if (/(^|\.)pinterest\.[a-z.]+$/.test(url.hostname)) expect(url.pathname).toMatch(/^\/pin\/[a-z\d_-]+\/$/i);
		};
		for (const record of records) {
			for (const key of Object.keys(record)) expect(allowed.has(key), `${record.id}: unexpected field ${key}`).toBe(true);
			for (const key of ['id', 'title', 'source'] as const) expect(typeof record[key]).toBe('string');
			for (const credit of record.credits) expect(typeof credit).toBe('string');
			for (const url of [...record.sourceUrls, ...record.imageUrls, ...record.templateUrls, ...record.relatedTemplateUrls]) publicWeb(url);
			for (const url of [record.historyUrl, record.licenseUrl].filter(Boolean)) publicWeb(url);
			if (record.kind !== 'juleflet') expect(record.sourceUrls.length, record.id).toBeGreaterThan(0);
			if (record.thumbnail) expect(record.thumbnail).toMatch(/^\/(?:hearts\/photos\/|og\/)[a-z\d-]+\.(?:png|jpe?g)$/);
			for (const original of record.preservedTemplates ?? []) {
				expect(Object.keys(original).sort()).toEqual(['name', 'url']);
				expect(original.url).toMatch(/^\/archive\/templates\/[a-f\d]{64}\.pdf$/);
				expect(typeof original.name).toBe('string');
				expect(record.license).toBe('CC BY-NC-SA 4.0');
				expect(record.credits).toContain('Kim G. L. Pedersen');
			}
		}
		expect(JSON.stringify(records)).not.toMatch(/(?:"localPath"|"splitStatus"|"trainingEligibility"|"pinDiscoveryPaths"|\/Users\/ahle\/|TemporaryItems|heart-training-real)/);
	});

	it('includes every published heart in both languages without a curated subset', () => {
		for (const lang of ['da', 'en'] as const) {
			const records = archiveRecords(lang);
			expect(records.filter(r => r.kind === 'juleflet').map(r => r.heartId)).toEqual(ALL_HEART_IDS);
			expect(new Set(records.map(r => r.id)).size).toBe(records.length);
			expect(records.filter(r => r.history === 'permo')).toHaveLength(32);
		}
	});

	it('retains the opaque pin and consolidates reviewed variants without publishing board activity', () => {
		for (const lang of ['da', 'en'] as const) {
			const records = archiveRecords(lang);
			const opaque = records.find(record => record.id === 'source-1864c2c7f582ab29')!;
			expect(opaque.sourceUrls).toContain('https://www.pinterest.com/pin/Ac9nHdxgZcEw4UAUhwMaRJTEbunjwUcXHeQEGHYE_uYBC-FLumUf9z4/');
			expect(opaque.credits).toEqual([]);
			expect(opaque.license).toBe('unknown');
			expect(hasArchiveTemplate(opaque)).toBe(false);
			const bells = records.find(record => record.id === 'source-a055202166ff0bdd')!;
			expect(bells.imageUrls.length).toBeGreaterThan(1);
			expect(bells.sourceUrls.some(url => url.startsWith('https://www.pinterest.com/pin/'))).toBe(true);
			for (const id of ['source-519ee71c8519d9e3', 'source-64b51faaef694431',
				'source-3545741859f83f94', 'source-76129ef26182091e', 'source-3f2032cde2fcfedf']) {
				expect(records.some(record => record.id === id)).toBe(false);
			}
			expect(JSON.stringify(records)).not.toMatch(/0wt3lqxkvukjlwc|flettet-julehjerte-skabelon|boardIndex/);
		}
	});

	it('distinguishes an actual template from an unverified same-page suggestion', () => {
		const records = archiveRecords('en');
		const uncertain = records.find(r => !r.heartId && !r.templateUrls.length && r.relatedTemplateUrls.length)!;
		expect(uncertain).toBeDefined();
		expect(hasArchiveTemplate(uncertain)).toBe(false);
		expect(filterArchive(records, '', '', 'templates')).not.toContain(uncertain);
		const saved = records.find(r => r.id === 'spejderliv-julehjerter')!;
		expect(saved.credits).toEqual(['Kim G. L. Pedersen']);
		expect(saved.preservedTemplates).toHaveLength(1);
		expect(saved.license).toBe('CC BY-NC-SA 4.0');
		expect(hasArchiveTemplate(saved)).toBe(true);
	});

	it('keeps rescued historical templates distinct from an unrecovered article reference', () => {
		const records = archiveRecords('en');
		const rescuedIds = ['jhd-carola-super-nova', 'jhd-darth-vader', 'jhd-heart-of-heart', 'jhd-node',
			'jhd-sundays-fourth', 'jhd-venus', 'jhd-damernes', 'haabet-isbjoern'];
		const historical = records.filter(r => rescuedIds.includes(r.id));
		expect(historical).toHaveLength(8);
		expect(historical.filter(hasArchiveTemplate)).toHaveLength(7);
		for (const record of historical) {
			expect(record.preservedTemplates).toBeUndefined();
			expect(record.sourceUrls.some(url => url.startsWith('https://web.archive.org/'))).toBe(true);
			if (hasArchiveTemplate(record)) {
				expect(record.templateUrls.every(url => url.startsWith('https://web.archive.org/'))).toBe(true);
				expect(record.templateUrls).toHaveLength(record.id === 'haabet-isbjoern' ? 2 : 1);
				for (const captured of record.templateUrls) {
					const original = captured.replace(/^https:\/\/web\.archive\.org\/web\/[^/]+\//, '');
					expect(record.sourceUrls).toContain(original);
				}
			}
		}
		expect(historical.find(r => r.id === 'jhd-carola-super-nova')?.credits).toEqual(['Carola Heesemann']);
		expect(historical.find(r => r.id === 'haabet-isbjoern')?.credits).toEqual(['Peter Ole Kvint']);
		expect(historical.find(r => r.id === 'jhd-darth-vader')?.credits).toEqual(['Johan Rosenkilde']);
		expect(historical.find(r => r.id === 'jhd-damernes')?.templateUrls).toEqual([]);
		// Mirror and Wayback copies of a combined image are alternate sources,
		// not two different cutting sheets.
		for (const record of records.filter(r => r.history === 'permo')) expect(record.templateUrls).toHaveLength(1);
	});

	it('keeps missing geometric templates as references even when the article or photo survives', () => {
		const ids = ['jhd-hexatriple', 'jhd-ovalt', 'jhd-square-twist'];
		const stems = ['hexatriple', 'oval', 'inner_square'];
		for (const lang of ['da', 'en'] as const) {
			const records = archiveRecords(lang);
			const references = filterArchive(records, '', 'julehjertedesign.dk', 'references');
			const templates = filterArchive(records, '', 'julehjertedesign.dk', 'templates');
			for (const [i, id] of ids.entries()) {
				const record = records.find(r => r.id === id)!;
				expect(record).toBeDefined();
				expect(references).toContain(record);
				expect(templates).not.toContain(record);
				expect(hasArchiveTemplate(record)).toBe(false);
				expect(record.credits).toEqual(['Johan Rosenkilde']);
				expect(record.templateUrls).toEqual([]);
				expect(record.relatedTemplateUrls).toEqual([]);
				expect(record.preservedTemplates).toBeUndefined();
				expect(record.thumbnail).toBeUndefined();
				expect(record.license).toBe('unknown');
				for (const format of ['pdf', 'svg']) {
					expect(record.sourceUrls).toContain(`http://julehjertedesign.dk/diagrams/${stems[i]}.${format}`);
				}
			}
			expect(records.find(r => r.id === 'jhd-ovalt')?.imageUrls).toEqual([
				'https://web.archive.org/web/20161203133004id_/http://julehjertedesign.dk/wp-content/uploads/oval.png'
			]);
			for (const id of [ids[0], ids[2]]) expect(records.find(r => r.id === id)?.imageUrls).toEqual([]);
		}
	});

	it('links editable SVG originals to existing designs without presenting alternate formats as extra sheets', () => {
		const originals = [
			['jhd-darth-vader', 'darth_vader', '20170112161918'],
			['jhd-heart-of-heart', 'heart_of_heart', '20170114132905'],
			['jhd-node', 'node', '20170114051312'],
			['jhd-sundays-fourth', 'sundays_fourth', '20170112181839'],
			['jhd-venus', 'venus', '20170112163856']
		];
		for (const lang of ['da', 'en'] as const) {
			const records = archiveRecords(lang);
			for (const [id, stem, capture] of originals) {
				const matches = records.filter(record => record.id === id);
				expect(matches).toHaveLength(1);
				const record = matches[0];
				const original = `http://julehjertedesign.dk/diagrams/${stem}.svg`;
				expect(record.sourceUrls).toContain(original);
				expect(record.sourceUrls).toContain(`https://web.archive.org/web/${capture}id_/${original}`);
				expect(record.templateUrls).toHaveLength(1);
				expect(record.templateUrls[0]).toMatch(/\.pdf$/);
				expect(record.credits).toEqual(['Johan Rosenkilde']);
				expect(record.license).toBe('unknown');
				expect(record.preservedTemplates).toBeUndefined();
			}
		}
	});

	it('preserves two further Haabet designs without counting alternate names or photos as designs', () => {
		const records = archiveRecords('en');
		const nine = records.find(r => r.id === 'haabet-nine-hearts')!;
		const winter = records.find(r => r.id === 'haabet-vintersol')!;
		expect(nine.title).toBe('9 hjerter / Firkløver');
		expect(winter.title).toBe('Vintersol');
		expect(nine.imageUrls).toHaveLength(1);
		expect(winter.imageUrls).toHaveLength(2);
		for (const record of [nine, winter]) {
			expect(records.filter(r => r.id === record.id)).toHaveLength(1);
			expect(record.credits).toEqual(['Peter Ole Kvint']);
			expect(record.license).toBe('unknown');
			expect(record.preservedTemplates).toBeUndefined();
			expect(record.thumbnail).toBeUndefined();
			expect(record.templateUrls).toHaveLength(1);
			expect(record.templateUrls[0]).toMatch(/^https:\/\/web\.archive\.org\/web\/\d{14}id_\/http:\/\/.*\.gif$/);
			const original = record.templateUrls[0].replace(/^https:\/\/web\.archive\.org\/web\/[^/]+\//, '');
			expect(record.sourceUrls).toContain(original);
		}
		expect(nine.templateUrls[0]).toContain('/20130530125527id_/');
		expect(winter.templateUrls[0]).toContain('/20160418065353id_/');
	});

	it('retains the bell, dove and anchor sources without assigning a page author to an unsigned motif', () => {
		const records = archiveRecords('en');
		const bell = records.find(r => r.id === 'haabet-klokke')!;
		const dove = records.find(r => r.id === 'haabet-freds-due')!;
		const anchor = records.find(r => r.id === 'haabet-haabets-anker')!;
		expect([bell.title, dove.title, anchor.title]).toEqual(['Klokke Julehjerte', 'Freds Due', 'Håbets Anker']);
		expect(bell.credits).toEqual(['Peter Ole Kvint']);
		expect(anchor.credits).toEqual(['Peter Ole Kvint']);
		expect(dove.credits).toEqual([]);
		expect([bell.templateUrls.length, dove.templateUrls.length, anchor.templateUrls.length]).toEqual([1, 2, 2]);
		for (const record of [bell, dove, anchor]) {
			expect(records.filter(r => r.id === record.id)).toHaveLength(1);
			expect(record.imageUrls).toHaveLength(1);
			expect(record.license).toBe('unknown');
			expect(record.preservedTemplates).toBeUndefined();
			expect(record.thumbnail).toBeUndefined();
			for (const captured of record.templateUrls) {
				expect(captured).toMatch(/^https:\/\/web\.archive\.org\/web\/\d{14}id_\/http:\/\/.*\.gif$/);
				expect(record.sourceUrls).toContain(captured.replace(/^https:\/\/web\.archive\.org\/web\/[^/]+\//, ''));
			}
		}
	});

	it('searches recorded credits and combines filters without case or accent surprises', () => {
		const records = archiveRecords('en');
		const mortensen = filterArchive(records, 'PER mortensen', '', 'templates');
		// 27 hunodan.dk documents and his five "Circles in Hearts" pages, plus the
		// five juleflet hearts built from those pages (Sol and the four permo-*).
		expect(mortensen).toHaveLength(37);
		expect(filterArchive(records, 'krummel', 'krymmel.dk', 'templates').length).toBeGreaterThan(25);
		expect(filterArchive(records, 'nonexistentzzzyyy', '', 'all')).toEqual([]);
		expect(filterArchive(records, '', '', 'juleflet')).toHaveLength(ALL_HEART_IDS.length);
	});

	it('publishes three signed Haabet templates without inventing photo previews or publication dates', () => {
		const expected = [
			['haabet-stjerne-af-cirkler', 'Stjerne, af Cirkler', '20030827010801'],
			['haabet-eight-points', '8 Spisser Julehjerte', '20030205022359'],
			['haabet-four-quadrilaterals', '4 4kanter Julehjerte', '20030205024425']
		];
		for (const lang of ['da', 'en'] as const) {
			const records = archiveRecords(lang);
			const templates = filterArchive(records, 'Peter Ole Kvint', 'haabet.dk', 'templates');
			for (const [id, title, capture] of expected) {
				const matches = records.filter(record => record.id === id);
				expect(matches).toHaveLength(1);
				const record = matches[0];
				expect(record.title).toBe(title);
				expect(templates).toContain(record);
				expect(record.credits).toEqual(['Peter Ole Kvint']);
				expect(record.templateUrls).toHaveLength(1);
				expect(record.templateUrls[0]).toContain(`/web/${capture}id_/`);
				expect(record.sourceUrls).toContain(record.templateUrls[0].replace(/^https:\/\/web\.archive\.org\/web\/[^/]+\//, ''));
				expect(record.imageUrls).toEqual([]);
				expect(record.date).toBeUndefined();
				expect(record.thumbnail).toBeUndefined();
				expect(record.preservedTemplates).toBeUndefined();
				expect(record.license).toBe('unknown');
			}
		}
	});

	it('only turns public web catalog metadata into source links', () => {
		for (const value of ['javascript:alert(1)', 'file:///tmp/a', 'https://user:pass@example.com', null]) {
			expect(safeArchiveUrl(value)).toBeNull();
		}
		expect(safeArchiveUrl('https://example.com/template.pdf#page=2')).toBe('https://example.com/template.pdf#page=2');
	});
});
