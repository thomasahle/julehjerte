/**
 * The Pinterest feed's schedule and XML ($lib/pinterest, docs/PINTEREST.md).
 */
import { describe, expect, it } from 'vitest';
import { HEARTS_INDEX as hearts } from '$lib/data/heartsIndex';
import {
	PINTEREST_CALL_TO_ACTION,
	PINTEREST_DESCRIPTION_MAX,
	PINTEREST_FIRST,
	PINTEREST_MAX_ITEMS,
	PINTEREST_ORDER,
	PINTEREST_START_DATE,
	addDays,
	copenhagenTime,
	escapeXml,
	interleaveByCategory,
	pinterestDescription,
	pinterestFeedXml,
	pinterestItems,
	pinterestSchedule,
	releaseTime,
	type PinterestHeart
} from './pinterest';

const GALLERY = hearts.categories.flatMap((category) => category.hearts);
/** Hearts taken out of the gallery after their day was out: they keep it, empty (PINTEREST_ORDER). */
const REMOVED = ['kogle'];
const CATEGORY = new Map(hearts.categories.flatMap((c) => c.hearts.map((id) => [id, c.id] as const)));

const heart = (id: string): PinterestHeart => ({ name: `Navn ${id}`, description: `Om ${id}. Flet det.` });
const items = (now: string, schedule = pinterestSchedule(GALLERY)) =>
	pinterestItems({ schedule, now: new Date(now), heart, imageLength: () => 1234 });

/** The local wall-clock time in Copenhagen, by the platform's time zone data. */
function copenhagenWallClock(date: Date): string {
	return new Intl.DateTimeFormat('sv-SE', {
		timeZone: 'Europe/Copenhagen',
		dateStyle: 'short',
		timeStyle: 'short'
	}).format(date);
}

describe('the order', () => {
	it('lists every gallery heart once, and the removed ones', () => {
		expect(new Set(PINTEREST_ORDER).size).toBe(PINTEREST_ORDER.length);
		expect([...PINTEREST_ORDER].sort()).toEqual([...GALLERY, ...REMOVED].sort());
	});

	it('starts with the most popular hearts', () => {
		expect(PINTEREST_ORDER[0]).toBe('classic-3x3');
		// Within the first ten days: one category per day pushes them a little apart.
		for (const id of PINTEREST_FIRST) expect(PINTEREST_ORDER.indexOf(id)).toBeLessThan(10);
	});

	it('never pins two hearts of one category on consecutive days', () => {
		const present = PINTEREST_ORDER.filter((id) => CATEGORY.has(id));
		for (let i = 1; i < present.length; i++) {
			expect(CATEGORY.get(present[i]), `${present[i - 1]} then ${present[i]}`).not.toBe(CATEGORY.get(present[i - 1]));
		}
	});

	it('was made by interleaveByCategory, which spreads every category of the gallery out', () => {
		// The order is frozen and kept when hearts.jsonc changes (new hearts go to the end), so it is
		// the function's order only for the gallery as it was then; for the gallery as it is now, the
		// function still lists every heart once and never two of one category in a row.
		const now = interleaveByCategory(hearts.categories, PINTEREST_FIRST);
		expect([...now].sort()).toEqual([...GALLERY].sort());
		for (let i = 1; i < now.length; i++) expect(CATEGORY.get(now[i]), `${now[i - 1]} then ${now[i]}`).not.toBe(CATEGORY.get(now[i - 1]));
		for (const id of PINTEREST_FIRST) expect(now.indexOf(id)).toBeLessThan(10);
	});

	it('keeps each heart on its day when the gallery changes', () => {
		const without = pinterestSchedule(GALLERY.filter((id) => id !== 'gaver'));
		expect(without.find(({ id }) => id === 'jul')!.day).toBe(PINTEREST_ORDER.indexOf('jul'));
		expect(without.some(({ id }) => id === 'gaver')).toBe(false);
		const added = pinterestSchedule([...GALLERY, 'ny-hjerte']);
		expect(added.at(-1)).toEqual({ id: 'ny-hjerte', day: PINTEREST_ORDER.length });
	});
});

