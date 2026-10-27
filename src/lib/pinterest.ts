/**
 * The daily Pinterest feed (/pinterest.xml, docs/PINTEREST.md).
 *
 * Pinterest's "Auto-publish" polls an RSS 2.0 feed about once a day and makes
 * one Pin per item it has not seen before (by guid). The feed releases one
 * gallery heart a day on a fixed schedule: heart number i of PINTEREST_ORDER
 * appears at 07:00 Danish time on PINTEREST_START_DATE + i days. The site is
 * static, so a heart shows up at the first build after its time; the deploy
 * workflow rebuilds every morning for that.
 *
 * Everything here is pure: the route passes in the build's clock, the hearts'
 * names and descriptions and the image sizes.
 */
import { SITE_URL } from '$lib/config';
import { heartPath } from '$lib/i18n/routes';
import { PIN_IMAGE_HEIGHT, PIN_IMAGE_WIDTH, pinImagePath } from '$lib/pinImage';
import { plainDescription } from '$lib/utils/descriptionLinks';
import { truncateAtSentence } from '$lib/utils/text';

/** The day the first heart is pinned, a date in Danish time. */
export const PINTEREST_START_DATE = '2026-10-21';

/** The hour of the day, Danish time, at which each day's heart is released. */
export const PINTEREST_RELEASE_HOUR = 7;

/** At most this many items in the feed, newest first. */
export const PINTEREST_MAX_ITEMS = 30;

/** Pinterest's limit on a Pin description, in characters. */
export const PINTEREST_DESCRIPTION_MAX = 500;

/** The last line of every Pin description. */
export const PINTEREST_CALL_TO_ACTION = 'Hent skabelonen gratis på juleflet.dk';

/**
 * The round of the schedule, part of every guid. Pinterest never pins a guid
 * twice, so a later round (say English pages) needs a new round number.
 */
export const PINTEREST_ROUND = 1;

/** The feed's own URL. */
export const PINTEREST_FEED_URL = `${SITE_URL}/pinterest.xml`;

/** The most visited hearts, which go first. */
export const PINTEREST_FIRST = ['classic-3x3', 'gaver', 'jul', 'juletrae', 'stjerne-ramme', 'ramme'];

/**
 * The order the hearts are pinned in, one a day from PINTEREST_START_DATE.
 * Frozen (made once by interleaveByCategory from hearts.json as it was on
 * 2026-10-21, after the feed's first day) so that editing the gallery never moves a heart that is already
 * out to another day: a heart removed from the gallery leaves its day empty,
 * and a heart added to the gallery is pinned after the last of these
 * (pinterestSchedule). Append new hearts here rather than reorder, or insert one
 * only after the day it is (docs/PINTEREST.md): the five text hearts of
 * 2026-10-22 went in that way, at days 12, 25, 45, 57 and 70, spread out
 * before the new year, MOR & FAR between Drageskæl and Dag og nat, which Fliser
 * had made two of one category. When Khatam, Stjernegitter and Stjerner og kors
 * moved to Mønstre the same day, three swaps of hearts not yet out (days 62/63,
 * 68/69 and 65/72) kept every day's neighbours of another category. Kogle left
 * the gallery on 2026-10-27, its own day (6); it stays here so that every later
 * heart keeps its day.
 */
export const PINTEREST_ORDER: readonly string[] = [
	'classic-3x3', 'juletrae', 'circle', 'gaver', 'balls', 'jul',
	'kogle', 'stjerne-ramme', 'plus', 'ramme', 'plus3', 'stjerne',
	'god-jul', 'amy-weave-1', 'flower', 'amy-weave-2', 'triple-heart', 'amy-rosette',
	'5star', 'amy-pattern', 'venus', 'amy-flowering', 'simple-5star', 'amy-pinecone',
	'h4h2', 'tak', 'alhambra', 'angel', 'squares', 'sun', 'ni-hjerter-i-tern',
	'sildeben', 'snowflake', 'puslespil', 'fire-stjerner', 'permo-sol', 'koelbuer', 'nemt-hjerte',
	'roserude', 'santa', 'hanefod', 'explosion', 'flyvendegaes', 'mor-og-barn',
	'origami', 'nihon', 'drageskael', 'hjerte-i-hjerte-i-hjerte', 'mor-far', 'dagognat', 'hermanngitter',
	'lilje1', 'tragt', 'davidsstjerne-circ', 'boelgebrud', 'ball', 'glaskuppel',
	'lilje2', 'hvirvel', 'david4', 'jul-2026', 'permo-kroge', 'fisk',
	'permo-draaber', 'khatam', 'tulipan', 'permo-cirkler', 'fiskeskael', 'stjernerogkors',
	'boelger', 'stjernegitter', 'roed-blomst', 'blomster-hjerte', 'jul-tern', 'skraa-kryds',
	'hjertekloever', 'fejlternet', 'firkloever-hjerte', 'gitterhjerte', 'kloeverblad-hjerte', 'cirkelhjerte',
	'groen-stjerne', 'firkanthjerte', 'hjerte-paa-hjerte'
];

