/**
 * Gallery hearts for the laser tests, parsed the way the site parses them.
 */
import { vi } from 'vitest';
import type { HeartDesign } from '$lib/types/heart';
import { parseHeartFromSVG } from '$lib/utils/heartDesign';

export const gallerySvgs = import.meta.glob('/static/hearts/*.svg', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

export function loadHeart(name: string): HeartDesign {
	const svg = gallerySvgs[`/static/hearts/${name}.svg`];
	if (!svg) throw new Error(`No gallery heart ${name}`);
	// The parser reports the boundary fingers it adds; the tests do not care.
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		const design = parseHeartFromSVG(svg, `${name}.svg`);
		if (!design) throw new Error(`Could not parse ${name}`);
		return design;
	} finally {
		warn.mockRestore();
	}
}
