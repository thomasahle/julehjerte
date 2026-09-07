/**
 * The hero's hanging-heart slots — docs/redesign/DESIGN.md §3 "Hero".
 *
 * A slot is a fixed position/size/ribbon/sway-delay inside the hero's hearts
 * block; only *which heart* hangs in it changes (the prerendered set is swapped
 * for a random one after hydration). Because the geometry never moves, the swap
 * is a pure cross-fade with no layout shift.
 *
 * Slots are listed in DOM order, i.e. longest ribbon first, so a long ribbon
 * passes *behind* the hearts that hang higher up.
 */
import type { Placed } from '$lib/landscape';

export interface HeroSlot {
	/** Absolute placement inside the hearts block (which is position: relative). */
	style: string;
	/** Heart width in px. */
	size: number;
	/** Visible ribbon length in px above the heart. */
	ribbon: number;
	/** Sway delay in seconds, so neighbours are out of step. */
	delay: number;
}

/** The five slots of the 640x560 desktop block (>= 900px). */
export const HERO_SLOTS_DESKTOP: readonly HeroSlot[] = [
	{ style: 'left: 230px; top: 0;', size: 96, ribbon: 300, delay: 4.4 },
	{ style: 'left: 470px; top: 0;', size: 125, ribbon: 240, delay: 3.5 },
	{ style: 'left: 300px; top: 0;', size: 170, ribbon: 120, delay: 1.4 },
	{ style: 'left: 40px; top: 0;', size: 220, ribbon: 40, delay: 0 },
	{ style: 'left: 500px; top: 0;', size: 140, ribbon: 26, delay: 2.6 }
];

/** The three slots of the stacked hero (< 900px): left, right, big one centred. */
export const HERO_SLOTS_MOBILE: readonly HeroSlot[] = [
	{ style: 'left: 4%; top: 0;', size: 96, ribbon: 130, delay: 1.4 },
	{ style: 'right: 4%; top: 0;', size: 90, ribbon: 96, delay: 2.6 },
	{ style: 'left: calc(50% - 85px); top: 0;', size: 170, ribbon: 40, delay: 0 }
];

/** Gold stars in the stacked hero's sky overlay: [x, y, scale] in a 420x300 box. */
export const HERO_SKY_STARS: readonly Placed[] = [
	[40, 42, 0.5],
	[112, 22, 0.38],
	[332, 30, 0.5],
	[392, 92, 0.4],
	[58, 252, 0.4],
	[372, 242, 0.45],
	[214, 18, 0.34]
];

/** White snow dots in the same overlay: [cx, cy, r]. */
export const HERO_SKY_DOTS: readonly Placed[] = [
	[150, 30, 2.5],
	[300, 62, 2],
	[28, 172, 2],
	[402, 200, 2.5],
	[200, 252, 2],
	[250, 60, 1.8]
];