describe('dates', () => {
	it('releases at 07:00 Copenhagen time on both sides of the October change to winter time', () => {
		// Summer time ends on Sunday 25 October 2026.
		expect(releaseTime(0).toISOString()).toBe('2026-10-21T05:00:00.000Z');
		expect(releaseTime(3).toISOString()).toBe('2026-10-24T05:00:00.000Z');
		expect(releaseTime(4).toISOString()).toBe('2026-10-25T06:00:00.000Z');
		expect(releaseTime(5).toISOString()).toBe('2026-10-26T06:00:00.000Z');
		for (let day = 0; day < 200; day++) {
			expect(copenhagenWallClock(releaseTime(day))).toBe(`${addDays(PINTEREST_START_DATE, day)} 07:00`);
		}
	});

	it('also handles the spring change', () => {
		expect(copenhagenTime('2027-03-27', 7).toISOString()).toBe('2027-03-27T06:00:00.000Z');
		expect(copenhagenTime('2027-03-28', 7).toISOString()).toBe('2027-03-28T05:00:00.000Z');
	});

	it('adds days across month and year ends', () => {
		expect(addDays('2026-10-21', 11)).toBe('2026-11-01');
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
	});
});

describe('items', () => {
	it('is empty before the first release', () => {
		expect(items('2026-10-20T12:00:00Z')).toEqual([]);
		expect(items('2026-10-21T04:59:59Z')).toEqual([]);
	});

	it('releases the first heart at 07:00 on the start date', () => {
		const [first, ...rest] = items('2026-10-21T05:00:00Z');
		expect(rest).toEqual([]);
		expect(first.id).toBe('classic-3x3');
		expect(first.pubDate.toISOString()).toBe('2026-10-21T05:00:00.000Z');
	});

	it('lists the released hearts newest first, none from the future', () => {
		const now = new Date('2026-10-27T07:30:00+01:00');
		const list = items(now.toISOString());
		const released = PINTEREST_ORDER.slice(0, 7).filter((id) => !REMOVED.includes(id));
		expect(list.map(({ id }) => id)).toEqual(released.reverse());
		for (const item of list) expect(item.pubDate.getTime()).toBeLessThanOrEqual(now.getTime());
		const times = list.map(({ pubDate }) => pubDate.getTime());
		expect(times).toEqual([...times].sort((a, b) => b - a));
	});

	it('holds at most 30 items and stops growing when every heart is out', () => {
		const late = items('2027-06-01T00:00:00Z');
		expect(late).toHaveLength(PINTEREST_MAX_ITEMS);
		expect(late[0].id).toBe(PINTEREST_ORDER.at(-1));
		expect(items('2028-01-01T00:00:00Z')).toEqual(late);
	});

	it('gives every heart a stable guid, a ref=pinterest link and its pin image', () => {
		const [item] = items('2026-10-21T06:00:00Z');
		expect(item.guid).toBe('https://juleflet.dk/hjerte/classic-3x3/#pin-1');
		expect(item.link).toBe('https://juleflet.dk/hjerte/classic-3x3/?ref=pinterest');
		expect(new URL(item.link).searchParams.get('ref')).toBe('pinterest');
		expect(item.image).toBe('https://juleflet.dk/og/pins/classic-3x3.png');
		expect(item.title).toBe('Navn classic-3x3 – flettet julehjerte');
		// The same heart has the same guid in every later build.
		const later = items('2026-11-15T06:00:00Z').find(({ id }) => id === 'classic-3x3')!;
		expect(later.guid).toBe(item.guid);
		expect(later.pubDate).toEqual(item.pubDate);
	});
});

