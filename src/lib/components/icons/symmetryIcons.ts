/**
 * The nine glyphs of the editor's symmetry rows — "Familie A" in
 * docs/redesign/symmetri-ikoner.html, which the owner chose.
 *
 * One table, not nine files: the glyphs differ only in their path data, so a
 * row × mode lookup is the whole difference between them and SymmetryIcon can
 * stay a single component. The `d` strings are copied verbatim from the
 * `<symbol>`s in that page (a-curve-*, a-lobe-*, a-both-*), including the
 * absence of mirror axes and centre dots — those were drawn and then removed
 * on purpose, so nothing here should add them back.
 *
 * Each row draws its own subject, and the three modes change only the second
 * cut, which is the point: Fra leaves it free, Sym mirrors the first, Anti
 * turns it.
 */

/** The three rows: within one curve, within one lobe, between the two lobes. */
export type SymmetryIconRow = 'curve' | 'lobe' | 'lobes';

/** The three states of a row, as in the segmented control. */
export type SymmetryIconMode = 'off' | 'sym' | 'anti';

export interface SymmetryIconPath {
	/** SVG path data on the 24-unit grid the rest of the editor's icons use. */
	d: string;
	/**
	 * The shape the cuts sit in (a lobe, the heart), drawn faint so the cuts —
	 * what the setting is about — are read first. The page's `.soft` class.
	 */
	soft?: boolean;
	/** Placement of a cut that is drawn in its own lobe's coordinates. */
	transform?: string;
	/**
	 * Drawn in the accent colour instead of `currentColor` — the second colour
	 * that says which cut follows which. No Familie A glyph uses it, but the
	 * accent is part of the icon contract (see SymmetryIcon), so the table can
	 * carry a two-coloured glyph without the control's CSS changing.
	 */
	accent?: boolean;
}

/**
 * The two lobes of "Mellem lapper" meet at the bottom point of the heart, each
 * turned a quarter turn from the fold, so both cuts are drawn in the same
 * upright coordinates and placed by these.
 */
const LEFT_LOBE = 'translate(12 22.5) rotate(-45) scale(1.1)';
const RIGHT_LOBE = 'translate(12 22.5) rotate(45) scale(1.1)';

/** The lobe of "Inden i lap": a rounded strip standing on the fold. */
const LOBE_OUTLINE = 'M4 22 V9 A8 8 0 0 1 20 9 V22';

/** The heart of "Mellem lapper": two lobes over the woven square. */
const HEART_OUTLINE = 'M12 22.5 L4.22 14.72 A5.5 5.5 0 0 1 12 6.94 A5.5 5.5 0 0 1 19.78 14.72 Z';

/** The first cut, the one the second follows in Sym and Anti. */
const LOBE_FIRST_CUT = 'M9 22 V18 C9 16.5 7 16 7 14.5 C7 13 9 12.5 9 11';
const LOBES_FIRST_CUT = 'M4 0 V-2 C4 -4 1 -4.5 1 -6.5 C1 -8.5 4 -9 4 -9.5';

export const SYMMETRY_ICON_PATHS: Record<
	SymmetryIconRow,
	Record<SymmetryIconMode, SymmetryIconPath[]>
> = {
	// One cut, alone: its second half is free, repeats the first (a stack of
	// identical bows), or is turned about the middle (an S).
	curve: {
		off: [
			{ d: 'M12 22 C12 20 15.5 19 15.5 17 C15.5 15 12 15 12 13 C12 11 13.5 10 13.5 8 C13.5 6 12 4 12 2' }
		],
		sym: [
			{
				d: 'M12 22 C12 20.5 16.5 19.5 16.5 17 C16.5 14.5 12 14 12 12 C12 10 16.5 9.5 16.5 7 C16.5 4.5 12 3.5 12 2'
			}
		],
		anti: [
			{
				d: 'M12 22 C12 20.5 16.5 19.5 16.5 17 C16.5 14.5 12 14 12 12 C12 10 7.5 9.5 7.5 7 C7.5 4.5 12 3.5 12 2'
			}
		]
	},
	// One lobe with two cuts: the second is plain, mirrored in the lobe's centre
	// line, or turned about the lobe's middle so its bow changes ends.
	lobe: {
		off: [
			{ d: LOBE_OUTLINE, soft: true },
			{ d: LOBE_FIRST_CUT },
			{ d: 'M15 22 V11' }
		],
		sym: [
			{ d: LOBE_OUTLINE, soft: true },
			{ d: LOBE_FIRST_CUT },
			{ d: 'M15 22 V18 C15 16.5 17 16 17 14.5 C17 13 15 12.5 15 11' }
		],
		anti: [
			{ d: LOBE_OUTLINE, soft: true },
			{ d: LOBE_FIRST_CUT },
			{ d: 'M15 11 V15 C15 16.5 17 17 17 18.5 C17 20 15 20.5 15 22' }
		]
	},
	// Both lobes: two templates, one template mirrored into both, or the cut
	// crossing to the other side with its bow turned towards the lobe.
	lobes: {
		off: [
			{ d: HEART_OUTLINE, soft: true },
			{ d: LOBES_FIRST_CUT, transform: LEFT_LOBE },
			{ d: 'M-4 0 V-9.5', transform: RIGHT_LOBE }
		],
		sym: [
			{ d: HEART_OUTLINE, soft: true },
			{ d: LOBES_FIRST_CUT, transform: LEFT_LOBE },
			{ d: 'M-4 0 V-2 C-4 -4 -1 -4.5 -1 -6.5 C-1 -8.5 -4 -9 -4 -9.5', transform: RIGHT_LOBE }
		],
		anti: [
			{ d: HEART_OUTLINE, soft: true },
			{ d: LOBES_FIRST_CUT, transform: LEFT_LOBE },
			{ d: 'M-6 0 V-3 C-6 -5 -9 -5.5 -9 -7.5 C-9 -9 -6 -9.3 -6 -9.5', transform: RIGHT_LOBE }
		]
	}
};

/** Every row, in the order the panel shows them. */
export const SYMMETRY_ICON_ROWS: SymmetryIconRow[] = ['curve', 'lobe', 'lobes'];

/** Every mode, in the order the segmented control shows them. */
export const SYMMETRY_ICON_MODES: SymmetryIconMode[] = ['off', 'sym', 'anti'];
