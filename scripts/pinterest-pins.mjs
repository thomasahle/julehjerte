#!/usr/bin/env node
/**
 * Which Pin each gallery heart has on Pinterest, for the heart page's link to it
 * (src/lib/data/pinterest-pins.json, $lib/pinterestPins).
 *
 * Pinterest makes the Pins itself from our feed (/pinterest.xml, docs/PINTEREST.md) and
 * tells us nothing back, so this reads the board's public listing (the one Pinterest's
 * embedded board widget uses), which gives its newest Pins with their numbers and the pages
 * they link to. Hearts already in the file are kept: the listing only goes back so far.
 * Run it by hand now and then (`node scripts/pinterest-pins.mjs`) and commit the file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BOARD = 'https://widgets.pinterest.com/v3/pidgets/boards/lobais100/julehjerter-gratis-skabeloner/pins/';
const FILE = fileURLToPath(new URL('../src/lib/data/pinterest-pins.json', import.meta.url));

const response = await fetch(BOARD, { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!response.ok) throw new Error(`${BOARD}: ${response.status}`);
const listed = (await response.json())?.data?.pins;
if (!Array.isArray(listed)) throw new Error('The board listing has no Pins in it.');

const pins = JSON.parse(readFileSync(FILE, 'utf8'));
let added = 0;
for (const pin of listed) {
	const heart = String(pin.link ?? '').match(/^https:\/\/juleflet\.dk\/(?:en\/)?hjerte\/([a-z0-9-]+)\//)?.[1];
	if (!heart || !/^\d+$/.test(String(pin.id))) continue;
	if (pins[heart] !== String(pin.id)) added++;
	pins[heart] = String(pin.id);
}

const sorted = Object.fromEntries(Object.entries(pins).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(FILE, JSON.stringify(sorted, null, '\t') + '\n');
console.log(`${listed.length} Pins on the board, ${added} new; ${Object.keys(sorted).length} hearts in the file.`);