/** A gallery category as hearts.json lists it. */
export interface PinterestCategory {
	id: string;
	hearts: readonly string[];
}

/**
 * The hearts of all categories in one sequence where no two neighbours share a
 * category (whenever that is possible), the `first` hearts as early as that
 * allows, the rest spread out so each category's hearts are evenly spaced
 * through the sequence, each in its gallery order. Deterministic.
 */
export function interleaveByCategory(categories: readonly PinterestCategory[], first: readonly string[]): string[] {
	const categoryOf = new Map<string, string>();
	for (const category of categories) for (const id of category.hearts) categoryOf.set(id, category.id);
	const firsts = first.filter((id) => categoryOf.has(id));
	// The rest by even spacing: heart k of a category with n hearts sits at (k + ½)/n.
	const spread = categories.flatMap((category, c) => {
		const rest = category.hearts.filter((id) => !firsts.includes(id));
		return rest.map((id, k) => ({ id, key: (k + 0.5) / rest.length, c }));
	});
	spread.sort((a, b) => a.key - b.key || a.c - b.c);
	const remaining = [...firsts, ...spread.map(({ id }) => id)];

	// Can `rest` be lined up without equal neighbours, its first not in `prev`'s category?
	const feasible = (rest: string[], prev: string | undefined) => {
		const counts = new Map<string, number>();
		for (const id of rest) counts.set(categoryOf.get(id)!, (counts.get(categoryOf.get(id)!) ?? 0) + 1);
		return [...counts].every(([cat, n]) => n <= (cat === prev ? Math.floor(rest.length / 2) : Math.ceil(rest.length / 2)));
	};

	const order: string[] = [];
	let prev: string | undefined;
	while (remaining.length) {
		let pick = remaining.findIndex((id, i) => {
			const cat = categoryOf.get(id);
			return cat !== prev && feasible(remaining.filter((_, j) => j !== i), cat);
		});
		if (pick < 0) pick = Math.max(0, remaining.findIndex((id) => categoryOf.get(id) !== prev));
		const [id] = remaining.splice(pick, 1);
		order.push(id);
		prev = categoryOf.get(id);
	}
	return order;
}

/** A heart and the day (0 = PINTEREST_START_DATE) it is pinned. */
export interface ScheduledHeart {
	id: string;
	day: number;
}

/**
 * The gallery's hearts with their days: PINTEREST_ORDER's hearts that are
 * still in the gallery on their own index, then any gallery heart the order
 * does not list, in gallery order, on the days after it.
 */
export function pinterestSchedule(galleryIds: readonly string[], order: readonly string[] = PINTEREST_ORDER): ScheduledHeart[] {
	const gallery = new Set(galleryIds);
	const listed = new Set(order);
	const scheduled = order.map((id, day) => ({ id, day })).filter(({ id }) => gallery.has(id));
	const extra = galleryIds.filter((id) => !listed.has(id)).map((id, i) => ({ id, day: order.length + i }));
	return [...scheduled, ...extra];
}

/**
 * The last Sunday of a month (0-based) of a year, as a day of the month: the
 * EU's summer time runs from 01:00 UTC on the last Sunday of March to 01:00
 * UTC on the last Sunday of October.
 */
function lastSunday(year: number, month: number): number {
	const last = new Date(Date.UTC(year, month + 1, 0));
	return last.getUTCDate() - last.getUTCDay();
}

