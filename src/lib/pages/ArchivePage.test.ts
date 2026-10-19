import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { t, type Language } from '$lib/i18n';

const extraRecords = vi.hoisted(() => ({ count: 0 }));

vi.mock('$lib/archive', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/archive')>();
	return {
		...original,
		archiveRecords: () => [
			{ id: 'local', heartId: 'stjerne', title: 'Stjerne', kind: 'juleflet', source: 'Juleflet.dk',
				sourceUrls: [], imageUrls: [], credits: ['Thomas Ahle'], templateUrls: [], relatedTemplateUrls: [] },
			{ id: 'reference', title: '<img src=x onerror=alert(1)>', kind: 'photo', source: 'example.org',
				sourceUrls: ['https://example.org/heart'], imageUrls: ['https://example.org/heart.jpg'], credits: [],
				templateUrls: [], relatedTemplateUrls: ['https://example.org/maybe.pdf'] },
			{ id: 'preserved', title: 'Spejderliv Julehjerter', kind: 'document', source: 'spejderliv.dk',
				sourceUrls: ['https://spejderliv.dk/haandvaerk/julehjerter'], imageUrls: [], credits: ['Kim G. L. Pedersen'],
				templateUrls: ['https://static.spejderliv.dk/14-haandvaerk/julehjerter.pdf'], relatedTemplateUrls: [],
				license: 'CC BY-NC-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
				preservedTemplates: [{ url: '/archive/templates/example.pdf', name: 'Julehjerter (PDF)' }] },
			...Array.from({ length: extraRecords.count }, (_, i) => ({
				id: `extra-${i}`, title: i === 124 ? 'Final needle' : `Reference ${i}`, kind: 'photo', source: 'example.org',
				sourceUrls: [`https://example.org/heart/${i}`], imageUrls: [], credits: [], templateUrls: [], relatedTemplateUrls: []
			}))
		]
	};
});

const { default: ArchivePage } = await import('./ArchivePage.svelte');
const cleanup: (() => void)[] = [];
afterEach(() => {
	for (const dispose of cleanup.splice(0)) dispose();
	extraRecords.count = 0;
	document.head.innerHTML = '';
});

function render(lang: Language) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(ArchivePage, { target, props: { lang } });
	cleanup.push(() => { unmount(component); target.remove(); });
	flushSync();
	return target;
}

describe('ArchivePage', () => {
	it.each(['da', 'en'] as const)('offers the complete records with clear availability and safe text (%s)', lang => {
		const target = render(lang);
		expect(target.querySelector('h1')?.textContent).toBe(t('archiveTitle', lang));
		expect(target.querySelectorAll('article')).toHaveLength(3);
		expect(target.querySelector('#reference h2')?.textContent).toContain('<img src=x onerror=alert(1)>');
		expect(target.querySelector('#reference img')).toBeNull();
		expect(target.querySelector('#reference .availability')?.textContent).toContain(t('archiveReferenceStatus', lang));
		expect(target.querySelector('#reference details')?.textContent).toContain(t('archiveUnverifiedTemplates', lang));
		const licence = target.querySelector('#preserved a[href="https://creativecommons.org/licenses/by-nc-sa/4.0/"]');
		expect(licence).not.toBeNull();
		expect(licence?.closest('details')).toBeNull();
		expect(target.querySelector('#preserved .credit')?.textContent).toContain('Kim G. L. Pedersen');
		expect(target.querySelector('#preserved a[href="/archive/templates/example.pdf"]')).not.toBeNull();
		expect(target.querySelector('header nav a[href="/all/"]')).toBeNull();
		expect(target.querySelector('header nav a[href="/en/all/"]')).toBeNull();
	});

	it('searches and filters while keeping all records available initially', () => {
		const target = render('en');
		const input = target.querySelector('input[type="search"]') as HTMLInputElement;
		input.value = 'Kim';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		expect(target.querySelectorAll('article')).toHaveLength(1);
		expect(target.querySelector('article')?.id).toBe('preserved');
		input.value = '';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		const filter = target.querySelectorAll('select')[1];
		filter.value = 'references';
		filter.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(target.querySelectorAll('article')).toHaveLength(1);
		expect(target.querySelector('article')?.id).toBe('reference');
	});

	it('bounds the rendered cards, reaches the final record, and resets pagination for every filter', () => {
		extraRecords.count = 125;
		const target = render('en');
		const next = () => {
			(target.querySelectorAll('.pagination')[0].querySelectorAll('button')[1] as HTMLButtonElement).click();
			flushSync();
		};
		const search = (value: string) => {
			const input = target.querySelector('input[type="search"]') as HTMLInputElement;
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
			flushSync();
		};
		const select = (index: number, value: string) => {
			const input = target.querySelectorAll('select')[index];
			input.value = value;
			input.dispatchEvent(new Event('change', { bubbles: true }));
			flushSync();
		};
		expect(target.querySelectorAll('article')).toHaveLength(60);
		expect(target.querySelector('#extra-124')).toBeNull();
		expect(target.querySelector('.results')?.textContent).toContain('Page 1 of 3');
		next();
		expect(target.querySelectorAll('article')).toHaveLength(60);
		expect(target.querySelector('.results')?.textContent).toContain('Page 2 of 3');
		expect(document.activeElement).toBe(target.querySelector('.results'));
		next();
		expect(target.querySelectorAll('article')).toHaveLength(8);
		expect(target.querySelector('#extra-124')).not.toBeNull();
		expect(target.querySelector('.pagination')?.querySelectorAll('button')[1].disabled).toBe(true);

		search('Final needle');
		expect(target.querySelectorAll('article')).toHaveLength(1);
		expect(target.querySelector('article')?.id).toBe('extra-124');
		expect(target.querySelector('.results')?.textContent).toContain('Page 1 of 1');
		search('');
		expect(target.querySelector('article')?.id).toBe('local');
		next();
		select(0, 'spejderliv.dk');
		expect(target.querySelector('article')?.id).toBe('preserved');
		expect(target.querySelectorAll('article')).toHaveLength(1);
		select(0, '');
		next();
		select(1, 'juleflet');
		expect(target.querySelector('article')?.id).toBe('local');
		expect(target.querySelectorAll('article')).toHaveLength(1);
		search('missingzzz');
		expect(target.querySelectorAll('article')).toHaveLength(0);
		expect(target.querySelector('.pagination')).toBeNull();
		expect(target.querySelector('.empty')?.textContent).toBe(t('archiveNoResults', 'en'));
	});
});
