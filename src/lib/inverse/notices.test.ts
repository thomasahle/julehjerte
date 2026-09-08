import { describe, it, expect } from 'vitest';
import { ENGINE_NOTICES_KEY, ENGINE_NOTICES_PATH, engineNoticesHref } from './notices';
import { translations } from '$lib/i18n/translations';

/** Everything static/ serves out of the engine's directory, by served path. */
const shipped = import.meta.glob('/static/inverse/*.txt', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

describe('engine notices', () => {
	it('links to a file the site actually ships', () => {
		// The point of the link is that the notices are there to read, so a renamed
		// or forgotten file must fail here rather than 404 under an attribution.
		expect(shipped[`/static${ENGINE_NOTICES_PATH}`]).toBeTruthy();
	});

	it('applies the base path a subdirectory deploy would need', () => {
		expect(engineNoticesHref('')).toBe('/inverse/THIRD_PARTY_NOTICES.txt');
		expect(engineNoticesHref('/juleflet')).toBe('/juleflet/inverse/THIRD_PARTY_NOTICES.txt');
	});

	it('is named in both languages', () => {
		expect(translations.da[ENGINE_NOTICES_KEY]).toBeTruthy();
		expect(translations.en[ENGINE_NOTICES_KEY]).toBeTruthy();
	});
});
