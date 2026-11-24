#!/usr/bin/env node
/**
 * IndexNow: tells Bing (and the other search engines behind indexnow.org) which pages
 * changed in a deploy, so they fetch them now instead of at their next crawl.
 *
 * The deploy job (.github/workflows/deploy.yml) runs it twice:
 *
 *   node scripts/indexnow.mjs snapshot before.json   before the deploy: the live sitemap
 *   node scripts/indexnow.mjs submit before.json     after it: send what is new or changed
 *
 * A page counts as changed when it is new in the sitemap, gone from it, or its <lastmod>
 * moved. The sitemap dates the heart pages and the front page ($lib/server/lastModified);
 * the other pages carry no date, so a change to them alone sends nothing. A deploy that
 * changes no page's date (the daily rebuild) sends nothing either. Every page is sent when
 * the site did not serve the key before the deploy (the first run), and by hand with
 *
 *   node scripts/indexnow.mjs submit --all
 *
 * (add --dry-run to print the list without sending it). The key is not a secret: it only
 * proves that whoever sends the list also controls the site, by being served from it
 * (static/<key>.txt).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://juleflet.dk';
const KEY = '937308d8330b72d63dd1391e4f706d6d';
const KEY_URL = `${SITE}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A file on the live site, past the CDN's copy of it; null when it is not there. */
async function live(url) {
	const response = await fetch(`${url}?t=${Date.now()}`, { headers: { 'User-Agent': 'indexnow-deploy' } });
	return response.ok ? (await response.text()).trim() : null;
}

/** Each page in a sitemap with its <lastmod> ('' when it has none). */
export function pagesOf(sitemap) {
	const pages = {};
	for (const entry of sitemap.split('<url>').slice(1)) {
		const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
		if (loc) pages[loc] = entry.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? '';
	}
	return pages;
}

/** The pages that are new, gone, or dated differently between two sitemaps. */
export function changedPages(before, after) {
	return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((loc) => before[loc] !== after[loc]);
}

async function snapshot(file) {
	const sitemap = await live(`${SITE}/sitemap.xml`);
	const state = { keyLive: (await live(KEY_URL)) === KEY, pages: sitemap ? pagesOf(sitemap) : {} };
	writeFileSync(file, JSON.stringify(state));
	console.log(`${Object.keys(state.pages).length} pages live; key ${state.keyLive ? 'served' : 'not served yet'}.`);
}

async function submit(file, { all, dryRun }) {
	// The search engines fetch the key from the site, so wait until the deploy serves it.
	for (let tries = 0; (await live(KEY_URL)) !== KEY; tries++) {
		if (dryRun) break;
		if (tries >= 12) throw new Error(`${KEY_URL} does not serve the key.`);
		await sleep(10_000);
	}
	const sitemap = await live(`${SITE}/sitemap.xml`);
	if (!sitemap) throw new Error('The live site has no sitemap.');
	const after = pagesOf(sitemap);

	let before = null;
	if (!all) {
		try {
			before = JSON.parse(readFileSync(file, 'utf8'));
		} catch {
			throw new Error(`No snapshot from before the deploy at ${file}: nothing to compare with.`);
		}
	}
	const everything = all || !before.keyLive;
	const urlList = everything ? Object.keys(after) : changedPages(before.pages, after);
	if (!urlList.length) return console.log('No page changed: nothing to send.');
	console.log(`${everything ? 'Every page' : 'Changed pages'} (${urlList.length}):\n${urlList.join('\n')}`);
	if (dryRun) return;

	const response = await fetch(ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
		body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: KEY_URL, urlList })
	});
	// 200: taken. 202: taken, the key is still to be checked.
	if (response.status !== 200 && response.status !== 202) {
		throw new Error(`IndexNow answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
	}
	console.log(`IndexNow took the list (${response.status}).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const [command, ...rest] = process.argv.slice(2);
	const flags = { all: rest.includes('--all'), dryRun: rest.includes('--dry-run') };
	const file = rest.find((arg) => !arg.startsWith('--'));
	if (command === 'snapshot' && file) await snapshot(file);
	else if (command === 'submit' && (file || flags.all)) await submit(file, flags);
	else {
		console.error('Usage: indexnow.mjs snapshot <file> | submit <file> | submit --all [--dry-run]');
		process.exit(2);
	}
}
