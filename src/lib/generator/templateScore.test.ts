import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { templateScore, WEIGHTS, NECK_FREE } from './templateScore';
import type { Ring } from './geometry';
import star from '../../../static/generator/motifs/star.json';

describe('a template\'s score', () => {
	const colors = { left: '#ffffff', right: '#b91313' };
	const { design } = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'rays', scale: .7, gap: 3 });
	const scored = templateScore(design);

	it('is the weighted sum of its terms', () => {
		const { terms } = scored;
		expect(scored.score).toBeCloseTo(WEIGHTS.thin * terms.thin + WEIGHTS.hidden * terms.hidden + WEIGHTS.concave * terms.concave + WEIGHTS.tips * terms.tips + WEIGHTS.turns * terms.turns);
		expect(templateScore(design, { thin: 0, hidden: 0, concave: 0, tips: 0, turns: 0 }).score).toBe(0);
		expect(templateScore(design, { thin: 0, hidden: 2, concave: 0, tips: 0, turns: 0 }).score).toBeCloseTo(2 * terms.hidden);
	});

	it('measures the hidden cuts, where both lobes cut one line', () => {
		// The star in the rays: four straight hidden cuts from the circle to the star, some forty hundredths in all.
		expect(scored.terms.hidden).toBeGreaterThan(25);
		expect(scored.terms.hidden).toBeLessThan(60);
		expect(scored.terms.turns).toBeLessThan(2);
	});

	it('gives each strip of paper its concavity, a plain band none', () => {
		// Three strips a lobe: the outer ones nearly bands, the middle one round the star.
		expect(scored.strips).toHaveLength(design.gridSize.x + design.gridSize.y);
		for (const strip of scored.strips) expect(strip >= 0 && strip < 1).toBe(true);
		expect(Math.max(...scored.strips)).toBeGreaterThan(.1);
		expect(scored.terms.concave).toBeCloseTo(scored.strips.reduce((sum, c) => sum + c, 0));
	});

	it('counts each lobe\'s narrowest neck, narrowest first, a neck past NECK_FREE as nothing', () => {
		expect(scored.necks.length).toBeLessThanOrEqual(2);
		expect(scored.necks).toEqual([...scored.necks].sort((a, b) => a - b));
		expect(scored.terms.thin).toBeCloseTo(scored.necks.reduce((sum, mm) => sum + Math.max(0, Math.log(NECK_FREE / mm)), 0));
	});
});