/** The instant a wall-clock hour on a date (YYYY-MM-DD) is in Copenhagen. */
export function copenhagenTime(date: string, hour: number): Date {
	const [year, month, day] = date.split('-').map(Number);
	const asUtc = Date.UTC(year, month - 1, day, hour);
	const summerStart = Date.UTC(year, 2, lastSunday(year, 2), 1);
	const summerEnd = Date.UTC(year, 9, lastSunday(year, 9), 1);
	// Standard time is UTC+1, summer time UTC+2. (The ambiguous and skipped
	// hours around 02:00-03:00 on the change days never concern 07:00.)
	const summer = asUtc - 2 * 3600e3 >= summerStart && asUtc - 2 * 3600e3 < summerEnd;
	return new Date(asUtc - (summer ? 2 : 1) * 3600e3);
}

/** The date (YYYY-MM-DD) `days` days after `date`. */
export function addDays(date: string, days: number): string {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** When the heart of day `day` is released. */
export function releaseTime(day: number, start = PINTEREST_START_DATE): Date {
	return copenhagenTime(addDays(start, day), PINTEREST_RELEASE_HOUR);
}

/**
 * A Pin's description: the heart's paragraph as plain text (links reduced to
 * their words), cut at a sentence end so that it and the call to action fit
 * in Pinterest's 500 characters.
 */
export function pinterestDescription(description: string | null): string {
	const room = PINTEREST_DESCRIPTION_MAX - PINTEREST_CALL_TO_ACTION.length - 2;
	const prose = truncateAtSentence(plainDescription(description ?? '').replace(/\s+/g, ' '), room);
	return prose ? `${prose}\n\n${PINTEREST_CALL_TO_ACTION}` : PINTEREST_CALL_TO_ACTION;
}

/** What the feed needs to know about a heart. */
export interface PinterestHeart {
	/** The Danish name ($lib/utils/heartName). */
	name: string;
	/** The Danish paragraph, with any [text](url) links. */
	description: string | null;
}

export interface PinterestItem {
	id: string;
	title: string;
	description: string;
	link: string;
	guid: string;
	pubDate: Date;
	image: string;
	imageLength: number;
}

/**
 * The feed's items at `now`: every scheduled heart whose release time has
 * come, newest first, at most PINTEREST_MAX_ITEMS.
 */
export function pinterestItems({
	schedule,
	now,
	heart,
	imageLength,
	start = PINTEREST_START_DATE
}: {
	schedule: readonly ScheduledHeart[];
	now: Date;
	heart: (id: string) => PinterestHeart;
	imageLength: (id: string) => number;
	start?: string;
}): PinterestItem[] {
	return schedule
		.map(({ id, day }) => ({ id, pubDate: releaseTime(day, start) }))
		.filter(({ pubDate }) => pubDate.getTime() <= now.getTime())
		.sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime())
		.slice(0, PINTEREST_MAX_ITEMS)
		.map(({ id, pubDate }) => {
			const { name, description } = heart(id);
			const page = `${SITE_URL}${heartPath(id, 'da')}`;
			return {
				id,
				title: `${name} – flettet julehjerte`,
				description: pinterestDescription(description),
				link: `${page}?ref=pinterest`,
				guid: `${page}#pin-${PINTEREST_ROUND}`,
				pubDate,
				image: `${SITE_URL}${pinImagePath(id)}`,
				imageLength: imageLength(id)
			};
		});
}

export function escapeXml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/** The RSS 2.0 document. With no items it is still a valid, empty channel. */
export function pinterestFeedXml(items: readonly PinterestItem[], now: Date): string {
	const x = escapeXml;
	const entries = items.map(
		(item) => `    <item>
      <title>${x(item.title)}</title>
      <link>${x(item.link)}</link>
      <description>${x(item.description)}</description>
      <guid isPermaLink="false">${x(item.guid)}</guid>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
      <enclosure url="${x(item.image)}" type="image/png" length="${item.imageLength}"/>
      <media:content url="${x(item.image)}" medium="image" type="image/png" width="${PIN_IMAGE_WIDTH}" height="${PIN_IMAGE_HEIGHT}"/>
    </item>
`
	);
	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Juleflet – flettede julehjerter</title>
    <link>${SITE_URL}/</link>
    <description>Et nyt flettet julehjerte hver dag: gratis skabeloner til print fra juleflet.dk.</description>
    <language>da</language>
    <atom:link href="${PINTEREST_FEED_URL}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
${entries.join('')}  </channel>
</rss>
`;
}
