import { describe, expect, it } from 'vitest';
import { generate } from './generate';
import { cutExcesses, templateScore, WEIGHTS, NECK_FREE } from './templateScore';
import type { Ring } from './geometry';
import type { Finger, Vec } from '$lib/types/heart';
import star from '../../../static/generator/motifs/star.json';

describe('a template\'s score', () => {
	const colors = { left: '#ffffff', right: '#b91313' };
	const { design } = generate({ mode: 'figure', name: 'Star', contours: star.contours as Ring[], colors, style: 'rays', scale: .7, gap: 3 });
	const scored = templateScore(design);

	it('is the weighted sum of its terms', () => {
		const { terms } = scored;
		expect(scored.score).toBeCloseTo(WEIGHTS.thin * terms.thin + WEIGHTS.hidden * terms.hidden + WEIGHTS.winding * terms.winding + WEIGHTS.tips * terms.tips + WEIGHTS.turns * terms.turns);
		expect(templateScore(design, { thin: 0, hidden: 0, winding: 0, tips: 0, turns: 0 }).score).toBe(0);
		expect(templateScore(design, { thin: 0, hidden: 2, winding: 0, tips: 0, turns: 0 }).score).toBeCloseTo(2 * terms.hidden);
	});

	it('measures the hidden cuts, where both lobes cut one line', () => {
		// The star in the rays: four straight hidden cuts from the circle to the star, some forty hundredths in all.
		expect(scored.terms.hidden).toBeGreaterThan(25);
		expect(scored.terms.hidden).toBeLessThan(60);
		expect(scored.terms.turns).toBeLessThan(2);
	});

	it('says how much longer each cut is than the straight line between its ends, and their mean', () => {
		// Three strips a lobe: its two cuts go round the circle and in to the star, longer than straight but none twice
		// as long; the square's two sides are cuts too, and straight.
		expect(scored.cuts).toHaveLength(design.fingers.length);
		expect(scored.cuts).toEqual(cutExcesses(design));
		expect(scored.cuts.filter(cut => cut === 0)).toHaveLength(4);
		for (const cut of scored.cuts.filter(cut => cut > 0)) expect(cut > .05 && cut < 1).toBe(true);
		expect(scored.terms.winding).toBeCloseTo(scored.cuts.reduce((sum, c) => sum + c, 0) / scored.cuts.length);
	});

	it('finds no winding in straight cuts, and half a circle 57% longer than its chord', () => {
		const line = (lobe: 'left' | 'right', a: Vec, b: Vec): Finger => ({ id: `${lobe}${a.x}${a.y}`, lobe,
			segments: [{ p0: a, p1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 }, p2: { x: a.x + (b.x - a.x) * 2 / 3, y: a.y + (b.y - a.y) * 2 / 3 }, p3: b }] });
		const straight = [line('left', { x: 0, y: 50 }, { x: 100, y: 50 }), line('right', { x: 50, y: 0 }, { x: 50, y: 100 })];
		expect(cutExcesses({ ...design, gridSize: { x: 2, y: 2 }, fingers: straight })).toEqual([0, 0]);
		// The left lobe's cut as half a circle on the square's top side, in two quarter arcs.
		const k = 50 * .5522847498;
		const arc: Finger = { id: 'arc', lobe: 'left', segments: [
			{ p0: { x: 0, y: 0 }, p1: { x: 0, y: k }, p2: { x: 50 - k, y: 50 }, p3: { x: 50, y: 50 } },
			{ p0: { x: 50, y: 50 }, p1: { x: 50 + k, y: 50 }, p2: { x: 100, y: k }, p3: { x: 100, y: 0 } }] };
		const [round, plain] = cutExcesses({ ...design, gridSize: { x: 2, y: 2 }, fingers: [arc, straight[1]] });
		expect(round).toBeCloseTo(Math.PI / 2 - 1, 2);
		expect(plain).toBe(0);
	});

	it('counts each lobe\'s narrowest neck, narrowest first, a neck past NECK_FREE as nothing', () => {
		expect(scored.necks.length).toBeLessThanOrEqual(2);
		expect(scored.necks).toEqual([...scored.necks].sort((a, b) => a - b));
		expect(scored.terms.thin).toBeCloseTo(scored.necks.reduce((sum, mm) => sum + Math.max(0, Math.log(NECK_FREE / mm)), 0));
	});
});
