import { describe, expect, it } from 'vitest';
import { area } from './geometry';
import { contourArt, iconOutline, IconOutlineError } from './iconOutline';
import { findIcons, iconContours, iconCredit, iconSetUrl, SOLID_ENOUGH } from './iconSearch';
import { isIconId } from './iconId';
import { englishWords } from './danishWords';
import { generatorLink, readGeneratorState, defaults } from './state';

const SOLID = '<path fill="currentColor" d="M2 2h20v20H2z"/>';
const RING = '<path fill="currentColor" fill-rule="evenodd" d="M2 2h20v20H2zM6 6v12h12V6z"/>';
const LINES = '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10"/></g>';

describe('iconOutline', () => {
	it('gives a figure as the site stores its own: centred, its longer side 1, areas positive', () => {
		const { contours, solid } = iconOutline(SOLID, 24, 24);
		expect(contours).toHaveLength(1);
		expect(area(contours[0])).toBeCloseTo(1, 4);
		expect(Math.max(...contours[0].flat())).toBeCloseTo(0.5, 4);
		expect(solid).toBeCloseTo(0.81, 2);
		const ring = iconOutline(RING, 24, 24).contours;
		expect(ring.map((r) => area(r)).sort()).toEqual([expect.closeTo(0.36, 3), expect.closeTo(1, 3)]);
		expect(contourArt(contours)).toBe('<path fill="currentColor" fill-rule="evenodd" d="M95.00 95.00L5.00 95.00L5.00 5.00L95.00 5.00Z"/>');
	});

	it('reads shapes, strokes and transforms', () => {
		const disc = iconOutline('<circle cx="8" cy="8" r="4"/>', 16, 16).contours;
		expect(area(disc[0])).toBeCloseTo(Math.PI / 4, 2);
		const round = iconOutline('<rect x="1" y="1" width="10" height="5" rx="1"/>', 12, 12).contours;
		expect(area(round[0])).toBeCloseTo((50 - (4 - Math.PI)) / 100, 2);
		const turned = iconOutline('<g transform="rotate(90 6 6) scale(1 .5)"><rect width="12" height="12"/></g>', 12, 12).contours;
		expect(area(turned[0])).toBeCloseTo(0.5, 3);
		expect(Math.max(...turned[0].map((p) => p[1]))).toBeCloseTo(0.5, 3);
	});

	it('finds a drawing in lines too thin for paper, and a solid shape solid', () => {
		expect(iconOutline(LINES, 24, 24).solid).toBeLessThan(SOLID_ENOUGH / 2);
		expect(iconOutline(SOLID, 24, 24).solid).toBeGreaterThan(SOLID_ENOUGH * 2);
	});

	it('refuses what it cannot make of paper', () => {
		for (const body of ['<path opacity=".2" d="M0 0h9v9z"/>', '<mask id="a"><path d="M0 0h9v9z"/></mask>', '<path d="M0 0h9v9z" style="fill:red"/>', '<use href="#a"/>', '<path', ''])
			expect(() => iconOutline(body, 24, 24), body).toThrow(IconOutlineError);
	});
});

/** An Iconify that knows three icons of two sets, and writes down what it is asked. */
function iconify() {
	const asked: string[] = [];
	const fetcher = async (url: string) => {
		asked.push(decodeURIComponent(url.replace('https://api.iconify.design', '')));
		const path = new URL(url).pathname;
		const sets: Record<string, object> = {
			'/search': {
				icons: ['mdi:box', 'mdi:box-outline', 'other:box', 'ph:box-fill', 'closed:box', 'mdi:gone'],
				collections: {
					mdi: { name: 'Material Design Icons', author: { name: 'Pictogrammers' }, license: { title: 'Apache 2.0', spdx: 'Apache-2.0' }, category: 'Material' },
					other: { name: 'Other', license: { title: 'MIT', spdx: 'MIT' } },
					ph: { name: 'Phosphor', license: { title: 'MIT', spdx: 'MIT' } },
					closed: { name: 'Closed', license: { title: 'GPL', spdx: 'GPL-3.0' } }
				}
			},
			'/mdi.json': { width: 24, height: 24, icons: { box: { body: SOLID }, 'box-outline': { body: LINES } } },
			'/collections': { other: { name: 'Other', author: { name: 'Someone' }, license: { title: 'CC BY 4.0', spdx: 'CC-BY-4.0' } } },
			'/other.json': { width: 24, height: 24, icons: { box: { body: SOLID } } }
		};
		return { ok: path in sets, json: async () => sets[path] };
	};
	return { asked, fetcher };
}

describe('findIcons', () => {
	it('offers the solid icons of open sets the site does not have, each drawing once', async () => {
		const { asked, fetcher } = iconify();
		const items = await findIcons(' Kasse ', undefined, fetcher);
		expect(asked[0]).toBe('/search?query=box style=fill palette=false&limit=150');
		expect(asked.slice(1).sort()).toEqual(['/mdi.json?icons=box,box-outline,gone', '/other.json?icons=box']);
		expect(items).toEqual([{ id: 'mdi:box', name: 'Box', art: contourArt(iconOutline(SOLID, 24, 24).contours), box: 100, source: 'Pictogrammers, Material Design Icons, Apache 2.0' }]);
		// The figure found needs no second request.
		expect(await iconContours('mdi:box', fetcher)).toEqual(iconOutline(SOLID, 24, 24).contours);
		expect(asked).toHaveLength(3);
	});

	it('fetches the figure a link names', async () => {
		const { asked, fetcher } = iconify();
		expect(await iconContours('other:box', fetcher)).toEqual(iconOutline(SOLID, 24, 24).contours);
		expect(asked).toEqual(['/other.json?icons=box']);
		await expect(iconContours('mdi:gone', fetcher)).rejects.toThrow();
		// And its credit, once.
		expect(await iconCredit('other:box', fetcher)).toBe('Someone, Other, CC BY 4.0');
		expect(await iconCredit('other:lid', fetcher)).toBe('Someone, Other, CC BY 4.0');
		expect(asked).toEqual(['/other.json?icons=box', '/mdi.json?icons=gone', '/collections?prefixes=other']);
		expect(iconSetUrl('other:box')).toBe('https://icon-sets.iconify.design/other/');
		await expect(iconContours('../x', fetcher)).rejects.toThrow();
	});

	it('asks nothing for an empty search', async () => {
		const { asked, fetcher } = iconify();
		expect(await findIcons('  ', undefined, fetcher)).toEqual([]);
		expect(asked).toEqual([]);
	});
});

describe('a figure of the open sets', () => {
	it('is named as Iconify names it, in links too', () => {
		for (const id of ['mdi:cat', 'fa7-solid:ear-deaf']) expect(isIconId(id), id).toBe(true);
		for (const id of ['cat', 'ph-cat', 'mdi:', ':cat', 'a:b:c', 'mdi:Cat', 'mdi:cat/..', 'mdi:-cat']) expect(isIconId(id), id).toBe(false);
		const state = { ...defaults, motif: 'fa7-solid:ear-deaf' };
		expect(generatorLink(state)).toBe('motif=fa7-solid:ear-deaf');
		expect(readGeneratorState('#' + generatorLink(state))).toEqual(state);
	});

	it('is asked for in English', () => {
		expect(englishWords('Øre')).toBe('ear');
		expect(englishWords('rød cykel')).toBe('rød bicycle');
		expect(englishWords('kort')).toBe('card');
	});
});
