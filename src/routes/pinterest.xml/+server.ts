import fs from 'node:fs';
import { building } from '$app/environment';
import { ALL_HEART_IDS } from '$lib/data/categories';
import { heartDescription } from '$lib/data/heartDescriptions';
import heartMeta from '$lib/data/heart-meta.json';
import { pinImagePath } from '$lib/pinImage';
import { pinterestFeedXml, pinterestItems, pinterestSchedule } from '$lib/pinterest';
import { heartName, type Named } from '$lib/utils/heartName';
import type { RequestHandler } from './$types';

export const prerender = true;

const META = heartMeta as Record<string, Named>;

/**
 * The build's clock. PINTEREST_NOW (any date Date understands, e.g.
 * 2026-10-27T08:00:00+01:00) stands in for it, to see the feed as a later
 * day's build will write it (docs/PINTEREST.md).
 */
function buildTime(): Date {
	const override = process.env.PINTEREST_NOW;
	if (!override) return new Date();
	const now = new Date(override);
	if (Number.isNaN(now.getTime())) throw new Error(`PINTEREST_NOW is not a date: ${override}`);
	return now;
}

/** The PNG's size in bytes (the enclosure's length). The build has just drawn it. */
function imageLength(id: string): number {
	// Relative to the working directory: the project root, in the build and in tests.
	const file = `static${pinImagePath(id)}`;
	try {
		return fs.statSync(file).size;
	} catch {
		if (building) throw new Error(`pinterest.xml: ${file} is missing (scripts/generate-heart-data.mjs draws it)`);
		return 0;
	}
}

export const GET: RequestHandler = async () => {
	const now = buildTime();
	const items = pinterestItems({
		schedule: pinterestSchedule(ALL_HEART_IDS),
		now,
		heart: (id) => ({ name: heartName(META[id], 'da'), description: heartDescription(id, 'da') }),
		imageLength
	});
	return new Response(pinterestFeedXml(items, now), {
		headers: {
			'Content-Type': 'application/rss+xml; charset=utf-8',
			'Cache-Control': 'max-age=3600'
		}
	});
};