describe('descriptions', () => {
	it('strips link markup and ends with the call to action', () => {
		const text = pinterestDescription('Af [Prince](https://www.instagram.com/p/x/) og [Johan](https://johansjulehjerter.dk/).');
		expect(text).toBe(`Af Prince og Johan.\n\n${PINTEREST_CALL_TO_ACTION}`);
	});

	it('cuts a long paragraph at a sentence end within 500 characters', () => {
		const sentence = 'Dette er en sætning om hjertet, som er ret lang. ';
		const text = pinterestDescription(sentence.repeat(20));
		expect(text.length).toBeLessThanOrEqual(PINTEREST_DESCRIPTION_MAX);
		const [prose, cta] = text.split('\n\n');
		expect(cta).toBe(PINTEREST_CALL_TO_ACTION);
		expect(prose.endsWith('lang.')).toBe(true);
		expect(text.length).toBeGreaterThan(PINTEREST_DESCRIPTION_MAX - sentence.length - 1);
	});

	it('keeps every real heart within the limit', async () => {
		const { HEART_DESCRIPTIONS } = await import('$lib/data/heartDescriptions');
		for (const id of GALLERY) {
			const text = pinterestDescription(HEART_DESCRIPTIONS[id].da);
			expect(text.length, id).toBeLessThanOrEqual(PINTEREST_DESCRIPTION_MAX);
			expect(text, id).not.toMatch(/\]\(https?:/);
			expect(text.split('\n\n')[0].length, id).toBeGreaterThan(50);
		}
	});

	it('is just the call to action without a paragraph', () => {
		expect(pinterestDescription(null)).toBe(PINTEREST_CALL_TO_ACTION);
	});
});

describe('the XML', () => {
	const parse = (xml: string) => {
		const doc = new DOMParser().parseFromString(xml, 'application/xml');
		expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
		return doc;
	};

	it('escapes the five XML characters', () => {
		expect(escapeXml(`a & b < c > d "e" 'f'`)).toBe('a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;');
	});

	it('is a valid empty channel before the first release', () => {
		const doc = parse(pinterestFeedXml([], new Date('2026-10-20T12:00:00Z')));
		expect(doc.documentElement.getAttribute('version')).toBe('2.0');
		expect(doc.getElementsByTagName('item')).toHaveLength(0);
		const self = doc.getElementsByTagNameNS('http://www.w3.org/2005/Atom', 'link')[0];
		expect(self.getAttribute('href')).toBe('https://juleflet.dk/pinterest.xml');
		expect(self.getAttribute('rel')).toBe('self');
	});

	it('carries names with markup characters intact and the image twice', () => {
		const list = pinterestItems({
			schedule: [{ id: 'classic-3x3', day: 0 }],
			now: new Date('2026-10-22T00:00:00Z'),
			heart: () => ({ name: 'Rød & <hvid> "hjerte"', description: 'Et [link](https://x.dk/?a=1&b=2) & mere.' }),
			imageLength: () => 54321
		});
		const doc = parse(pinterestFeedXml(list, new Date('2026-10-22T00:00:00Z')));
		const item = doc.getElementsByTagName('item')[0];
		const text = (tag: string) => item.getElementsByTagName(tag)[0].textContent;
		expect(text('title')).toBe('Rød & <hvid> "hjerte" – flettet julehjerte');
		expect(text('description')).toBe(`Et link & mere.\n\n${PINTEREST_CALL_TO_ACTION}`);
		expect(text('pubDate')).toBe('Wed, 21 Oct 2026 05:00:00 GMT');
		const guid = item.getElementsByTagName('guid')[0];
		expect(guid.getAttribute('isPermaLink')).toBe('false');
		const enclosure = item.getElementsByTagName('enclosure')[0];
		expect(enclosure.getAttribute('url')).toBe('https://juleflet.dk/og/pins/classic-3x3.png');
		expect(enclosure.getAttribute('type')).toBe('image/png');
		expect(enclosure.getAttribute('length')).toBe('54321');
		const media = item.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'content')[0];
		expect(media.getAttribute('url')).toBe('https://juleflet.dk/og/pins/classic-3x3.png');
		expect(media.getAttribute('medium')).toBe('image');
	});
});
