import { describe, expect, it } from 'vitest';
import { LOBE_OUTLINE_COLORS } from './outlineColors';

describe('lobe outline colours', () => {
	// The canvas writes these into SVG attributes and the Tegning icons draw with
	// them, so they have to be literal hex a browser and a PDF both take — not a
	// palette token, which resolves to nothing outside the page's cascade.
	it('is a hex colour per lobe', () => {
		expect(LOBE_OUTLINE_COLORS.left).toMatch(/^#[0-9a-f]{6}$/);
		expect(LOBE_OUTLINE_COLORS.right).toMatch(/^#[0-9a-f]{6}$/);
	});

	// The whole point of the pair: cyan and orange are how the two lobes' cuts
	// stay apart where they cross in the woven square.
	it('gives the two lobes different colours', () => {
		expect(LOBE_OUTLINE_COLORS.left).not.toBe(LOBE_OUTLINE_COLORS.right);
	});

	// Pinned because the icons repeat them by eye from
	// docs/redesign/symmetri-ikoner.html: changing one here has to be a decision
	// about the drawing, not a stray edit that leaves the checkbox lying.
	it('keeps the editor pair', () => {
		expect(LOBE_OUTLINE_COLORS).toEqual({ left: '#00ddff', right: '#ff8800' });
	});
});
