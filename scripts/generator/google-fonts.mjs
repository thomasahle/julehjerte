#!/usr/bin/env node
/**
 * Rebuilds static/generator/google-fonts.json, the families the text
 * generator's font search finds: every Google font Fontsource serves with
 * Latin letters, most popular first (Google Fonts' own ranking), each with the
 * weight the generator fetches, the boldest up to 800 (ExtraBold), as thin
 * strokes are hard to cut and the heaviest leave little room in the letters.
 * The files themselves are fetched by the visitor's browser from Fontsource's
 * copy on jsDelivr (see src/lib/generator/googleFonts.ts).
 *
 *   node scripts/generator/google-fonts.mjs
 */
import { writeFileSync } from 'node:fs';

const headers = { 'User-Agent': 'juleflet-font-index/1.0' };
const json = async (url) => {
	const response = await fetch(url, { headers });
	if (!response.ok) throw new Error(`${url}: ${response.status}`);
	// Google's metadata may start with a line guarding against JSON hijacking.
	return JSON.parse((await response.text()).replace(/^\)\]\}'\s*/, ''));
};

const families = await json('https://api.fontsource.org/v1/fonts');
const ranking = await json('https://fonts.google.com/metadata/fonts');
const rank = new Map(ranking.familyMetadataList.map((f) => [f.family, f.popularity]));

const weight = (weights) => {
	const bold = weights.filter((w) => w <= 800);
	return bold.length ? Math.max(...bold) : Math.min(...weights);
};
const index = families
	.filter((f) => f.type === 'google' && f.subsets.includes('latin') && f.category !== 'icons' && f.styles.includes('normal'))
	.sort((a, b) => (rank.get(a.family) ?? Infinity) - (rank.get(b.family) ?? Infinity) || a.family.localeCompare(b.family))
	.map((f) => [f.id, f.family, weight(f.weights)]);

writeFileSync(new URL('../../static/generator/google-fonts.json', import.meta.url), JSON.stringify(index) + '\n');
console.log(`Wrote ${index.length} families`);
